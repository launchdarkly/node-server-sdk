var InMemoryFeatureStore = require('../feature_store');
var StreamProcessor = require('../streaming');
var dataKind = require('../versioned_data_kind');

describe('StreamProcessor', function() {
  var sdkKey = 'SDK_KEY';

  function fakeEventSource() {
    var es = { handlers: {} };
    es.constructor = function(url, options) {
      es.url = url;
      es.options = options;
      this.addEventListener = function(type, handler) {
        es.handlers[type] = handler;
      };
    };
    return es;
  }

  function fakeLogger() {
    return {
      debug: jest.fn(),
      error: jest.fn()
    };
  }

  function expectJsonError(config, done) {
    return function(err) {
      expect(err).not.toBe(undefined);
      expect(err.message).toEqual('Malformed JSON data in event stream');
      expect(config.logger.error).toHaveBeenCalled();
      done();
    }
  }

  it('uses expected URL', function() {
    var config = { streamUri: 'http://test' };
    var es = fakeEventSource();
    var sp = StreamProcessor(sdkKey, config, null, es.constructor);
    sp.start();
    expect(es.url).toEqual(config.streamUri + '/all');
  });

  it('sets expected headers', function() {
    var config = { streamUri: 'http://test', userAgent: 'agent' };
    var es = fakeEventSource();
    var sp = StreamProcessor(sdkKey, config, null, es.constructor);
    sp.start();
    expect(es.options.headers['Authorization']).toEqual(sdkKey);
    expect(es.options.headers['User-Agent']).toEqual(config.userAgent);
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

    it('causes flags and segments to be stored', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);
      sp.start();

      es.handlers.put({ data: JSON.stringify(putData) });

      featureStore.initialized(function(flag) {
        expect(flag).toEqual(true);
      });

      featureStore.get(dataKind.features, 'flagkey', function(f) {
        expect(f.version).toEqual(1);
        featureStore.get(dataKind.segments, 'segkey', function(s) {
          expect(s.version).toEqual(2);
          done();
        });
      });
    });

    it('calls initialization callback', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);
      
      var cb = function(err) {
        expect(err).toBe(undefined);
        done();
      }
      
      sp.start(cb);
      es.handlers.put({ data: JSON.stringify(putData) });
    });

    it('passes error to callback if data is invalid', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);
      
      sp.start(expectJsonError(config, done));
      es.handlers.put({ data: '{not-good' });
    });
  });

  describe('patch message', function() {
    it('updates flag', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);

      var patchData = {
        path: '/flags/flagkey',
        data: { key: 'flagkey', version: 1 }
      };

      sp.start();
      es.handlers.patch({ data: JSON.stringify(patchData) });

      featureStore.get(dataKind.features, 'flagkey', function(f) {
        expect(f.version).toEqual(1);
        done();
      });
    });

    it('updates segment', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);

      var patchData = {
        path: '/segments/segkey',
        data: { key: 'segkey', version: 1 }
      };

      sp.start();
      es.handlers.patch({ data: JSON.stringify(patchData) });

      featureStore.get(dataKind.segments, 'segkey', function(s) {
        expect(s.version).toEqual(1);
        done();
      });
    });

    it('passes error to callback if data is invalid', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);
      
      sp.start(expectJsonError(config, done));
      es.handlers.patch({ data: '{not-good' });
    });
  });

  describe('delete message', function() {
    it('deletes flag', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);

      sp.start();

      var flag = { key: 'flagkey', version: 1 }
      featureStore.upsert(dataKind.features, flag, function() {
        featureStore.get(dataKind.features, flag.key, function(f) {
          expect(f).toEqual(flag);

          var deleteData = { path: '/flags/' + flag.key, version: 2 };
          es.handlers.delete({ data: JSON.stringify(deleteData) });

          featureStore.get(dataKind.features, flag.key, function(f) {
            expect(f).toBe(null);
            done();
          })
        });
      });
    });

    it('deletes segment', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);

      sp.start();

      var segment = { key: 'segkey', version: 1 }
      featureStore.upsert(dataKind.segments, segment, function() {
        featureStore.get(dataKind.segments, segment.key, function(s) {
          expect(s).toEqual(segment);

          var deleteData = { path: '/segments/' + segment.key, version: 2 };
          es.handlers.delete({ data: JSON.stringify(deleteData) });

          featureStore.get(dataKind.segments, segment.key, function(s) {
            expect(s).toBe(null);
            done();
          })
        });
      });
    });

    it('passes error to callback if data is invalid', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, null, es.constructor);
      
      sp.start(expectJsonError(config, done));
      es.handlers.delete({ data: '{not-good' });
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

    it('requests and stores flags and segments', function(done) {
      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, fakeRequestor, es.constructor);

      sp.start();

      es.handlers['indirect/put']({});

      setImmediate(function() {
        featureStore.get(dataKind.features, 'flagkey', function(f) {
          expect(f.version).toEqual(1);
          featureStore.get(dataKind.segments, 'segkey', function(s) {
            expect(s.version).toEqual(2);
            featureStore.initialized(function(flag) {
              expect(flag).toBe(true);
            });
            done();
          });
        });
      });
    });
  });

  describe('indirect patch message', function() {
    it('requests and updates flag', function(done) {
      var flag = { key: 'flagkey', version: 1 };
      var fakeRequestor = {
        requestObject: function(kind, key, cb) {
          expect(kind).toBe(dataKind.features);
          expect(key).toEqual(flag.key);
          cb(null, JSON.stringify(flag));
        }
      };

      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, fakeRequestor, es.constructor);

      sp.start();

      es.handlers['indirect/patch']({ data: '/flags/flagkey' });

      setImmediate(function() {
        featureStore.get(dataKind.features, 'flagkey', function(f) {
          expect(f.version).toEqual(1);
          done();
        });
      });
    });

    it('requests and updates segment', function(done) {
      var segment = { key: 'segkey', version: 1 };
      var fakeRequestor = {
        requestObject: function(kind, key, cb) {
          expect(kind).toBe(dataKind.segments);
          expect(key).toEqual(segment.key);
          cb(null, JSON.stringify(segment));
        }
      };

      var featureStore = InMemoryFeatureStore();
      var config = { featureStore: featureStore, logger: fakeLogger() };
      var es = fakeEventSource();
      var sp = StreamProcessor(sdkKey, config, fakeRequestor, es.constructor);

      sp.start();

      es.handlers['indirect/patch']({ data: '/segments/segkey' });

      setImmediate(function() {
        featureStore.get(dataKind.segments, 'segkey', function(s) {
          expect(s.version).toEqual(1);
          done();
        });
      });
    });
  });
});
