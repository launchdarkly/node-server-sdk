var fs = require('fs');
var tmp = require('tmp');
var dataKind = require('../versioned_data_kind');
const { asyncify, asyncifyNode, sleepAsync } = require('./async_utils');

var LaunchDarkly = require('../index');
var FileDataSource = require('../file_data_source');
var InMemoryFeatureStore = require('../feature_store');

var flag1Key = 'flag1';
var flag2Key = 'flag2';
var flag2Value = 'value2';
var segment1Key = 'seg1';

var flag1 = {
  "key": flag1Key,
  "on": true,
  "fallthrough": {
    "variation": 2
  },
  "variations": [ "fall", "off", "on" ]
};

var segment1 = {
  "key": segment1Key,
  "include": ["user1"]
};

var flagOnlyJson = `
{
  "flags": {
    "${flag1Key}": ${ JSON.stringify(flag1) }
  }
}`;

var segmentOnlyJson = `
{
  "segments": {
    "${segment1Key}": ${ JSON.stringify(segment1) }
  }
}`;

var allPropertiesJson = `
{
  "flags": {
    "${flag1Key}": ${ JSON.stringify(flag1) }
  },
  "flagValues": {
    "${flag2Key}": "${flag2Value}"
  },
  "segments": {
    "${segment1Key}": ${ JSON.stringify(segment1) }
  }
}`;

var allPropertiesYaml = `
flags:
  ${flag1Key}:
    key: ${flag1Key}
    on: true
    fallthrough:
      variation: 2
    variations:
      - fall
      - off
      - on
flagValues:
  ${flag2Key}: "${flag2Value}"
segments:
  ${segment1Key}:
    key: ${segment1Key}
    include:
      - user1
`;

