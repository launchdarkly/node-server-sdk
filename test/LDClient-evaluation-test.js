var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');
var messages = require('../messages');
var stubs = require('./stubs');

describe('LDClient', () => {

  var defaultUser = { key: 'user' };

  function createClientWithFlagsInUninitializedStore(flagsMap) {
    var store = InMemoryFeatureStore();
    for (var key in flagsMap) {
      store.upsert(dataKind.features, flagsMap[key]);
    }
    return stubs.createClient({ featureStore: store }, {});
  }

  describe('variation()', () => {
    it('evaluates an existing flag', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({}, { flagkey: flag });
      client.on('ready', () => {
        client.variation(flag.key, defaultUser, 'c', (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual('b');
          done();
        });
      });
    });

    it('returns default for unknown flag', done => {
      var client = stubs.createClient({}, {});
      client.on('ready', () => {
        client.variation('flagkey', defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual('default');
          done();
        });
      });
    });

    it('returns default if client is offline', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      client.variation('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual('default');
        expect(logger.info).toHaveBeenCalled();
        done();
      });
    });

    it('returns default if client and store are not initialized', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var client = createClientWithFlagsInUninitializedStore({ flagkey: flag });
      client.variation('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual('default');
        done();
      });
    });

    it('returns value from store if store is initialized but client is not', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.shouldInitialize = false;
      client = stubs.createClient({ updateProcessor: updateProcessor, logger: logger }, { flagkey: flag });
      client.variation('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual('value');
        expect(logger.warn).toHaveBeenCalled();
        done();
      });
    });

    it('returns default if flag key is not specified', done => {
      var client = stubs.createClient({}, {});
      client.on('ready', () => {
        client.variation(null, defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual('default');
          done();
        });
      });
    });

    it('returns default for flag that evaluates to null', done => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var client = stubs.createClient({}, { flagkey: flag });
      client.on('ready', () => {
        client.variation(flag.key, defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual('default');
          done();
        });
      });
    });

    it('allows deprecated method toggle()', done => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: 0,
        variations: [true]
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ logger: logger }, { flagkey: flag });
      client.on('ready', () => {
        client.toggle(flag.key, defaultUser, false, (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual(true);
          expect(logger.warn).toHaveBeenCalled();
          done();
        });
      });
    });
  });

  describe('variationDetail()', () => {
    it('evaluates an existing flag', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({}, { flagkey: flag });
      client.on('ready', () => {
        client.variationDetail(flag.key, defaultUser, 'c', (err, result) => {
          expect(err).toBeNull();
          expect(result).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'FALLTHROUGH' } });
          done();
        });
      });
    });

    it('returns default for unknown flag', done => {
      var client = stubs.createClient({}, { });
      client.on('ready', () => {
        client.variationDetail('flagkey', defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toMatchObject({ value: 'default', variationIndex: null,
            reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
          done();
        });
      });
    });

    it('returns default if client is offline', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      client.variationDetail('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'default', variationIndex: null,
          reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' }});
        expect(logger.info).toHaveBeenCalled();
        done();
      });
    });

    it('returns default if client and store are not initialized', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      client = createClientWithFlagsInUninitializedStore({ flagkey: flag });
      client.variationDetail('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'default', variationIndex: null,
          reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' } });
        done();
      });
    });

    it('returns value from store if store is initialized but client is not', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.shouldInitialize = false;
      client = stubs.createClient({ updateProcessor: updateProcessor, logger: logger }, { flagkey: flag });
      client.variationDetail('flagkey', defaultUser, 'default', (err, result) => {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'value', variationIndex: 0, reason: { kind: 'OFF' }})
        expect(logger.warn).toHaveBeenCalled();
        done();
      });
    });

    it('returns default if flag key is not specified', done => {
      var client = stubs.createClient({}, { });
      client.on('ready', () => {
        client.variationDetail(null, defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toMatchObject({ value: 'default', variationIndex: null,
            reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
          done();
        });
      });
    });

    it('returns default for flag that evaluates to null', done => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var client = stubs.createClient({}, { flagkey: flag });
      client.on('ready', () => {
        client.variationDetail(flag.key, defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toMatchObject({ value: 'default', variationIndex: null, reason: { kind: 'OFF' } });
          done();
        });
      });
    });
  });

  describe('allFlags()', () => {
    it('evaluates flags', done => {
      var flag = {
        key: 'feature',
        version: 1,
        offVariation: 1,
        variations: ['a', 'b']
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ logger: logger }, { feature: flag });
      client.on('ready', () => {
        client.allFlags(defaultUser, (err, results) => {
          expect(err).toBeNull();
          expect(results).toEqual({feature: 'b'});
          expect(logger.warn).toHaveBeenCalledTimes(1); // deprecation warning
          done();
        });
      });
    });

    it('returns empty map in offline mode and logs a message', done => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      client.on('ready', () => {
        client.allFlags(defaultUser, (err, result) => {
          expect(result).toEqual({});
          expect(logger.info).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it('allows deprecated method all_flags', done => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ logger: logger }, {});
      client.on('ready', () => {
        client.all_flags(defaultUser, (err, result) => {
          expect(result).toEqual({});
          expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('all_flags', 'allFlags'));
          done();
        });
      });
    });

    it('does not overflow the call stack when evaluating a huge number of flags', done => {
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
      var client = stubs.createClient({}, flags);
      client.on('ready', () => {
        client.allFlags(defaultUser, (err, result) => {
          expect(err).toEqual(null);
          expect(Object.keys(result).length).toEqual(flagCount);
          done();
        });
      });
    });
  });

  describe('allFlagsState()', () => {
    it('captures flag state', done => {
      var flag = {
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      };
      var client = stubs.createClient({}, { feature: flag });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, {}, (err, state) => {
          expect(err).toBeNull();
          expect(state.valid).toEqual(true);
          expect(state.allValues()).toEqual({feature: 'b'});
          expect(state.getFlagValue('feature')).toEqual('b');
          expect(state.toJSON()).toEqual({
            feature: 'b',
            $flagsState: {
              feature: {
                version: 100,
                variation: 1,
                trackEvents: true,
                debugEventsUntilDate: 1000
              }
            },
            $valid: true
          });
          done();
        });
      });
    });

    it('can filter for only client-side flags', done => {
      var flag1 = { key: 'server-side-1', on: false, offVariation: 0, variations: ['a'], clientSide: false };
      var flag2 = { key: 'server-side-2', on: false, offVariation: 0, variations: ['b'], clientSide: false };
      var flag3 = { key: 'client-side-1', on: false, offVariation: 0, variations: ['value1'], clientSide: true };
      var flag4 = { key: 'client-side-2', on: false, offVariation: 0, variations: ['value2'], clientSide: true };
      var client = stubs.createClient({}, {
        'server-side-1': flag1, 'server-side-2': flag2, 'client-side-1': flag3, 'client-side-2': flag4
      });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, { clientSideOnly: true }, (err, state) => {
          expect(err).toBeNull();
          expect(state.valid).toEqual(true);
          expect(state.allValues()).toEqual({ 'client-side-1': 'value1', 'client-side-2': 'value2' });
          done();
        });
      });
    });

    it('can omit options parameter', done => {
      var flag = { key: 'key', on: false, offVariation: 0, variations: ['value'] };
      var client = stubs.createClient({}, { 'key': flag });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, (err, state) => {
          expect(err).toBeNull();
          expect(state.valid).toEqual(true);
          expect(state.allValues()).toEqual({ 'key': 'value' });
          done();
        });
      });
    });

    it('can include reasons', done => {
      var flag = {
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      };
      var client = stubs.createClient({}, { feature: flag });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, { withReasons: true }, (err, state) => {
          expect(err).toBeNull();
          expect(state.valid).toEqual(true);
          expect(state.allValues()).toEqual({feature: 'b'});
          expect(state.getFlagValue('feature')).toEqual('b');
          expect(state.toJSON()).toEqual({
            feature: 'b',
            $flagsState: {
              feature: {
                version: 100,
                variation: 1,
                reason: { kind: 'OFF' },
                trackEvents: true,
                debugEventsUntilDate: 1000
              }
            },
            $valid: true
          });
          done();
        });
      });
    });

    it('returns empty state in offline mode and logs a message', done => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, {}, (err, state) => {
          expect(state.valid).toEqual(false);
          expect(state.allValues()).toEqual({});
          expect(logger.info).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });
  });
});
