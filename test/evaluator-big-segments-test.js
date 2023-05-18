const { Evaluator, makeBigSegmentRef } = require('../evaluator');
const {
  basicUser,
  eventFactory,
  asyncEvaluate,
  makeFlagWithSegmentMatch,
  makeClauseThatMatchesUser,
  prepareQueries,
  makeSegmentMatchClause,
  basicSingleKindUser,
  basicMultiKindUser,
  makeBooleanFlagWithRules,
} = require('./evaluator_helpers');

// Tests of flag evaluation involving Big Segments.

describe.each([undefined, 'user'])('Evaluator - Big Segments user contexts', (unboundedContextKind) => {
  it('segment is not matched if there is no way to query it', async () => {
    const segment = {
      key: 'test',
      included: [ basicUser.key ], // included should be ignored for a big segment
      version: 1,
      unbounded: true,
      generation: 1,
      unboundedContextKind
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
    expect(detail.value).toBe(false);
    expect(detail.reason.bigSegmentsStatus).toEqual('NOT_CONFIGURED');
  });

  it('segment with no generation is not matched', async () => {
    const segment = {
      key: 'test',
      included: [ basicUser.key ], // included should be ignored for a big segment
      version: 1,
      unbounded: true,
    };
    const e = Evaluator(prepareQueries({ segments: [segment] }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
    expect(detail.value).toBe(false);
    expect(detail.reason.bigSegmentsStatus).toEqual('NOT_CONFIGURED');
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('matched with include', async (context) => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
    };
    const membership = { [makeBigSegmentRef(segment)]: true };
    const e = Evaluator(prepareQueries({ segments: [segment], bigSegments: { [basicUser.key]: membership } }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('matched with rule', async (context) => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
      rules: [
        { clauses: [makeClauseThatMatchesUser(basicUser)] },
      ]
    };
    const membership = {};
    const e = Evaluator(prepareQueries({ segments: [segment], bigSegments: { [basicUser.key]: membership } }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('unmatched by exclude regardless of rule', async (context) => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
      rules: [
        { clauses: [makeClauseThatMatchesUser(basicUser)] },
      ]
    };
    const membership = { [makeBigSegmentRef(segment)]: false };
    const e = Evaluator(prepareQueries({ segments: [segment], bigSegments: { [basicUser.key]: membership } }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(false);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');
  });

  it('status is returned from provider', async () => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
    };
    const membership = { [makeBigSegmentRef(segment)]: true };
    const queries = prepareQueries({ segments: [segment] });
    queries.getBigSegmentsMembership = (key, cb) => {
      cb([ membership, 'STALE' ]);
    };
    const e = Evaluator(queries);
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, basicUser, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('STALE');
  });

  it.each([basicUser, basicSingleKindUser, basicMultiKindUser])
  ('queries state only once per user even if flag references multiple segments', async (context) => {
    const segment1 = {
      key: 'segmentkey1',
      version: 1,
      unbounded: true,
      generation: 2,
    };
    const segment2 = {
      key: 'segmentkey2',
      version: 1,
      unbounded: true,
      generation: 3,
    };
    const flag = {
      key: "key",
      on: "true",
      fallthrough: { variation: 0 },
      variations: [ false, true ],
      rules: [
        { variation: 1, clauses: [ makeSegmentMatchClause(segment1) ]},
        { variation: 1, clauses: [ makeSegmentMatchClause(segment2) ]},
      ],
    }

    const membership = { [makeBigSegmentRef(segment2)]: true };
    // The membership deliberately does not include segment1, because we want the first rule to be
    // a non-match so that it will continue on and check segment2 as well.

    const queries = prepareQueries({ segments: [segment1, segment2] });
    let userQueryCount = 0;
    queries.getBigSegmentsMembership = (key, cb) => {
      userQueryCount++;
      cb([ membership, 'HEALTHY' ]);
    };

    const e = Evaluator(queries);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');

    expect(userQueryCount).toEqual(1);
  });
});

describe('Evaluator - Big Segments non-user', () => {
  const targetKey = 'targetKey';
  const targetContextKind = 'org';

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
  ('matched with include for matching unboundedContextKind', async (context) => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'org'
    };
    const membership = { [makeBigSegmentRef(segment)]: true };
    const e = Evaluator(prepareQueries({ segments: [segment], bigSegments: { [singleKindContext.key]: membership } }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');
  });

  it.each([singleKindContext, multiKindContext])
  ('not matched with include for unboundedContextKind which does not match', async (context) => {
    const segment = {
      key: 'test',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'party'
    };
    const membership = { [makeBigSegmentRef(segment)]: true };
    const e = Evaluator(prepareQueries({ segments: [segment], bigSegments: { [singleKindContext.key]: membership } }));
    const flag = makeFlagWithSegmentMatch(segment);
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(false);
    expect(detail.reason.bigSegmentsStatus).toBeUndefined();
  });

  it('cached membership by key', async () => {
    const segment = {
      key: 'bigSegment1',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'party'
    };
    const segment2 = {
      key: 'bigSegment2',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'org'
    };

    const context = {
      kind: 'multi',
      party: {key: 'partyKey'},
      org: {key: 'orgKey'},
    };
    const membership = { [makeBigSegmentRef(segment)]: true };
    const membership2 = { [makeBigSegmentRef(segment2)]: true };
    const e = Evaluator(prepareQueries({ segments: [segment, segment2], bigSegments: { [context.party.key]: membership, [context.org.key]: membership2 } }));
    const flag = makeBooleanFlagWithRules([{clauses: [
      makeSegmentMatchClause(segment),
      makeSegmentMatchClause(segment2)
    ], variation: 1}])

    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual('HEALTHY');
  });

  it.each([
    ['HEALTYH', 'STALE', 'STALE'],
    ['HEALTYH', 'STORE_ERROR', 'STORE_ERROR'],
    ['HEALTYH', 'NOT_CONFIGURED', 'NOT_CONFIGURED'],
    ['STALE', 'HEALTYH', 'STALE'],
    ['STALE', 'STORE_ERROR', 'STORE_ERROR'],
    ['STALE', 'NOT_CONFIGURED', 'NOT_CONFIGURED'],
    ['STORE_ERROR', 'HEALTYH', 'STORE_ERROR'],
    ['STORE_ERROR', 'STALE', 'STORE_ERROR'],
    ['STORE_ERROR', 'NOT_CONFIGURED', 'NOT_CONFIGURED'],
    ['NOT_CONFIGURED', 'HEALTYH', 'NOT_CONFIGURED'],
    ['NOT_CONFIGURED', 'STALE', 'NOT_CONFIGURED'],
    ['NOT_CONFIGURED', 'STORE_ERROR', 'NOT_CONFIGURED']
  ])
  ('worst status is returned given multiple queries with different status', async (status1, status2, result) => {
    const segment = {
      key: 'bigSegment1',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'party'
    };
    const segment2 = {
      key: 'bigSegment2',
      version: 1,
      unbounded: true,
      generation: 2,
      unboundedContextKind: 'org'
    };

    const context = {
      kind: 'multi',
      party: {key: 'partyKey'},
      org: {key: 'orgKey'},
    };
    const membership1 = { [makeBigSegmentRef(segment)]: true };
    const membership2 = { [makeBigSegmentRef(segment2)]: true };
    const queries = prepareQueries({ segments: [segment, segment2] });
    const memberships = {[context.party.key]: [membership1, status1], [context.org.key]: [membership2, status2]};
    queries.getBigSegmentsMembership = (key, cb) => {
      cb(memberships[key]);
    };

    const e = Evaluator(queries);
    const flag = makeBooleanFlagWithRules([{clauses: [
      makeSegmentMatchClause(segment),
      makeSegmentMatchClause(segment2)
    ], variation: 1}])
    const [ err, detail, events ] = await asyncEvaluate(e, flag, context, eventFactory);
    expect(detail.value).toBe(true);
    expect(detail.reason.bigSegmentsStatus).toEqual(result);
  });
});