describe('FileDataSource', function() {
  var store;
  var dataSources = [];
  var logger;

  beforeEach(() => {
    store = InMemoryFeatureStore();
    dataSources = [];
    logger = {
      info: jest.fn(),
      warn: jest.fn()
    };
  });

  afterEach(() => {
    dataSources.forEach(s => s.close());
  });

  function makeTempFile(content) {
    return asyncifyNode(tmp.file)
      .then(path => {
        return replaceFileContent(path, content).then(() => path);
      });
  }

  function replaceFileContent(path, content) {
    return asyncifyNode(cb => fs.writeFile(path, content, cb));
  }

  function setupDataSource(options) {
    var factory = FileDataSource(Object.assign({ logger: logger }, options));
    var ds = factory({ featureStore: store });
    dataSources.push(ds);
    return ds;
  }

  function sorted(a) {
    var a1 = Array.from(a);
    a1.sort();
    return a1;
  }

  it('does not load flags prior to start', async () => {
    var path = await makeTempFile('{"flagValues":{"key":"value"}}');
    var fds = setupDataSource({ paths: [path] });

    expect(fds.initialized()).toBe(false);
    expect(await asyncify(cb => store.initialized(cb))).toBe(false);
    expect(await asyncify(cb => store.all(dataKind.features, cb))).toEqual({});
    expect(await asyncify(cb => store.all(dataKind.segments, cb))).toEqual({});
  });

  async function testLoadAllProperties(content) {
    var path = await makeTempFile(content);
    var fds = setupDataSource({ paths: [path] });
    await asyncify(fds.start);

    expect(fds.initialized()).toBe(true);
    expect(await asyncify(cb => store.initialized(cb))).toBe(true);
    var items = await asyncify(cb => store.all(dataKind.features, cb));
    expect(sorted(Object.keys(items))).toEqual([ flag1Key, flag2Key ]);
    var flag = await asyncify(cb => store.get(dataKind.features, flag1Key, cb));
    expect(flag).toEqual(flag1);
    items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(items).toEqual({ seg1: segment1 });
  }

  it('loads flags on start - from JSON', () => testLoadAllProperties(allPropertiesJson));

  it('loads flags on start - from YAML', () => testLoadAllProperties(allPropertiesYaml));

  it('does not load if file is missing', async () => {
    var fds = setupDataSource({ paths: ['no-such-file'] });
    await asyncify(fds.start);

    expect(fds.initialized()).toBe(false);
    expect(await asyncify(cb => store.initialized(cb))).toBe(false);
  });

  it('does not load if file data is malformed', async () => {
    var path = await makeTempFile('{x');
    var fds = setupDataSource({ paths: [path] });
    await asyncify(fds.start);

    expect(fds.initialized()).toBe(false);
    expect(await asyncify(cb => store.initialized(cb))).toBe(false);
  });

  it('can load multiple files', async () => {
    var path1 = await makeTempFile(flagOnlyJson);
    var path2 = await makeTempFile(segmentOnlyJson);
    var fds = setupDataSource({ paths: [path1, path2] });
    await asyncify(fds.start);

    expect(fds.initialized()).toBe(true);
    expect(await asyncify(cb => store.initialized(cb))).toBe(true);

    var items = await asyncify(cb => store.all(dataKind.features, cb));
    expect(Object.keys(items)).toEqual([ flag1Key ]);
    items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(Object.keys(items)).toEqual([ segment1Key ]);
  });

  it('does not allow duplicate keys', async () => {
    var path1 = await makeTempFile(flagOnlyJson);
    var path2 = await makeTempFile(flagOnlyJson);
    var fds = setupDataSource({ paths: [path1, path2] });
    await asyncify(fds.start);

    expect(fds.initialized()).toBe(false);
    expect(await asyncify(cb => store.initialized(cb))).toBe(false);
  });

  it('does not reload modified file if auto-update is off', async () => {
    var path = await makeTempFile(flagOnlyJson);
    var fds = setupDataSource({ paths: [path] });
    await asyncify(fds.start);
    
    var items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(Object.keys(items).length).toEqual(0);

    await sleepAsync(200);
    await replaceFileContent(path, segmentOnlyJson);
    await sleepAsync(200);

    items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(Object.keys(items).length).toEqual(0);
  });

  it('reloads modified file if auto-update is on', async () => {
    var path = await makeTempFile(flagOnlyJson);
    var fds = setupDataSource({ paths: [path], autoUpdate: true });
    await asyncify(fds.start);
    
    var items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(Object.keys(items).length).toEqual(0);

    await sleepAsync(200);
    await replaceFileContent(path, segmentOnlyJson);
    await sleepAsync(4000); // the long wait here is to see if we get any spurious reloads (ch32123)

    items = await asyncify(cb => store.all(dataKind.segments, cb));
    expect(Object.keys(items).length).toEqual(1);

    // We call logger.warn() once for each reload. It should only have reloaded once, but for
    // unknown reasons it occasionally fires twice in Windows.
    expect(logger.warn.mock.calls.length).toBeGreaterThan(0);
    expect(logger.warn.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('evaluates simplified flag with client as expected', async () => {
    var path = await makeTempFile(allPropertiesJson);
    var factory = FileDataSource({ paths: [ path ]});
    var config = { updateProcessor: factory, sendEvents: false };
    var client = LaunchDarkly.init('dummy-key', config);
    var user = { key: 'userkey' };

    try {
      await client.waitForInitialization();
      var result = await client.variation(flag2Key, user, '');
      expect(result).toEqual(flag2Value);
    } finally {
      client.close();
    }
  });

  it('evaluates full flag with client as expected', async () => {
    var path = await makeTempFile(allPropertiesJson);
    var factory = FileDataSource({ paths: [ path ]});
    var config = { updateProcessor: factory, sendEvents: false };
    var client = LaunchDarkly.init('dummy-key', config);
    var user = { key: 'userkey' };

    try {
      await client.waitForInitialization();
      var result = await client.variation(flag1Key, user, '');
      expect(result).toEqual('on');
    } finally {
      client.close();
    }
  });
});