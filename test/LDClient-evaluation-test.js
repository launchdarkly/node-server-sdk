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
    it('evaluates an existing flag', async () => {
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
      await client.waitForInitialization();
      var result = await client.variation(flag.key, defaultUser, 'c');
      expect(result).toEqual('b');
    });

    it('returns default for unknown flag', async () => {
      var client = stubs.createClient({}, {});
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('returns default if client is offline', async () => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
      expect(logger.info).toHaveBeenCalled();
    });

    it('returns default if client and store are not initialized', async () => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var client = createClientWithFlagsInUninitializedStore({ flagkey: flag });
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('returns value from store if store is initialized but client is not', async () => {
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
      var client = stubs.createClient({ updateProcessor: updateProcessor, logger: logger }, { flagkey: flag });
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('value');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns default if flag key is not specified', async () => {
      var client = stubs.createClient({}, {});
      await client.waitForInitialization();
      var result = await client.variation(null, defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('returns default for flag that evaluates to null', async () => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var client = stubs.createClient({}, { flagkey: flag });
      await client.waitForInitialization();
      var result = await client.variation(flag.key, defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('can use a callback instead of a Promise', done => {
      var client = stubs.createClient({}, {});
      client.on('ready', () => {
        client.variation('flagkey', defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toEqual('default');
          done();
        });
      });
    });
  });

  describe('variationDetail()', () => {
    it('evaluates an existing flag', async () => {
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
      await client.waitForInitialization();
      var result = await client.variationDetail(flag.key, defaultUser, 'c');
      expect(result).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'FALLTHROUGH' } });
    });

    it('returns default for unknown flag', async () => {
      var client = stubs.createClient({}, { });
      await client.waitForInitialization();
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
    });

    it('returns default if client is offline', async () => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      await client.waitForInitialization();
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' }});
      expect(logger.info).toHaveBeenCalled();
    });

    it('returns default if client and store are not initialized', async () => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      var client = createClientWithFlagsInUninitializedStore({ flagkey: flag });
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' } });
    });

    it('returns value from store if store is initialized but client is not', async () => {
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
      var client = stubs.createClient({ updateProcessor: updateProcessor, logger: logger }, { flagkey: flag });
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
      expect(result).toMatchObject({ value: 'value', variationIndex: 0, reason: { kind: 'OFF' }})
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns default if flag key is not specified', async () => {
      var client = stubs.createClient({}, { });
      await client.waitForInitialization();
      var result = await client.variationDetail(null, defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
    });

    it('returns default for flag that evaluates to null', async () => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var client = stubs.createClient({}, { flagkey: flag });
      await client.waitForInitialization();
      var result = await client.variationDetail(flag.key, defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null, reason: { kind: 'OFF' } });
    });

    it('can use a callback instead of a Promise', done => {
      var client = stubs.createClient({}, {});
      client.on('ready', () => {
        client.variationDetail('flagkey', defaultUser, 'default', (err, result) => {
          expect(err).toBeNull();
          expect(result).toMatchObject({ value: 'default', variationIndex: null,
            reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
          done();
        });
      });
    });
  });

  describe('allFlagsState()', () => {
    it('captures flag state', async () => {
      var flag = {
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      };
      var client = stubs.createClient({}, { feature: flag });
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser);
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
    });

    it('can filter for only client-side flags', async () => {
      var flag1 = { key: 'server-side-1', on: false, offVariation: 0, variations: ['a'], clientSide: false };
      var flag2 = { key: 'server-side-2', on: false, offVariation: 0, variations: ['b'], clientSide: false };
      var flag3 = { key: 'client-side-1', on: false, offVariation: 0, variations: ['value1'], clientSide: true };
      var flag4 = { key: 'client-side-2', on: false, offVariation: 0, variations: ['value2'], clientSide: true };
      var client = stubs.createClient({}, {
        'server-side-1': flag1, 'server-side-2': flag2, 'client-side-1': flag3, 'client-side-2': flag4
      });
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser, { clientSideOnly: true });
      expect(state.valid).toEqual(true);
      expect(state.allValues()).toEqual({ 'client-side-1': 'value1', 'client-side-2': 'value2' });
    });

    it('can include reasons', async () => {
      var flag = {
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      };
      var client = stubs.createClient({}, { feature: flag });
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser, { withReasons: true });
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
    });

    it('can omit details for untracked flags', async () => {
      var flag1 = {
        key: 'flag1',
        version: 100,
        offVariation: 0,
        variations: ['value1']
      };
      var flag2 = {
        key: 'flag2',
        version: 200,
        offVariation: 0,
        variations: ['value2'],
        trackEvents: true
      };
      var flag3 = {
        key: 'flag3',
        version: 300,
        offVariation: 0,
        variations: ['value3'],
        debugEventsUntilDate: 1000
      };
      var client = stubs.createClient({}, { flag1: flag1, flag2: flag2, flag3: flag3 });
      var user = { key: 'user' };
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser, { withReasons: true, detailsOnlyForTrackedFlags: true });
      expect(state.valid).toEqual(true);
      expect(state.allValues()).toEqual({flag1: 'value1', flag2: 'value2', flag3: 'value3'});
      expect(state.getFlagValue('flag1')).toEqual('value1');
      expect(state.toJSON()).toEqual({
        flag1: 'value1',
        flag2: 'value2',
        flag3: 'value3',
        $flagsState: {
          flag1: {
            variation: 0
          },
          flag2: {
            version: 200,
            variation: 0,
            reason: { kind: 'OFF' },
            trackEvents: true
          },
          flag3: {
            version: 300,
            variation: 0,
            reason: { kind: 'OFF' },
            debugEventsUntilDate: 1000
          }
        },
        $valid: true
      });
    });

    it('returns empty state in offline mode and logs a message', async () => {
      var flag = {
        key: 'flagkey',
        on: false,
        offVariation: null
      };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser);
      expect(state.valid).toEqual(false);
      expect(state.allValues()).toEqual({});
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('does not overflow the call stack when evaluating a huge number of flags', async () => {
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
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser);
      expect(Object.keys(state.allValues()).length).toEqual(flagCount);
    });

    it('can use a callback instead of a Promise', done => {
      var client = stubs.createClient({ offline: true }, { });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, {}, (err, state) => {
          expect(state.valid).toEqual(false);
          done();
        });
      });
    });

    it('can omit options parameter with callback', done => {
      var client = stubs.createClient({ offline: true }, { });
      client.on('ready', () => {
        client.allFlagsState(defaultUser, (err, state) => {
          expect(state.valid).toEqual(false);
          done();
        });
      });
    });
  });
});
