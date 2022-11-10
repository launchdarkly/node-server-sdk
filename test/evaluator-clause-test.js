const { Evaluator } = require('../evaluator');
const {
  eventFactory,
  makeBooleanFlagWithRules,
  makeBooleanFlagWithOneClause,
  asyncEvaluate,
  makeClauseThatMatchesUser,
} = require('./evaluator_helpers');

// Tests of flag evaluation at the clause level.

describe('Evaluator - clause user contexts', () => {

  it('coerces user key to string for legacy user', async () => {
    const clause = { 'attribute': 'key', 'op': 'in', 'values': ['999'] };
    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, { key: 999 }, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each([{ kind: 'user', key: 999 }, { kind: 'multi', user: { key: 999 } }])
    ('does not coerce key for contexts', async (user) => {
      const clause = { 'attribute': 'key', 'op': 'in', 'values': ['999'] };
      const flag = makeBooleanFlagWithOneClause(clause);
      const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
      expect(detail.value).toBe(null);
    })

  async function testClauseMatch(clause, user, shouldBe) {
    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
    expect(detail.value).toBe(shouldBe);
  }

  it.each([
    { key: 'x', name: 'Bob' },
    { kind: 'user', key: 'x', name: 'Bob' },
    { kind: 'multi', user: { key: 'x', name: 'Bob' } },
  ])
    ('can match built-in attribute', async (user) => {
      const clause = { attribute: 'name', op: 'in', values: ['Bob'] };
      await testClauseMatch(clause, user, true);
    });

  it.each([
    { key: 'x', name: 'Bob', custom: { legs: 4 } },
    { kind: 'user', key: 'x', name: 'Bob', legs: 4 },
    { kind: 'multi', user: { key: 'x', name: 'Bob', legs: 4 } },
  ])
    ('can match custom attribute', async (user) => {
      const clause = { attribute: 'legs', op: 'in', values: [4] };
      await testClauseMatch(clause, user, true);
    });

  it.each([
    [{ key: 'x', name: 'Bob', custom: { '//': 4 } }, '//'],
    [{ kind: 'user', key: 'x', name: 'Bob', '//': 4 }, '//'],
    [{ kind: 'multi', user: { key: 'x', name: 'Bob', '//': 4 } }, '//'],
    [{ key: 'x', name: 'Bob', custom: { '/~~': 4 } }, '/~~'],
    [{ kind: 'user', key: 'x', name: 'Bob', '/~~': 4 }, '/~~'],
    [{ kind: 'multi', user: { key: 'x', name: 'Bob', '/~~': 4 } }, '/~~'],
  ])
    ('can match attributes which would have be invalid references, but are valid literals', async (user, attribute) => {
      const clause = { attribute, op: 'in', values: [4] };
      await testClauseMatch(clause, user, true);
    });

  it.each([
    { key: 'x', name: 'Bob' },
    { kind: 'user', key: 'x', name: 'Bob' },
    { kind: 'multi', user: { key: 'x', name: 'Bob' } },
  ])
    ('does not match missing attribute', async (user) => {
      const clause = { attribute: 'legs', op: 'in', values: [4] };
      await testClauseMatch(clause, user, false);
    });

  it.each([
    { key: 'x', name: 'Bob' },
    { kind: 'user', key: 'x', name: 'Bob' },
    { kind: 'multi', user: { key: 'x', name: 'Bob' } },
  ])
    ('can have a negated clause', async (user) => {
      const clause = { attribute: 'name', op: 'in', values: ['Bob'], negate: true };
      await testClauseMatch(clause, user, false);
    });

  it('does not overflow the call stack when evaluating a huge number of clauses', async () => {
    const user = { key: 'user' };
    const clauseCount = 5000;
    const flag = {
      key: 'flag',
      targets: [],
      on: true,
      variations: [false, true],
      fallthrough: { variation: 0 }
    };
    // Note, for this test to be meaningful, the clauses must all match the user, since we
    // stop evaluating clauses on the first non-match.
    const clause = makeClauseThatMatchesUser(user);
    const clauses = [];
    for (var i = 0; i < clauseCount; i++) {
      clauses.push(clause);
    }
    var rule = { clauses: clauses, variation: 1 };
    flag.rules = [rule];
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, user, eventFactory);
    expect(err).toEqual(null);
    expect(detail.value).toEqual(true);
  });

  it.each(['kind', '/kind'])('matches kind of implicit user', async (kind) => {
    const clause = { attribute: kind, op: 'in', values: ['user'] };
    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, { key: 'x', name: 'Bob' }, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('implicit user kind does not match rules for non-user kinds', async () => {
    const clause = { attribute: 'key', op: 'in', values: ['userkey'], contextKind: 'org' };
    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, { key: 'x', name: 'Bob' }, eventFactory);
    expect(detail.value).toBe(false);
  });
});

describe('Evaluator - clause non-user single-kind contexts', () => {
  it('does not match implicit user clauses to non-user contexts', async () => {
    const clause = { attribute: 'name', op: 'in', values: ['Bob'] };
    const flag = makeBooleanFlagWithOneClause(clause);
    const context = { kind: 'org', name: 'Bob', key: 'bobkey' }
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });

  it('cannot use an object attribute for a match.', async () => {
    const clause = { attribute: 'complex', op: 'in', values: [{ thing: true }], contextKind: 'org' };
    const flag = makeBooleanFlagWithOneClause(clause);
    const context = { kind: 'org', name: 'Bob', key: 'bobkey', complex: { thing: true } }
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });

  it('does match clauses for the correct context kind', async () => {
    const clause = { attribute: 'name', op: 'in', values: ['Bob'], contextKind: 'org' };
    const flag = makeBooleanFlagWithOneClause(clause);
    const context = { kind: 'org', name: 'Bob', key: 'bobkey' }
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each(['kind', '/kind'])('matches clauses for the kind attribute', async (kind) => {
    // The context kind here should not matter, but the 'kind' attribute should.
    const clause = { attribute: kind, op: 'in', values: ['org'], contextKind: 'potato' };
    const flag = makeBooleanFlagWithOneClause(clause);
    const context = { kind: 'org', name: 'Bob', key: 'bobkey' }
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each(['kind', '/kind'])('does not match clauses for the kind attribute if the kind does not match',
  async (kind) => {
    // The context kind here should not matter, but the 'kind' attribute should.
    const clause = { attribute: kind, op: 'in', values: ['org'], contextKind: 'potato' };
    const flag = makeBooleanFlagWithOneClause(clause);
    const context = { kind: 'party', name: 'Bob', key: 'bobkey' }
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });
});

describe('Evaluator - clause multi-kind contexts', () => {
  it('does match clauses correctly with multiple contexts', async () => {
    const clause1 = { attribute: 'region', op: 'in', values: ['north'], contextKind: 'park' };
    const clause2 = { attribute: 'count', op: 'in', values: [5], contextKind: 'party' };

    const context = {
      kind: 'multi',
      park: {
        key: 'park',
        region: 'north'
      },
      party: {
        key: 'party',
        count: 5
      }
    };

    const flag = makeBooleanFlagWithRules([{ clauses: [clause1, clause2], variation: 1 }]);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('does not match the values from the wrong contexts', async () => {
    const clause1 = { attribute: 'region', op: 'in', values: ['north'], contextKind: 'park' };
    const clause2 = { attribute: 'count', op: 'in', values: [5], contextKind: 'party' };

    const context = {
      kind: 'multi',
      park: {
        key: 'park',
        count: 5,
      },
      party: {
        key: 'party',
        region: 'north'
      }
    };

    const flag = makeBooleanFlagWithRules([{ clauses: [clause1, clause2], variation: 1 }]);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });

  it('can check for the presence of contexts', async () => {
    const clause = { attribute: 'kind', op: 'in', values: ['party'] };

    const context = {
      kind: 'multi',
      park: {
        key: 'park',
        count: 5,
      },
      party: {
        key: 'party',
        region: 'north'
      }
    };

    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('does not match if the kind is not in the context', async () => {
    const clause = { attribute: 'kind', op: 'in', values: ['zoo'] };

    const context = {
      kind: 'multi',
      park: {
        key: 'park',
        count: 5,
      },
      party: {
        key: 'party',
        region: 'north'
      }
    };

    const flag = makeBooleanFlagWithOneClause(clause);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });
});

describe('when given malformed flags', () => {
  it('handles clauses with malformed attribute references', async () => {
    const clause = { attribute: '//region', op: 'in', values: ['north'], contextKind: 'park' };

    const context = {
      kind: 'multi',
      park: {
        key: 'park',
        region: 'north'
      },
      party: {
        key: 'party',
        count: 5
      }
    };

    const flag = makeBooleanFlagWithRules([{ clauses: [clause], variation: 1 }]);
    const [err, detail, events] = await asyncEvaluate(Evaluator(), flag, context, eventFactory);
    expect(detail.reason).toEqual({ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' });
    expect(detail.value).toBe(null);
  });
});
