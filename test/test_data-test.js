const LaunchDarkly = require('../index');
const TestData = require('../test_data');
const InMemoryFeatureStore = require('../feature_store');

describe('TestData', function() {
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
    //TODO switch to testing the built object
    expect(td.flag('whatever')._on).toBe(true);
  });

  it('FlagBuilder has boolean flags shortcut', function() {
    const td = TestData();
    const flag = td.flag('test-flag-booleanFlags').booleanFlag();
    expect(flag.isBooleanFlag()).toBe(true)
    const flag2 = td.flag('test-flag-notBooleanFlags');
    expect(flag2.isBooleanFlag()).toBe(false)
  });

  it('Can handle boolean values for *Variation setters', function() {
    const td = TestData();
    const flag = td.flag('test-flag').fallthroughVariation(false);
    expect(flag.isBooleanFlag()).toBe(true);
    //TODO switch to testing the built object
    expect(flag._fallthroughVariation).toBe(1);

    const offFlag = td.flag('off-flag').offVariation(true);
    expect(offFlag.isBooleanFlag()).toBe(true);
    //TODO switch to testing the built object
    expect(offFlag._fallthroughVariation).toBe(0);
  });

  it('Can set boolean values for a specific user target', function() {
    const td = TestData();
    const flag = td.flag('test-flag').variationForUser('ben', false);
    const clearedFlag = flag.copy().clearUserTargets();
    //TODO switch to testing the built object
    expect(flag._targets).toEqual({
      '1': ['ben']
    });
    expect(clearedFlag._targets).toEqual(null);

  });
});
