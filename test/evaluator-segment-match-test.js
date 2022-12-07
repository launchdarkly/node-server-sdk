
const { Evaluator } = require('../evaluator');
const {
  basicUser,
  basicSingleKindUser,
  basicMultiKindUser,
  eventFactory,
  prepareQueries,
  makeFlagWithSegmentMatch,
  asyncEvaluate,
  makeClauseThatMatchesUser,
  makeClauseThatDoesNotMatchUser,
} = require('./evaluator_helpers');

// Tests of flag evaluation at the segment-matching level - for simple segments, not big segments.

describe('Evaluator - segment match for user contexts', () => {
  const matchClause = makeClauseThatMatchesUser(basicUser);

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('matches segment with explicitly included user', async (user) => {
    const segment = {
      key: 'test',
      included: [ basicUser.key ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('does not match segment with explicitly excluded user', async (user) => {
    const segment = {
      key: 'test',
      excluded: [ basicUser.key ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(false);
  });


  it('does not match a segment that does not exist', async () => {
    const segment = {
      key: 'test',
      included: [ basicUser.key ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
    expect(detail.value).toBe(false);
  });

  it('does not match segment with unknown user', async () => {
    const segment = {
      key: 'test',
      included: [ 'foo' ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const user = { key: 'bar' };
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(false);
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('matches segment with user who is both included and excluded', async (user) => {
    const segment = {
      key: 'test',
      included: [ basicUser.key ],
      excluded: [ basicUser.key ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('matches segment with rule with full rollout', async (user) => {
    const segment = {
      key: 'test',
      rules: [
        {
          clauses: [ matchClause ],
          weight: 100000
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('handles an invalid reference for bucketBy', async () => {
    const segment = {
      key: 'test',
      rules: [
        {
          clauses: [ matchClause ],
          weight: 100000,
          bucketBy: '//',
          contextKind: 'user'
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
    expect(detail.reason).toEqual({ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' });
    expect(detail.value).toBe(null);
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('does not match segment with rule with zero rollout', async (user) => {
    const segment = {
      key: 'test',
      rules: [
        {
          clauses: [ matchClause ],
          weight: 0
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(false);
  });

  it('matches segment with multiple matching clauses', async () => {

    const user = { key: 'foo', email: 'test@example.com', name: 'bob' };
    const segment = {
      key: 'test',
      rules: [
        {
          clauses: [
            {
              attribute: 'email',
              op: 'in',
              values: [ user.email ]
            },
            {
              attribute: 'name',
              op: 'in',
              values: [ user.name ]
            }
          ]
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('does not match segment if one clause does not match', async () => {
    const user = { key: 'foo', email: 'test@example.com', name: 'bob' };
    const segment = {
      key: 'test',
      rules: [
        {
          clauses: [ makeClauseThatMatchesUser(user), makeClauseThatDoesNotMatchUser(user) ],
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, user, eventFactory);
    expect(detail.value).toBe(false);
  });
});

const singleKind = { kind: 'org', key: 'orgKey' };
const multiKind = { kind: 'multi', org: { key: 'orgKey' } };

describe('Evaluator - segment match for non-user contexts', () => {
  it.each([singleKind, multiKind])
  ('matches segment with explicitly included context', async (context) => {
    const segment = {
      key: 'test',
      includedContexts: [ {contextKind: 'org', values: [singleKind.key]} ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each([singleKind, multiKind])
  ('matches nested segments', async (context) => {
    const segment1 = {
      key: 'segment1',
      includedContexts: [ {contextKind: 'org', values: [singleKind.key]} ],
      version: 1
    };
    const segment2 = {
      key: 'segment2',
      rules: [
        {
          clauses: [ { attribute: '', op: 'segmentMatch', values: [segment1.key] } ],
          weight: 100000
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment1, segment2] }));
    const flag = makeFlagWithSegmentMatch(segment2);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
  });

  it('does not exceed callstack side for circular segments', async () => {
    const segment = {
      key: 'segment',
      rules: [
        {
          clauses: [ { attribute: '', op: 'segmentMatch', values: ['segment'] } ],
          weight: 100000
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, singleKind, eventFactory);
    expect(detail.reason).toEqual({ kind: 'ERROR', errorKind: 'MALFORMED_FLAG' });
    expect(detail.value).toBe(null);
  });

  it('allows for the same segment to be references in multiple clauses', async () => {
    const segment1 = {
      key: 'segment1',
      includedContexts: [ {contextKind: 'org', values: [singleKind.key]} ],
      version: 1
    };
    const segment2 = {
      key: 'segment2',
      rules: [
        {
          clauses: [
            { attribute: '', op: 'segmentMatch', values: [segment1.key] },
            { attribute: '', op: 'segmentMatch', values: [segment1.key] }
          ],
          weight: 100000
        }
      ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment1, segment2] }));
    const flag = makeFlagWithSegmentMatch(segment2);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, singleKind, eventFactory);
    expect(detail.value).toBe(true);
  });

  it.each([singleKind, multiKind])
  ('does not match segment for matching kind but missing key', async (context) => {
    const segment = {
      key: 'test',
      includedContexts: [ {kind: 'org', values: ['otherKey']} ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });

  it.each([singleKind, multiKind])
  ('does not match segment with explicitly excluded context', async (context) => {
    const segment = {
      key: 'test',
      excludedContexts: [ {kind: 'org', values: [singleKind.key]} ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });

  it.each([singleKind, multiKind])
  ('does not match segment for wrong kind', async (context) => {
    const segment = {
      key: 'test',
      includedContexts: [ {kind: 'notOrg', values: [singleKind.key]} ],
      version: 1
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(false);
  });
});
