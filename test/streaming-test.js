const { DiagnosticId, DiagnosticsManager } = require('../diagnostic_events');
const InMemoryFeatureStore = require('../feature_store');
const StreamProcessor = require('../streaming');
const dataKind = require('../versioned_data_kind');
const httpUtils = require('../utils/httpUtils');
const { promisifySingle, sleepAsync } = require('./async_utils');
const stubs = require('./stubs');

describe('StreamProcessor', () => {
  const sdkKey = 'SDK_KEY';

  function fakeEventSource() {
    var es = { handlers: {} };
    es.constructor = function(url, options) {
      es.url = url;
      es.options = options;
      this.addEventListener = (type, handler) => {
        es.handlers[type] = handler;
      };
      this.close = () => {
        es.closed = true;
      };
      es.instance = this;
    };
    return es;
  }

  function createProcessor(config, es, requestor, diagnosticsManager) {
    return StreamProcessor(sdkKey, config, requestor, diagnosticsManager, es.constructor);
  }

  function expectJsonError(err, config) {
    expect(err).not.toBe(undefined);
    expect(err.message).toEqual('Malformed JSON data in event stream');
    expect(config.logger.error).toHaveBeenCalled();
  }

  it('uses expected URL', function() {
    var config = { streamUri: 'http://test' };
    var es = fakeEventSource();
    var sp = createProcessor(config, es);
    sp.start();
    expect(es.url).toEqual(config.streamUri + '/all');
  });

  it('sets expected headers', function() {
    var config = { streamUri: 'http://test' };
    var es = fakeEventSource();
    var sp = createProcessor(config, es);
    sp.start();
    expect(es.options.headers).toMatchObject(httpUtils.getDefaultHeaders(sdkKey, config));
  });

  describe('put message', function() {
    var putData = {
      data: {
        flags: {
          flagkey: { key: 'flagkey', version: 1 }
        },
        segments: {
          segkey: { key: 'segkey', version: 2 }
        }
      }
    };

    it('causes flags and segments to be stored', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);
      sp.start();

      es.handlers.put({ data: JSON.stringify(putData) });

      var flag = await promisifySingle(featureStore.initialized)();
      expect(flag).toEqual(true);
      
      var f = await promisifySingle(featureStore.get)(dataKind.features, 'flagkey');
      expect(f.version).toEqual(1);
      var s = await promisifySingle(featureStore.get)(dataKind.segments, 'segkey');
      expect(s.version).toEqual(2);
    });

    it('calls initialization callback', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);
      
      var waitUntilStarted = promisifySingle(sp.start)();
      es.handlers.put({ data: JSON.stringify(putData) });
      var result = await waitUntilStarted;
      expect(result).toBe(undefined);
    });

    it('passes error to callback if data is invalid', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);
      
      var waitUntilStarted = promisifySingle(sp.start)();
      es.handlers.put({ data: '{not-good' });
      var result = await waitUntilStarted;
      expectJsonError(result, config);
    });

    it('updates diagnostic stats', async () => {
      const featureStore = InMemoryFeatureStore();
      const config = { featureStore: featureStore, logger: stubs.stubLogger() };

      const id = DiagnosticId('sdk-key');
      const manager = DiagnosticsManager(config, id, 100000);
      const startTime = new Date().getTime();

      const es = fakeEventSource();
      const sp = createProcessor(config, es, null, manager);

      const waitUntilStarted = promisifySingle(sp.start)();
      es.handlers.put({ data: JSON.stringify(putData) });
      await waitUntilStarted;

      const event = manager.createStatsEventAndReset(0, 0, 0);
      expect(event.streamInits.length).toEqual(1);
      const si = event.streamInits[0];
      expect(si.timestamp).toBeGreaterThanOrEqual(startTime);
      expect(si.failed).not.toBeTruthy();
      expect(si.durationMillis).toBeGreaterThanOrEqual(0);
    });
  });

  describe('patch message', function() {
    it('updates flag', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);

      var patchData = {
        path: '/flags/flagkey',
        data: { key: 'flagkey', version: 1 }
      };

      sp.start();
      es.handlers.patch({ data: JSON.stringify(patchData) });

      var f = await promisifySingle(featureStore.get)(dataKind.features, 'flagkey');
      expect(f.version).toEqual(1);
    });

    it('updates segment', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);

      var patchData = {
        path: '/segments/segkey',
        data: { key: 'segkey', version: 1 }
      };

      sp.start();
      es.handlers.patch({ data: JSON.stringify(patchData) });

      var s = await promisifySingle(featureStore.get)(dataKind.segments, 'segkey');
      expect(s.version).toEqual(1);
    });

    it('passes error to callback if data is invalid', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);
      
      var waitForCallback = promisifySingle(sp.start)();
      es.handlers.patch({ data: '{not-good' });
      var result = await waitForCallback;
      expectJsonError(result, config);
    });
  });

  describe('delete message', function() {
    it('deletes flag', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);

      sp.start();

      var flag = { key: 'flagkey', version: 1 }
      await promisifySingle(featureStore.upsert)(dataKind.features, flag);
      var f = await promisifySingle(featureStore.get)(dataKind.features, flag.key);
      expect(f).toEqual(flag);

      var deleteData = { path: '/flags/' + flag.key, version: 2 };
      es.handlers.delete({ data: JSON.stringify(deleteData) });

      var f = await promisifySingle(featureStore.get)(dataKind.features, flag.key);
      expect(f).toBe(null);
    });

    it('deletes segment', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);

      sp.start();

      var segment = { key: 'segkey', version: 1 }
      await promisifySingle(featureStore.upsert)(dataKind.segments, segment);
      var s = await promisifySingle(featureStore.get)(dataKind.segments, segment.key);
      expect(s).toEqual(segment);

      var deleteData = { path: '/segments/' + segment.key, version: 2 };
      es.handlers.delete({ data: JSON.stringify(deleteData) });

      s = await promisifySingle(featureStore.get)(dataKind.segments, segment.key);
      expect(s).toBe(null);
    });

    it('passes error to callback if data is invalid', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es);
      
      var waitForResult = promisifySingle(sp.start)();
      es.handlers.delete({ data: '{not-good' });
      var result = await waitForResult;
      expectJsonError(result, config);
    });
  });

  describe('indirect put message', function() {
    var allData = {
      flags: {
        flagkey: { key: 'flagkey', version: 1 }
      },
      segments: {
        segkey: { key: 'segkey', version: 2 }
      }
    };
    var fakeRequestor = {
      requestAllData: function(cb) {
        cb(null, JSON.stringify(allData));
      }
    };

    it('requests and stores flags and segments', async () => {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es, fakeRequestor);

      sp.start();

      es.handlers['indirect/put']({});

      await sleepAsync(0);
      var f = await promisifySingle(featureStore.get)(dataKind.features, 'flagkey');
      expect(f.version).toEqual(1);
      var s = await promisifySingle(featureStore.get)(dataKind.segments, 'segkey');
      expect(s.version).toEqual(2);
      var value = await promisifySingle(featureStore.initialized)();
      expect(value).toBe(true);
    });
  });

  describe('indirect patch message', function() {
    it('requests and updates flag', async () => {
      var flag = { key: 'flagkey', version: 1 };
      var fakeRequestor = {
        requestObject: function(kind, key, cb) {
          expect(kind).toBe(dataKind.features);
          expect(key).toEqual(flag.key);
          cb(null, JSON.stringify(flag));
        }
      };

      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es, fakeRequestor);

      sp.start();

      es.handlers['indirect/patch']({ data: '/flags/flagkey' });

      await sleepAsync(0);
      var f = await promisifySingle(featureStore.get)(dataKind.features, 'flagkey');
      expect(f.version).toEqual(1);
    });

    it('requests and updates segment', async () => {
      var segment = { key: 'segkey', version: 1 };
      var fakeRequestor = {
        requestObject: function(kind, key, cb) {
          expect(kind).toBe(dataKind.segments);
          expect(key).toEqual(segment.key);
          cb(null, JSON.stringify(segment));
        }
      };

      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: stubs.stubLogger() };
      var es = fakeEventSource();
      var sp = createProcessor(config, es, fakeRequestor);

      sp.start();

      es.handlers['indirect/patch']({ data: '/segments/segkey' });

      await sleepAsync(0);
      var s = await promisifySingle(featureStore.get)(dataKind.segments, 'segkey');
      expect(s.version).toEqual(1);
    });
  });

  async function testErrorHandling(err, recoverable) {
    const featureStore = InMemoryFeatureStore();
    const config = { featureStore: featureStore, logger: stubs.stubLogger() };
    const id = DiagnosticId('sdk-key');
    const manager = DiagnosticsManager(config, id, 100000);
    const startTime = new Date().getTime();

    const es = fakeEventSource();
    const sp = createProcessor(config, es, null, manager);
    
    const waitForStart = promisifySingle(sp.start)();  
    es.instance.onerror(err);
    const errReceived = await waitForStart;

    expect(errReceived).toEqual(err);
    expect(config.logger.error).toHaveBeenCalledTimes(1);
    expect(es.closed).toEqual(!recoverable);

    const event = manager.createStatsEventAndReset(0, 0, 0);
    expect(event.streamInits.length).toEqual(1);
    const si = event.streamInits[0];
    expect(si.timestamp).toBeGreaterThanOrEqual(startTime);
    expect(si.failed).toBeTruthy();
    expect(si.durationMillis).toBeGreaterThanOrEqual(0);
  }
  
  function testRecoverableHttpError(status) {
    const err = new Error('sorry');
    err.status = status;
    it('continues retrying after error ' + status, async () => await testErrorHandling(err, true));
  }

  testRecoverableHttpError(400);
  testRecoverableHttpError(408);
  testRecoverableHttpError(429);
  testRecoverableHttpError(500);
  testRecoverableHttpError(503);

  it('continues retrying after I/O error', async () => await testRecoverableError(new Error('sorry')));

  function testUnrecoverableHttpError(status) {
    const err = new Error('sorry');
    err.status = status;
    it('stops retrying after error ' + status, async () => await testErrorHandling(err, false));
  }

  testUnrecoverableHttpError(401);
  testUnrecoverableHttpError(403);
});
