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
    expect(td.flag('whatever').build(0).on).toBe(true);
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
