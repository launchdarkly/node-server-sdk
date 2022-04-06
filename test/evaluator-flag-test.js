const { Evaluator } = require('../evaluator');
const {
  basicUser,
  eventFactory,
  prepareQueries,
  makeFlagWithRules,
  asyncEvaluate,
  makeClauseThatDoesNotMatchUser,
} = require('./evaluator_helpers');

// Tests of flag evaluation at the highest level. Rule-level and clause-level behavior is covered
// in detail in evaluator-rule-test, evaluator-clause-test, and evaluator-segment-match-test.

describe('Evaluator - basic flag behavior', () => {
  describe('flag is off', () => {
    it('returns off variation', async () => {
      const flag = {
        key: 'feature',
        on: false,
        offVariation: 1,
        fallthrough: { variation: 0 },
        variations: ['a', 'b', 'c']
      };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'OFF' } });
      expect(events).toBeUndefined();
    });

    it('returns null if off variation is unspecified', async () => {
      const flag = {
        key: 'feature',
        on: false,
        fallthrough: { variation: 0 },
        variations: ['a', 'b', 'c']
      };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'OFF' } });
      expect(events).toBeUndefined();
    });

    it('returns error if off variation is too high', async () => {
      const flag = {
        key: 'feature',
        on: false,
        offVariation: 99,
        fallthrough: { variation: 0 },
        variations: ['a', 'b', 'c']
      };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });

    it('returns error if off variation is negative', async () => {
      const flag = {
        key: 'feature',
        on: false,
        offVariation: -1,
        fallthrough: { variation: 0 },
        variations: ['a', 'b', 'c']
      };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });
  });

  describe('fallthrough - flag is on and no rules match', () => {
    const noMatchClause = makeClauseThatDoesNotMatchUser(basicUser);

    it('returns fallthrough variation', async () => {
      var rule = { id: 'id', clauses: [noMatchClause], variation: 2 };
      const flag = makeFlagWithRules([rule], { variation: 0 });
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'a', variationIndex: 0, reason: { kind: 'FALLTHROUGH' } });
      expect(events).toBeUndefined();
    });

    it('returns error if fallthrough variation is too high', async () => {
      var rule = { id: 'id', clauses: [noMatchClause], variation: 99 };
      const flag = makeFlagWithRules([rule], { variation: 99 });
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' }});
      expect(events).toBeUndefined();
    });

    it('returns error if fallthrough variation is negative', async () => {
      var rule = { id: 'id', clauses: [noMatchClause], variation: 99 };
      const flag = makeFlagWithRules([rule], { variation: -1 });
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' }});
      expect(events).toBeUndefined();
    });

    it('returns error if fallthrough has no variation or rollout', async () => {
      var rule = { id: 'id', clauses: [noMatchClause], variation: 99 };
      const flag = makeFlagWithRules([rule], { });
      var user = { key: 'x' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Variation/rollout object with no variation or rollout'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' }});
      expect(events).toBeUndefined();
    });

    it('returns error if fallthrough has rollout with no variations', async () => {
      var rule = { id: 'id', clauses: [noMatchClause], variation: 99 };
      const flag = makeFlagWithRules([rule], { rollout: { variations: [] } });
      var user = { key: 'x' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Variation/rollout object with no variation or rollout'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' }});
      expect(events).toBeUndefined();
    });
  });

  describe('prerequisites', () => {
    it('returns off variation if prerequisite is not found', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        prerequisites: [{key: 'badfeature', variation: 1}],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const e = Evaluator(prepareQueries({}));
      const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1,
        reason: { kind: 'PREREQUISITE_FAILED', prerequisiteKey: 'badfeature' } });
      expect(events).toBeUndefined();
    });

    it('returns off variation and event if prerequisite is off', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        prerequisites: [{key: 'feature1', variation: 1}],
        fallthrough: { variation: 0 },
        offVariation: 1,
        targets: [],
        rules: [],
        variations: ['a', 'b', 'c'],
        version: 1
      };
      const flag1 = {
        key: 'feature1',
        on: false,
        offVariation: 1,
        // note that even though it returns the desired variation, it is still off and therefore not a match
        fallthrough: { variation: 0 },
        targets: [],
        rules: [],
        variations: ['d', 'e'],
        version: 2
      };
      const e = Evaluator(prepareQueries({flags: [flag, flag1]}));
      const eventsShouldBe = [
        { kind: 'feature', key: 'feature1', variation: 1, value: 'e', version: 2, prereqOf: 'feature0' }
      ];
      const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1,
        reason: { kind: 'PREREQUISITE_FAILED', prerequisiteKey: 'feature1' } });
      expect(events).toMatchObject(eventsShouldBe);
    });

    it('returns off variation and event if prerequisite is not met', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        prerequisites: [{key: 'feature1', variation: 1}],
        fallthrough: { variation: 0 },
        offVariation: 1,
        targets: [],
        rules: [],
        variations: ['a', 'b', 'c'],
        version: 1
      };
      const flag1 = {
        key: 'feature1',
        on: true,
        fallthrough: { variation: 0 },
        targets: [],
        rules: [],
        variations: ['d', 'e'],
        version: 2
      };
      const e = Evaluator(prepareQueries({ flags: [flag, flag1] }));
      const eventsShouldBe = [
        { kind: 'feature', key: 'feature1', variation: 0, value: 'd', version: 2, prereqOf: 'feature0' }
      ];
      const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1,
        reason: { kind: 'PREREQUISITE_FAILED', prerequisiteKey: 'feature1' } });
      expect(events).toMatchObject(eventsShouldBe);
    });

    it('returns fallthrough variation and event if prerequisite is met and there are no rules', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        prerequisites: [{key: 'feature1', variation: 1}],
        fallthrough: { variation: 0 },
        offVariation: 1,
        targets: [],
        rules: [],
        variations: ['a', 'b', 'c'],
        version: 1
      };
      const flag1 = {
        key: 'feature1',
        on: true,
        fallthrough: { variation: 1 },
        targets: [],
        rules: [],
        variations: ['d', 'e'],
        version: 2
      };
      const e = Evaluator(prepareQueries({ flags: [flag, flag1] }))
      const eventsShouldBe = [
        { kind: 'feature', key: 'feature1', variation: 1, value: 'e', version: 2, prereqOf: 'feature0' }
      ];
      const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
      expect(detail).toMatchObject({ value: 'a', variationIndex: 0, reason: { kind: 'FALLTHROUGH' } });
      expect(events).toMatchObject(eventsShouldBe);
    });
  });

  describe('targets', () => {
    it('matches user from targets', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const user = { key: 'userkey' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(detail).toMatchObject({ value: 'c', variationIndex: 2, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('does not break when there are no values in a target', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
          }
        ],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const user = { key: 'userkey' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(detail).toMatchObject({ value: 'a', variationIndex: 0, reason: { kind: 'FALLTHROUGH' } });
      expect(events).toBeUndefined();
    });
    
    it('matches single kind user from targets', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const context = { kind: 'user', key: 'userkey' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'c', variationIndex: 2, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('matches single kind non-user from contextTargets', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        contextTargets: [
          {
            variation: 2,
            values: ['some', 'nonUserkey', 'or', 'other'],
            contextKind: 'non-user'
          }
        ],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const context = { kind: 'non-user', key: 'nonUserkey' };
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'c', variationIndex: 2, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('matches multi-kind context with user from targets', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        fallthrough: { variation: 0 },
        offVariation: 1,
        variations: ['a', 'b', 'c']
      };
      const context = { kind: 'multi', user: {key: 'userkey' }};
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'c', variationIndex: 2, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('matches a user in a multi-kind context with contextTargets order', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        contextTargets: [{
          variation: 2,
          contextKind: 'user',
          values: []
        },{
          variation: 1,
          contextKind: 'farm',
          values: ['cat']
        }],
        fallthrough: { variation: 0},
        offVariation: 0,
        variations: ['a', 'b', 'c']
      };

      const context = { kind: 'multi', farm: {key: 'cat' }, user: {key: 'userkey' }};
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'c', variationIndex: 2, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('does not match a user in a multi-kind context with contextTargets order if key is not present', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        contextTargets: [{
          variation: 2,
          contextKind: 'user',
          values: []
        },{
          variation: 1,
          contextKind: 'farm',
          values: ['cat']
        }],
        fallthrough: { variation: 0},
        offVariation: 0,
        variations: ['a', 'b', 'c']
      };

      const context = { kind: 'multi', farm: {key: 'dog' }, user: {key: 'cat' }};
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'a', variationIndex: 0, reason: { kind: 'FALLTHROUGH' } });
      expect(events).toBeUndefined();
    });

    it('matches contextTargets order with a non-user match ahead of a user.', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        targets: [
          {
            variation: 2,
            values: ['some', 'userkey', 'or', 'other']
          }
        ],
        contextTargets: [{
          variation: 1,
          contextKind: 'farm',
          values: ['cat']
        }, {
          variation: 2,
          contextKind: 'user',
          values: []
        }],
        fallthrough: { variation: 0},
        offVariation: 0,
        variations: ['a', 'b', 'c']
      };

      const context = { kind: 'multi', farm: {key: 'cat' }, user: {key: 'userkey' }};
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });

    it('matches a context in a multi-kind context with a contextTarget', async () => {
      const flag = {
        key: 'feature0',
        on: true,
        rules: [],
        contextTargets: [{
          variation: 1,
          contextKind: 'farm',
          values: ['cat']
        }],
        fallthrough: { variation: 0},
        offVariation: 0,
        variations: ['a', 'b', 'c']
      };

      const context = { kind: 'multi', farm: {key: 'cat' }};
      const [ err, detail, events ] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
      expect(detail).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'TARGET_MATCH' } });
      expect(events).toBeUndefined();
    });
  });
});
