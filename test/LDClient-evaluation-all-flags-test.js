const stubs = require('./stubs');

describe('LDClient.allFlagsState', () => {
  const defaultUser = { key: 'user' };

  it('captures flag state', async () => {
    const value1 = 'value1', value2 = 'value2', value3 = 'value3';
    const flag1 = {
      key: 'key1',
      version: 100,
      on: false,
      offVariation: 0,
      variations: [ value1 ]
    };
    const flag2 = {
      key: 'key2',
      version: 200,
      on: false,
      offVariation: 1,
      variations: [ 'x', value2 ],
      trackEvents: true,
      debugEventsUntilDate: 1000
    };
    // flag3 has an experiment (evaluation is a fallthrough and TrackEventsFallthrough is on)
    const flag3 = {
      key: 'key3',
      version: 300,
      on: true,
      fallthrough: { variation: 1 },
      variations: [ 'x', value3 ],
      trackEvents: false,
      trackEventsFallthrough: true
    };

    const client = stubs.createClient({}, { [flag1.key]: flag1, [flag2.key]: flag2, [flag3.key]: flag3 });
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser);
    expect(state.valid).toEqual(true);
    expect(state.allValues()).toEqual({ [flag1.key]: value1, [flag2.key]: value2, [flag3.key]: value3 });
    expect(state.getFlagValue(flag1.key)).toEqual(value1);
    expect(state.toJSON()).toEqual({
      [flag1.key]: value1,
      [flag2.key]: value2,
      [flag3.key]: value3,
      $flagsState: {
        [flag1.key]: {
          version: flag1.version,
          variation: 0,
        },
        [flag2.key]: {
          version: flag2.version,
          variation: 1,
          trackEvents: true,
          debugEventsUntilDate: 1000
        },
        [flag3.key]: {
          version: flag3.version,
          variation: 1,
          reason: { kind: 'FALLTHROUGH' },
          trackEvents: true,
          trackReason: true
        }
      },
      $valid: true
    });
  });

  it('can filter for only client-side flags', async () => {
    const flag1 = { key: 'server-side-1', on: false, offVariation: 0, variations: ['a'], clientSide: false };
    const flag2 = { key: 'server-side-2', on: false, offVariation: 0, variations: ['b'], clientSide: false };
    const flag3 = { key: 'client-side-1', on: false, offVariation: 0, variations: ['value1'], clientSide: true };
    const flag4 = { key: 'client-side-2', on: false, offVariation: 0, variations: ['value2'], clientSide: true };
    const client = stubs.createClient({}, {
      'server-side-1': flag1, 'server-side-2': flag2, 'client-side-1': flag3, 'client-side-2': flag4
    });
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser, { clientSideOnly: true });
    expect(state.valid).toEqual(true);
    expect(state.allValues()).toEqual({ 'client-side-1': 'value1', 'client-side-2': 'value2' });
  });

  it('can include reasons', async () => {
    const flag = {
      key: 'feature',
      version: 100,
      offVariation: 1,
      variations: ['a', 'b'],
      trackEvents: true,
      debugEventsUntilDate: 1000
    };
    const client = stubs.createClient({}, { feature: flag });
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser, { withReasons: true });
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
    const flag1 = {
      key: 'flag1',
      version: 100,
      offVariation: 0,
      variations: ['value1']
    };
    const flag2 = {
      key: 'flag2',
      version: 200,
      offVariation: 0,
      variations: ['value2'],
      trackEvents: true
    };
    const flag3 = {
      key: 'flag3',
      version: 300,
      offVariation: 0,
      variations: ['value3'],
      debugEventsUntilDate: 1000
    };
    
    const client = stubs.createClient({}, { flag1: flag1, flag2: flag2, flag3: flag3 });
    const user = { key: 'user' };
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser, { withReasons: true, detailsOnlyForTrackedFlags: true });
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
    const flag = {
      key: 'flagkey',
      on: false,
      offVariation: null
    };
    const logger = stubs.stubLogger();
    const client = stubs.createClient({ offline: true, logger: logger }, { flagkey: flag });
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser);
    expect(state.valid).toEqual(false);
    expect(state.allValues()).toEqual({});
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('does not overflow the call stack when evaluating a huge number of flags', async () => {
    const flagCount = 5000;
    const flags = {};
    for (let i = 0; i < flagCount; i++) {
      const key = 'feature' + i;
      const flag = {
        key: key,
        version: 1,
        on: false
      };
      flags[key] = flag;
    }
    const client = stubs.createClient({}, flags);
    await client.waitForInitialization();
    const state = await client.allFlagsState(defaultUser);
    expect(Object.keys(state.allValues()).length).toEqual(flagCount);
  });

  it('can use a callback instead of a Promise', done => {
    const client = stubs.createClient({ offline: true }, { });
    client.on('ready', () => {
      client.allFlagsState(defaultUser, {}, (err, state) => {
        expect(state.valid).toEqual(false);
        done();
      });
    });
  });

  it('can omit options parameter with callback', done => {
    const client = stubs.createClient({ offline: true }, { });
    client.on('ready', () => {
      client.allFlagsState(defaultUser, (err, state) => {
        expect(state.valid).toEqual(false);
        done();
      });
    });
  });
});
