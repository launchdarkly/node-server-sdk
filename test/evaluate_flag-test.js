var evaluate = require('../evaluate_flag');
var InMemoryFeatureStore = require('../feature_store');
var dataKind = require('../versioned_data_kind');

var featureStore = new InMemoryFeatureStore();

function defineSegment(segment, cb) {
  var data = {};
  data[dataKind.segments.namespace] = {};
  data[dataKind.segments.namespace][segment.key] = segment;
  featureStore.init(data);
  setTimeout(cb, 0);
}

function evalBooleanFlag(flag, user, cb) {
  evaluate.evaluate(flag, user, featureStore, function(err, result) {
    cb(result);
  });
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

  it('matches segment with explicitly included user', function(done) {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      version: 1
    };
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(true);
        done();
      });
    });
  });

  it('does not match segment with explicitly excluded user', function(done) {
    var segment = {
      key: 'test',
      excluded: [ 'foo' ],
      version: 1
    };
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(false);
        done();
      });
    });
  });

  it('does not match segment with unknown user', function(done) {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      version: 1
    };
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'bar' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(false);
        done();
      });
    });
  });

  it('matches segment with user who is both included and excluded', function(done) {
    var segment = {
      key: 'test',
      included: [ 'foo' ],
      excluded: [ 'foo' ],
      version: 1
    };
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(true);
        done();
      });
    });
  });

  it('matches segment with rule with full rollout', function(done) {
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
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo', email: 'test@example.com' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(true);
        done();
      });
    });
  });

  it('does not match segment with rule with zero rollout', function(done) {
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
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo', email: 'test@example.com' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(false);
        done();
      });
    });
  });

  it('matches segment with multiple matching clauses', function(done) {
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
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo', email: 'test@example.com', name: 'bob' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(true);
        done();
      });
    });
  });

  it('does not match segment if one clause does not match', function(done) {
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
    defineSegment(segment, function() {
      var flag = makeFlagWithSegmentMatch(segment);
      var user = { key: 'foo', email: 'test@example.com', name: 'bob' };
      evaluate.evaluate(flag, user, featureStore, function(err, result) {
        expect(result).toBe(false);
        done();
      });
    });
  });
});

describe('bucket_user', function() {
  it('gets expected bucket values for specific keys', function() {
    var user = { key: 'userKeyA' };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.42157587, 7);

    user = { key: 'userKeyB' };
    bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.6708485, 7);

    user = { key: 'userKeyC' };
    bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.10343106, 7);
  });

  it('can bucket by int value (equivalent to string)', function() {
    var user = {
      key: 'userKey',
      custom: {
        intAttr: 33333,
        stringAttr: '33333'
      }
    };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'intAttr', 'saltyA');
    var bucket2 = evaluate.bucket_user(user, 'hashKey', 'stringAttr', 'saltyA');
    expect(bucket).toBeCloseTo(0.54771423, 7);
    expect(bucket2).toBe(bucket);
  });

  it('cannot bucket by float value', function() {
    var user = {
      key: 'userKey',
      custom: {
        floatAttr: 33.5
      }
    };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'floatAttr', 'saltyA');
    expect(bucket).toBe(0);
  });
});
