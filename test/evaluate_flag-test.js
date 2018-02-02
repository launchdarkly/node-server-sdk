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
