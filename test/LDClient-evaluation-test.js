const { TestData } = require('../integrations');
const stubs = require('./stubs');

describe('LDClient', () => {

  var defaultUser = { key: 'user' };

  describe('variation()', () => {
    it('evaluates an existing flag', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ updateProcessor: td });
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'c');
      expect(result).toEqual('b');
    });

    it('returns default for unknown flag', async () => {
      var client = stubs.createClient({}, {});
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('returns default if client is offline', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').variations('value').variationForAllUsers(0));
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ offline: true, updateProcessor: td, logger });
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
      expect(logger.info).toHaveBeenCalled();
    });

    it('returns default if client and store are not initialized', async () => {
      // Can't use TestData to set up this condition, because it always initializes successfully
      const flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      const featureStore = stubs.uninitializedStoreWithFlags(flag);
      var client = stubs.createClient({ featureStore });
      var result = await client.variation('flagkey', defaultUser, 'default');
      expect(result).toEqual('default');
    });

    it('returns value from store if store is initialized but client is not', async () => {
      // Can't use TestData to set up this condition, because it always initializes successfully
      var featureStore = stubs.initializedStoreWithFlags({
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      });
      var logger = stubs.stubLogger();
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.shouldInitialize = false;
      var client = stubs.createClient({ updateProcessor, featureStore, logger });
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
      const td = TestData();
      td.usePreconfiguredFlag({ // TestData normally won't construct a flag with offVariation: null
        key: 'flagkey',
        on: false,
        offVariation: null
      });
      var client = stubs.createClient({ updateProcessor: td });
      await client.waitForInitialization();
      var result = await client.variation('flagkey', defaultUser, 'default');
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
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ updateProcessor: td });
      await client.waitForInitialization();
      var result = await client.variationDetail('flagkey', defaultUser, 'c');
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
      // Can't use TestData to set up this condition, because the data source isn't used in offline mode
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
      // Can't use TestData to set up this condition, because it always initializes successfully
      var flag = {
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      };
      const featureStore = stubs.uninitializedStoreWithFlags(flag);
      var client = stubs.createClient({ featureStore });
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' } });
    });

    it('returns value from store if store is initialized but client is not', async () => {
      // Can't use TestData to set up this condition, because it always initializes successfully
      var featureStore = stubs.initializedStoreWithFlags({
        key: 'flagkey',
        version: 1,
        on: false,
        offVariation: 0,
        variations: ['value']
      });
      var logger = stubs.stubLogger();
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.shouldInitialize = false;
      var client = stubs.createClient({ updateProcessor, featureStore, logger });
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
      const td = TestData();
      td.usePreconfiguredFlag({ // TestData normally won't construct a flag with offVariation: null
        key: 'flagkey',
        on: false,
        offVariation: null
      });
      var client = stubs.createClient({ updateProcessor: td });
      await client.waitForInitialization();
      var result = await client.variationDetail('flagkey', defaultUser, 'default');
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
      const td = TestData();
      td.usePreconfiguredFlag({ // TestData normally won't set trackEvents or debugEventsUntilDate
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      });
      var client = stubs.createClient({ updateProcessor: td });
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
      const td = TestData();
      td.usePreconfiguredFlag({ key: 'server-side-1', on: false, offVariation: 0, variations: ['a'], clientSide: false });
      td.usePreconfiguredFlag({ key: 'server-side-2', on: false, offVariation: 0, variations: ['b'], clientSide: false });
      td.usePreconfiguredFlag({ key: 'client-side-1', on: false, offVariation: 0, variations: ['value1'], clientSide: true });
      td.usePreconfiguredFlag({ key: 'client-side-2', on: false, offVariation: 0, variations: ['value2'], clientSide: true });
      var client = stubs.createClient({ updateProcessor: td });
      await client.waitForInitialization();
      var state = await client.allFlagsState(defaultUser, { clientSideOnly: true });
      expect(state.valid).toEqual(true);
      expect(state.allValues()).toEqual({ 'client-side-1': 'value1', 'client-side-2': 'value2' });
    });

    it('can include reasons', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'feature',
        version: 100,
        offVariation: 1,
        variations: ['a', 'b'],
        trackEvents: true,
        debugEventsUntilDate: 1000
      });
      var client = stubs.createClient({ updateProcessor: td });
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
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'flag1',
        version: 100,
        offVariation: 0,
        variations: ['value1']
      });
      td.usePreconfiguredFlag({
        key: 'flag2',
        version: 200,
        offVariation: 0,
        variations: ['value2'],
        trackEvents: true
      });
      td.usePreconfiguredFlag({
        key: 'flag3',
        version: 300,
        offVariation: 0,
        variations: ['value3'],
        debugEventsUntilDate: 1000
      });
      var client = stubs.createClient({ updateProcessor: td });
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
      // Can't use TestData to set up this condition, because the data source isn't used in offline mode
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
      const td = TestData();
      var flagCount = 5000;
      for (var i = 0; i < flagCount; i++) {
        td.update(td.flag('feature' + i).on(false));
      }
      var client = stubs.createClient({ updateProcessor: td });
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
