const { Evaluator } = require('../evaluator');

const {
  eventFactory,
  asyncEvaluate,
} = require('./evaluator_helpers');

describe('when given a bad context', () => {
  it('handles a legacy user without a key', async () => {
    const [err, detail, events] = await asyncEvaluate(Evaluator(), {}, {}, eventFactory);
    expect(detail).toEqual({
      value: null,
      variationIndex: null,
      reason: {
        kind: 'ERROR',
        errorKind: 'USER_NOT_SPECIFIED'
      }
    });
  });

  it('handles a single kind context without a key', async () => {
    const [err, detail, events] = await asyncEvaluate(Evaluator(), {}, {
      kind: 'user'
    }, eventFactory);
    expect(detail).toEqual({
      value: null,
      variationIndex: null,
      reason: {
        kind: 'ERROR',
        errorKind: 'USER_NOT_SPECIFIED'
      }
    });
  });


  it.each(["", " ", "#^&%&^", "almost ", 8, true, {}])
    ('handles a single kind context with an invalid kind', async (kind) => {
      const [err, detail, events] = await asyncEvaluate(Evaluator(), {}, {
        kind,
        key: 'goodKey'
      }, eventFactory);
      expect(detail).toEqual({
        value: null,
        variationIndex: null,
        reason: {
          kind: 'ERROR',
          errorKind: 'USER_NOT_SPECIFIED'
        }
      });
    });

  // For a multi-kind context the act of making something a key will
  // produce a string. So testing non-string types is just testing
  // the characters they contain.
  it.each(["", " ", "#^&%&^", "almost "])
    ('handles a multi kind context with an invalid kind', async (kind) => {
      const context = {
        kind: 'multi',
      };
      context[kind] = {
        key: 'goodKey'
      }
      const [err, detail, events] = await asyncEvaluate(Evaluator(), {}, context, eventFactory);
      expect(detail).toEqual({
        value: null,
        variationIndex: null,
        reason: {
          kind: 'ERROR',
          errorKind: 'USER_NOT_SPECIFIED'
        }
      });
    });

  it.each([undefined, null])
    ('handles a multi kind context with a context missing a key', async (key) => {
      const [err, detail, events] = await asyncEvaluate(Evaluator(), {}, {
        kind: 'multi',
        user: {
          key
        }
      }, eventFactory);
      expect(detail).toEqual({
        value: null,
        variationIndex: null,
        reason: {
          kind: 'ERROR',
          errorKind: 'USER_NOT_SPECIFIED'
        }
      });
    });
});

it('handles a missing flag', async () => {
  const [err, detail, events] = await asyncEvaluate(Evaluator(), undefined, {
    key: "userKey"
  }, eventFactory);
  expect(detail).toEqual({
    value: null,
    variationIndex: null,
    reason: {
      kind: 'ERROR',
      errorKind: 'FLAG_NOT_FOUND'
    }
  });
});
