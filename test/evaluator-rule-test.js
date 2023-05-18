const { Evaluator } = require('../evaluator');
const {
  basicUser,
  basicSingleKindUser,
  basicMultiKindUser,
  eventFactory,
  makeFlagWithRules,
  asyncEvaluate,
  makeClauseThatMatchesUser,
  makeClauseThatDoesNotMatchUser,
} = require('./evaluator_helpers');

// Tests of flag evaluation at the rule level. Clause-level behavior is covered in detail in
// evaluator-clause-test and evaluator-segment-match-test.

// const basicUser = { key: 'userkey' };
// const singleKindUser = { kind: 'user', key: 'userkey' };
// const multiKindWithUser = { kind: 'multi', user: { key: 'userkey' } };

describe('Evaluator - rules with user kinds', () => {
  const matchClause = makeClauseThatMatchesUser(basicUser);
  const noMatchClause = makeClauseThatDoesNotMatchUser(basicUser);

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('matches user from rules', async (userToTest) => {
      const rule0 = { id: 'id0', clauses: [noMatchClause], variation: 1 };
      const rule1 = { id: 'id1', clauses: [matchClause], variation: 2 };
      const flag = makeFlagWithRules([rule0, rule1]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, userToTest, eventFactory);
      expect(detail).toMatchObject({
        value: 'c', variationIndex: 2,
        reason: { kind: 'RULE_MATCH', ruleIndex: 1, ruleId: 'id1' }
      });
      expect(events).toBeUndefined();
    });



  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('returns error if rule variation is too high', async (userToTest) => {
      const rule = { id: 'id', clauses: [matchClause], variation: 99 };
      const flag = makeFlagWithRules([rule]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, userToTest, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('returns error if rule variation is negative', async (userToTest) => {
      const rule = { id: 'id', clauses: [matchClause], variation: -1 };
      const flag = makeFlagWithRules([rule]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, userToTest, eventFactory);
      expect(err).toEqual(Error('Invalid variation index in flag'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('returns error if rule has no variation or rollout', async (userToTest) => {
      const rule = { id: 'id', clauses: [matchClause] };
      const flag = makeFlagWithRules([rule]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, basicUser, eventFactory);
      expect(err).toEqual(Error('Variation/rollout object with no variation or rollout'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('returns error if rule has rollout with no variations', async (userToTest) => {
      const rule = { id: 'id', clauses: [matchClause], rollout: { variations: [] } };
      const flag = makeFlagWithRules([rule]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, userToTest, eventFactory);
      expect(err).toEqual(Error('Variation/rollout object with no variation or rollout'));
      expect(detail).toMatchObject({ value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: 'MALFORMED_FLAG' } });
      expect(events).toBeUndefined();
    });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
    ('does not overflow the call stack when evaluating a huge number of rules', async (userToTest) => {
      const ruleCount = 5000;
      const flag = {
        key: 'flag',
        targets: [],
        on: true,
        variations: [false, true],
        fallthrough: { variation: 0 }
      };
      // Note, for this test to be meaningful, the rules must *not* match the user, since we
      // stop evaluating rules on the first match.
      const rules = [];
      for (var i = 0; i < ruleCount; i++) {
        rules.push({ clauses: [noMatchClause], variation: 1 });
      }
      flag.rules = rules;
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, userToTest, eventFactory);
      expect(err).toEqual(null);
      expect(detail.value).toEqual(false);
    });
});

describe('Evaluator - rules with non-user kinds', () => {
  const targetKey = 'targetKey';
  const targetContextKind = 'org';
  const matchClause = { attribute: 'key', op: 'in', values: [targetKey], contextKind: targetContextKind }
  const noMatchClause = { attribute: 'key', op: 'in', values: ['not-' + targetKey], contextKind: targetContextKind }

  const singleKindContext = {
    kind: targetContextKind,
    key: targetKey
  };
  const multiKindContext = {
    kind: 'multi',
  };
  multiKindContext[targetContextKind] = {
    key: targetKey
  };

  it.each([singleKindContext, multiKindContext])
    ('matches user from rules', async (contextToTest) => {
      const rule0 = { id: 'id0', clauses: [noMatchClause], variation: 1 };
      const rule1 = { id: 'id1', clauses: [matchClause], variation: 2 };
      const flag = makeFlagWithRules([rule0, rule1]);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, contextToTest, eventFactory);
      expect(detail).toMatchObject({
        value: 'c', variationIndex: 2,
        reason: { kind: 'RULE_MATCH', ruleIndex: 1, ruleId: 'id1' }
      });
      expect(events).toBeUndefined();
    });
});
