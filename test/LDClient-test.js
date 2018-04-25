var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');
var messages = require('../messages');

describe('LDClient', function() {

  var logger = {};

  var eventProcessor = {
    events: [],
    sendEvent: function(event) {
      eventProcessor.events.push(event);
    },
    flush: function(callback) {
      if (callback) {
        setImmediate(callback);
      } else {
        return Promise.resolve(null);
      }
    },
    close: function() {}
  };

  beforeEach(function() {
    logger.info = jest.fn();
    logger.warn = jest.fn();
    eventProcessor.events = [];
  });

  it('should trigger the ready event in offline mode', function() {
    var client = LDClient.init('sdk_key', {offline: true});
    var callback = jest.fn();
    client.on('ready', callback);
    process.nextTick(function() {
      expect(callback).toHaveBeenCalled();
    });
  });

  it('returns true for isOffline in offline mode', function(done) {
    var client = LDClient.init('sdk_key', {offline: true});
    client.on('ready', function() {
      expect(client.isOffline()).toEqual(true);
      done();
    });
  });

  it('allows deprecated method is_offline', function(done) {
    var client = LDClient.init('sdk_key', {offline: true, logger: logger});
    client.on('ready', function() {
      expect(client.is_offline()).toEqual(true);
      expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('is_offline', 'isOffline'));
      done();
    });
  });

  it('should correctly compute the secure mode hash for a known message and secret', function() {
    var client = LDClient.init('secret', {offline: true});
    var hash = client.secureModeHash({"key": "Message"});
    expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
  });

  it('allows deprecated method secure_mode_hash', function() {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    var hash = client.secure_mode_hash({"key": "Message"});
    expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
    expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('secure_mode_hash', 'secureModeHash'));
  });

  it('returns empty map for allFlags in offline mode and logs a message', function(done) {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    client.on('ready', function() {
      client.allFlags({key: 'user'}, function(err, result) {
        expect(result).toEqual({});
        expect(logger.info).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('allows deprecated method all_flags', function(done) {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    client.on('ready', function() {
      client.all_flags({key: 'user'}, function(err, result) {
        expect(result).toEqual({});
        expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('all_flags', 'allFlags'));
        done();
      });
    });
  });

  function createOnlineClientWithFlags(flagsMap) {
    var store = InMemoryFeatureStore();
    var allData = {};
    var dummyUri = 'bad';
    allData[dataKind.features.namespace] = flagsMap;
    store.init(allData);
    return LDClient.init('secret', {
      baseUri: dummyUri,
      streamUri: dummyUri,
      eventsUri: dummyUri,
      featureStore: store,
      eventProcessor: eventProcessor
    });
  }

  it('evaluates a flag with variation()', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    // Deliberately not waiting for ready event; the update processor is irrelevant for this test
    client.variation(flag.key, user, 'c', function(err, result) {
      expect(err).toBeNull();
      expect(result).toEqual('b');
      done();
    });
  });

  it('generates an event for an existing feature', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.variation(flag.key, user, 'c', function(err, result) {
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        user: user,
        variation: 1,
        value: 'b',
        default: 'c',
        trackEvents: true
      });
      done();
    });
  });

  it('generates an event for an unknown feature', function(done) {
    var client = createOnlineClientWithFlags({});
    var user = { key: 'user' };
    client.variation('flagkey', user, 'c', function(err, result) {
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: null,
        user: user,
        variation: null,
        value: 'c',
        default: 'c',
        trackEvents: null
      });
      done();
    });
  });

  it('generates an event for an existing feature even if user key is missing', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { name: 'Bob' };
    client.variation(flag.key, user, 'c', function(err, result) {
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        user: user,
        variation: null,
        value: 'c',
        default: 'c',
        trackEvents: true
      });
      done();
    });
  });

  it('generates an event for an existing feature even if user is null', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    client.variation(flag.key, null, 'c', function(err, result) {
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        user: null,
        variation: null,
        value: 'c',
        default: 'c',
        trackEvents: true
      });
      done();
    });
  });

  it('evaluates a flag with allFlags()', function(done) {
    var flag = {
      key: 'feature',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b']
    };
    var client = createOnlineClientWithFlags({ feature: flag });
    var user = { key: 'user' };
    client.allFlags(user, function(err, results) {
      expect(err).toBeNull();
      expect(results).toEqual({feature: 'b'});
      done();
    });
  });

  it('should not overflow the call stack when evaluating a huge number of flags', function(done) {
    var flagCount = 5000;
    var flags = {};
    for (var i = 0; i < flagCount; i++) {
      var key = 'feature' + i;
      var flag = {
        key: key,
        version: 1,
        on: false
      };
      flags[key] = flag;
    }
    var client = createOnlineClientWithFlags(flags);
    client.allFlags({key: 'user'}, function(err, result) {
      expect(err).toEqual(null);
      expect(Object.keys(result).length).toEqual(flagCount);
      done();
    });
  });
});
