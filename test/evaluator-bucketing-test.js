const { Evaluator, bucketContext } = require('../evaluator');
const {
  eventFactory,
  asyncEvaluate,
} = require('./evaluator_helpers');

describe('rollout', () => {
  it('selects bucket', async () => {
    const user = { key: 'userkey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    // First verify that with our test inputs, the bucket value will be greater than zero and less than 100000,
    // so we can construct a rollout whose second bucket just barely contains that value
    const bucketValue = Math.floor(bucketContext(user, flagKey, 'key', salt, null, 'user') * 100000);
    expect(bucketValue).toBeGreaterThan(0);
    expect(bucketValue).toBeLessThan(100000);

    const badVariationA = 0, matchedVariation = 1, badVariationB = 2;
    const rollout = {
      variations: [
        { variation: badVariationA, weight: bucketValue }, // end of bucket range is not inclusive, so it will *not* match the target value
        { variation: matchedVariation, weight: 1 }, // size of this bucket is 1, so it only matches that specific value
        { variation: badVariationB, weight: 100000 - (bucketValue + 1) }
      ]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
    expect(err).toEqual(null);
    expect(detail.variationIndex).toEqual(matchedVariation);
  });

  it('handles an invalid bucketBy', async () => {
    const user = { key: 'userkey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    const rollout = {
      contextKind: 'user',
      bucketBy: '//',
      variations: [
        { variation: 0, weight: 10000 },
      ]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
    expect(err).toBeDefined();
    expect(detail.reason).toEqual({ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' });
    expect(detail.variationIndex).toEqual(null);
  });

  it('selects bucket for a single kind user context', async () => {
    const context = { kind: 'user', key: 'userkey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    const bucketValue = Math.floor(bucketContext(context, flagKey, 'key', salt, null, 'user') * 100000);
    expect(bucketValue).toBeGreaterThan(0);
    expect(bucketValue).toBeLessThan(100000);

    const badVariationA = 0, matchedVariation = 1, badVariationB = 2;
    const rollout = {
      variations: [
        { variation: badVariationA, weight: bucketValue }, // end of bucket range is not inclusive, so it will *not* match the target value
        { variation: matchedVariation, weight: 1 }, // size of this bucket is 1, so it only matches that specific value
        { variation: badVariationB, weight: 100000 - (bucketValue + 1) }
      ]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(err).toEqual(null);
    expect(detail.variationIndex).toEqual(matchedVariation);
  });

  it('Uses the first bucket when the context does not contain the context kind of the rollout', async () => {
    const context = { kind: 'org', key: 'orgKey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    const bucketValue = Math.floor(bucketContext(context, flagKey, 'key', salt, null, 'user') * 100000);
    expect(bucketValue).toEqual(0);

    const rollout = {
      contextKind: 'user',
      variations: [
        { variation: 0, weight: 1 }, // end of bucket range is not inclusive, so it will *not* match the target value
        { variation: 1, weight: 1 }, // size of this bucket is 1, so it only matches that specific value
        { variation: 2, weight: 100000 - (1 + 1) }
      ]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(err).toEqual(null);
    expect(detail.variationIndex).toEqual(0);
  });

  it('Produces a non-zero bucket for a multi-kind context which contains the desired context kind', async () => {
    const context = { kind: 'org', key: 'orgKey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    const bucketValue = Math.floor(bucketContext(context, flagKey, 'key', salt, null, 'org') * 100000);
    expect(bucketValue).toBeGreaterThan(0);
    expect(bucketValue).toBeLessThan(100000);

    const badVariationA = 0, matchedVariation = 1, badVariationB = 2;
    const rollout = {
      contextKind: 'org',
      variations: [
        { variation: badVariationA, weight: bucketValue }, // end of bucket range is not inclusive, so it will *not* match the target value
        { variation: matchedVariation, weight: 1 }, // size of this bucket is 1, so it only matches that specific value
        { variation: badVariationB, weight: 100000 - (bucketValue + 1) }
      ]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(err).toEqual(null);
    expect(detail.variationIndex).toEqual(matchedVariation);
  });

  it('uses last bucket if bucket value is equal to total weight', async () => {
    const user = { key: 'userkey' };
    const flagKey = 'flagkey';
    const salt = 'salt';

    // We'll construct a list of variations that stops right at the target bucket value
    const bucketValue = Math.floor(bucketContext(user, flagKey, 'key', salt) * 100000);

    const rollout = {
      variations: [{ variation: 0, weight: bucketValue }]
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null]
    };
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
    expect(err).toEqual(null);
    expect(detail.variationIndex).toEqual(0);
  });

  describe('with seed', () => {
    const seed = 61;
    const flagKey = 'flagkey';
    const salt = 'salt';
    const rollout = {
      kind: 'experiment',
      seed,
      variations: [
        { variation: 0, weight: 10000 },
        { variation: 1, weight: 20000 },
        { variation: 0, weight: 70000, untracked: true },
      ],
    };
    const flag = {
      key: flagKey,
      salt: salt,
      on: true,
      fallthrough: { rollout: rollout },
      variations: [null, null, null],
    };

    it('buckets user into first variant of the experiment', async () => {
      var user = { key: 'userKeyA' };
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(err).toEqual(null);
      expect(detail.variationIndex).toEqual(0);
      expect(detail.reason.inExperiment).toBe(true);
    });

    it('uses seed to bucket user into second variant of the experiment', async () => {
      var user = { key: 'userKeyB' };
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(err).toEqual(null);
      expect(detail.variationIndex).toEqual(1);
      expect(detail.reason.inExperiment).toBe(true);
    });

    it('buckets user outside of the experiment', async () => {
      var user = { key: 'userKeyC' };
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(err).toEqual(null);
      expect(detail.variationIndex).toEqual(0);
      expect(detail.reason.inExperiment).toBe(undefined);
    });

    it('does not use bucketBy for experiments', async () => {
      const user = { key: 'userKeyA', kind: 'user', mimic: 'userKeyC' };
      const bucketByFlag = JSON.parse(JSON.stringify(flag));
      bucketByFlag.fallthrough.rollout.bucketBy = "mimic";
      const [err, detail, events] = await asyncEvaluate(Evaluator(), bucketByFlag, user, eventFactory);
      expect(err).toEqual(null);
      expect(detail.variationIndex).toEqual(0);
      expect(detail.reason.inExperiment).toBe(true);
    });
  });
});

describe('bucketContext', () => {
  it('gets expected bucket values for specific keys', () => {
    var user = { key: 'userKeyA' };
    var bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', null, 'user');
    expect(bucket).toBeCloseTo(0.42157587, 7);

    user = { key: 'userKeyB' };
    bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', null, 'user');
    expect(bucket).toBeCloseTo(0.6708485, 7);

    user = { key: 'userKeyC' };
    bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', null, 'user');
    expect(bucket).toBeCloseTo(0.10343106, 7);
  });

  it('can bucket by int value (equivalent to string)', () => {
    var user = {
      key: 'userKey',
      custom: {
        intAttr: 33333,
        stringAttr: '33333'
      }
    };
    var bucket = bucketContext(user, 'hashKey', 'intAttr', 'saltyA', null, 'user');
    var bucket2 = bucketContext(user, 'hashKey', 'stringAttr', 'saltyA', null, 'user');
    expect(bucket).toBeCloseTo(0.54771423, 7);
    expect(bucket2).toBe(bucket);
  });

  it('cannot bucket by float value', () => {
    var user = {
      key: 'userKey',
      custom: {
        floatAttr: 33.5
      }
    };
    var bucket = bucketContext(user, 'hashKey', 'floatAttr', 'saltyA', null, 'user');
    expect(bucket).toBe(0);
  });
});

describe('when seed is present', () => {
  const seed = 61;
  it('gets expected bucket values for specific keys', () => {
    var user = { key: 'userKeyA' };
    var bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', seed, 'user');
    expect(bucket).toBeCloseTo(0.09801207, 7);

    user = { key: 'userKeyB' };
    bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', seed, 'user');
    expect(bucket).toBeCloseTo(0.14483777, 7);

    user = { key: 'userKeyC' };
    bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', seed, 'user');
    expect(bucket).toBeCloseTo(0.9242641, 7);
  });

  it('should not generate a different bucket when hashKey or salt are changed', () => {
    let user = { key: 'userKeyA' };
    let bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', seed, 'user');
    let bucketDifferentHashKey = bucketContext(user, 'otherHashKey', 'key', 'saltyA', seed, 'user');
    let bucketDifferentSalt = bucketContext(user, 'hashKey', 'key', 'otherSaltyA', seed, 'user');

    expect(bucketDifferentHashKey).toBeCloseTo(bucket, 7);
    expect(bucketDifferentSalt).toBeCloseTo(bucket, 7);
  });

  it('should generate a new bucket if the seed changes', () => {
    const otherSeed = 60;
    var user = { key: 'userKeyA' };
    var bucket = bucketContext(user, 'hashKey', 'key', 'saltyA', otherSeed, 'user');
    expect(bucket).toBeCloseTo(0.7008816, 7);
  });
});
