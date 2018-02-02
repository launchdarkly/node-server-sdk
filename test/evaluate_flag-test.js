var evaluate = require('../evaluate_flag');
var InMemoryFeatureStore = require('../feature_store');
var dataKind = require('../versioned_data_kind');

var featureStore = new InMemoryFeatureStore();

function defineSegment(segment) {
  var data = {};
  data[dataKind.segments.namespace] = {};
  data[dataKind.segments.namespace][segment.key] = segment;
  featureStore.init(data);
  var result = featureStore.get(dataKind.segments, segment.key);
}

function evalBooleanFlag(flag, user) {
  var gotResult;
  evaluate.evaluate(flag, user, featureStore, function(err, result) {
    // the in-memory store isn't really async - we can count on receiving this callback before we return.
    gotResult = result;
  })
  return gotResult;
}

function makeFlagWithSegmentMatch(segment) {
  return {
    key: 'flagKey',
    version: 1,
    on: true,
    prerequisites: [],
    salt: "",
    targets: [],
    rules: [
      {
        clauses: [
          {
            attribute: "",
            op: "segmentMatch",
            values: [ segment.key ]
          }
        ],
        variation: 1
      }
    ],
    fallthrough: {
      variation: 0
    },
    variations: [ false, true ]
  };
}

describe('evaluate', function() {

  it('matches segment with explicitly included user', function() {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo' };
    expect(evalBooleanFlag(flag, user)).toBe(true);
  });

  it('does not match segment with explicitly excluded user', function() {
    var segment = {
      key: 'test',
      excluded: [ 'foo' ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo' };
    expect(evalBooleanFlag(flag, user)).toBe(false);
  });

  it('does not match segment with unknown user', function() {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'bar' };
    expect(evalBooleanFlag(flag, user)).toBe(false);
  });

  it('matches segment with user who is both included and excluded', function() {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      excluded: [ 'foo' ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo' };
    expect(evalBooleanFlag(flag, user)).toBe(true);
  });

  it('matches segment with rule with full rollout', function() {
    var segment = {
      key: 'test',
      rules: [
        {
          clauses: [
            {
              attribute: 'email',
              op: 'in',
              values: [ 'test@example.com' ]
            }
          ],
          weight: 100000
        }
      ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo', email: 'test@example.com' };
    expect(evalBooleanFlag(flag, user)).toBe(true);
  });

  it('does not match segment with rule with zero rollout', function() {
    var segment = {
      key: 'test',
      rules: [
        {
          clauses: [
            {
              attribute: 'email',
              op: 'in',
              values: [ 'test@example.com' ]
            }
          ],
          weight: 0
        }
      ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo', email: 'test@example.com' };
    expect(evalBooleanFlag(flag, user)).toBe(false);
  });

  it('matches segment with multiple matching clauses', function() {
    var segment = {
      key: 'test',
      rules: [
        {
          clauses: [
            {
              attribute: 'email',
              op: 'in',
              values: [ 'test@example.com' ]
            },
            {
              attribute: 'name',
              op: 'in',
              values: [ 'bob' ]
            }
          ]
        }
      ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo', email: 'test@example.com', name: 'bob' };
    expect(evalBooleanFlag(flag, user)).toBe(true);
  });

  it('does not match segment if one clause does not match', function() {
    var segment = {
      key: 'test',
      rules: [
        {
          clauses: [
            {
              attribute: 'email',
              op: 'in',
              values: [ 'test@example.com' ]
            },
            {
              attribute: 'name',
              op: 'in',
              values: [ 'bill' ]
            }
          ]
        }
      ],
      version: 1
    };
    defineSegment(segment);
    var flag = makeFlagWithSegmentMatch(segment);
    var user = { key: 'foo', email: 'test@example.com', name: 'bob' };
    expect(evalBooleanFlag(flag, user)).toBe(false);
  });
});
