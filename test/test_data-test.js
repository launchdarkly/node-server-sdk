const LaunchDarkly = require('../index');
const TestData = require('../test_data');
const InMemoryFeatureStore = require('../feature_store');
const dataKind = require('../versioned_data_kind');
const { promisify, promisifySingle } = require('launchdarkly-js-test-helpers');

describe('TestData', function() {
  it('Initializes the datastore with flags when start is called', async function() {
    const td = TestData();
    const store = InMemoryFeatureStore();
    td.update(td.flag('new-flag').variationForAllUsers(true));
    const tds = td({featureStore: store});
    await promisifySingle(tds.start)();
    expect(tds.initialized()).toBe(true);
    const res = await promisifySingle(store.all)(dataKind.features);
    expect(res).toEqual({
      'new-flag': {
        fallthrough: {
          variation: 0,
        },
        key: 'new-flag',
        offVariation: 1,
        on: true,
        variations: [ true, false ],
        version: 1
      }
    });
  });

  it('Updates the datastore with its flags when update is called', async function() {
    const td = TestData();
    const store = InMemoryFeatureStore();
    const tds = td({featureStore: store});
    await promisifySingle(tds.start)();

    const res = await promisifySingle(store.all)(dataKind.features);
    expect(res).toEqual({});

    await promisifySingle(td.update)(td.flag('new-flag').variationForAllUsers(true));

    const postUpdateRes = await promisifySingle(store.all)(dataKind.features);
    expect(postUpdateRes).toEqual({
      'new-flag': {
        fallthrough: {
          variation: 0,
        },
        key: 'new-flag',
        offVariation: 1,
        on: true,
        variations: [ true, false ],
        version: 1
      }
    });
  });

  it('The datasource does not update the store after stop is called', async function() {
    const td = TestData();
    const store = InMemoryFeatureStore();
    const tds = td({featureStore: store});
    await promisifySingle(tds.start)();

    const res = await promisifySingle(store.all)(dataKind.features);
    expect(res).toEqual({});

    tds.stop();
    await promisifySingle(td.update)(td.flag('new-flag').variationForAllUsers(true));

    const postUpdateRes = await promisifySingle(store.all)(dataKind.features);
    expect(postUpdateRes).toEqual({});
  });

  it('Can update a flag that exists in the store already', async function() {
    const td = TestData();
    const store = InMemoryFeatureStore();
    const tds = td({featureStore: store});
    await promisifySingle(tds.start)();

    await promisifySingle(td.update)(td.flag('new-flag').variationForAllUsers(true));
    const res = await promisifySingle(store.all)(dataKind.features);
    expect(res).toEqual({
      'new-flag': {
        fallthrough: {
          variation: 0,
        },
        key: 'new-flag',
        offVariation: 1,
        on: true,
        variations: [ true, false ],
        version: 1
      }
    });

    await promisifySingle(td.update)(td.flag('new-flag').variationForAllUsers(false));
    const res2 = await promisifySingle(store.all)(dataKind.features);
    expect(res2).toEqual({
      'new-flag': {
        fallthrough: {
          variation: 1,
        },
        key: 'new-flag',
        offVariation: 1,
        on: true,
        variations: [ true, false ],
        version: 2
      }
    });
  });

  it('TestData.flag performs an immutable copy after update', function() {
    const td = TestData();
    const flag = td.flag('test-flag');
    td.update(flag);
    const flag_copy = td.flag('test-flag');
    flag_copy.on(false);
    expect(flag_copy).not.toEqual(flag);
  });

  it('FlagBuilder defaults to on', function() {
    const td = TestData();
    expect(td.flag('whatever').build(0).on).toBe(true);
  });

  it('FlagBuilder defaults to boolean flag', function() {
    const td = TestData();
    const flag = td.flag('test-flag-booleanFlags');
    expect(flag.isBooleanFlag()).toBe(true)
    const flag2 = td.flag('test-flag-notBooleanFlags').valueForAllUsers('yes');
    expect(flag2.isBooleanFlag()).toBe(false)
  });

  it('Can handle boolean values for *Variation setters', function() {
    const td = TestData();
    const flag = td.flag('test-flag').fallthroughVariation(false);
    expect(flag.isBooleanFlag()).toBe(true);
    expect(flag.build(0).fallthrough).toEqual({variation: 1});

    const offFlag = td.flag('off-flag').offVariation(true);
    expect(offFlag.isBooleanFlag()).toBe(true);
    expect(offFlag.build(0).fallthrough).toEqual({variation: 0});
  });

  it('Can set boolean values for a specific user target', function() {
    const td = TestData();
    const flag = td.flag('test-flag').variationForUser('ben', false);
    expect(flag.build(0).targets).toEqual([
      { variation: 1,
        values: ['ben']
      }
    ]);
    const clearedFlag = flag.copy().clearUserTargets();
    expect(clearedFlag.build(0)).not.toHaveProperty('targets');

  });

  it('Can add and remove a rule', function() {
    const td = TestData();
    const flag = td.flag('test-flag')
                   .ifMatch('name', 'ben', 'christian')
                   .andNotMatch('country', 'fr')
                   .thenReturn(true);

    expect(flag.build().rules).toEqual([
      {
        "id": "rule0",
        "variation": 0,
        "clauses":  [
          {
            "attribute": "name",
            "negate": false,
            "operator": "in",
            "values":  [
              "ben",
              "christian",
            ],
          },
          {
            "attribute": "country",
            "negate": true,
            "operator": "in",
            "values":  [
              "fr",
            ],
          },
        ],
      }
    ]);

    const clearedRulesFlag = flag.clearRules();
    expect(clearedRulesFlag.build(0)).not.toHaveProperty('rules');
  });
});
