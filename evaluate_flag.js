var operators = require('./operators');
var dataKind = require('./versioned_data_kind');
var util = require('util');
var sha1 = require('node-sha1');
var async = require('async');
var stringifyAttrs = require('./utils/stringifyAttrs');

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];
var userAttrsToStringifyForEvaluation = [ "key", "secondary" ];
// Currently we are not stringifying the rest of the built-in attributes prior to evaluation, only for events.
// This is because it could affect evaluation results for existing users (ch35206).

var noop = function(){};

// Callback receives (err, detail, events) where detail has the properties "value", "variationIndex", and "reason";
// detail will never be null even if there's an error.
function evaluate(flag, user, featureStore, eventFactory, cb) {
  cb = cb || noop;
  if (!user || user.key === null || user.key === undefined) {
    cb(null, errorResult('USER_NOT_SPECIFIED'), []);
    return;
  }

  if (!flag) {
    cb(null, errorResult('FLAG_NOT_FOUND'), []);
    return;
  }

  var sanitizedUser = stringifyAttrs(user, userAttrsToStringifyForEvaluation);
  var events = [];
  evalInternal(flag, sanitizedUser, featureStore, events, eventFactory, function(err, detail) {
    cb(err, detail, events);
  });
}

function evalInternal(flag, user, featureStore, events, eventFactory, cb) {
  // If flag is off, return the off variation
  if (!flag.on) {
    getOffResult(flag, { kind: 'OFF' }, function(err, detail) {
      cb(err, detail);
    });
    return;
  }

  checkPrerequisites(flag, user, featureStore, events, eventFactory, function(err, failureReason) {
    if (err != null || failureReason != null) {
      getOffResult(flag, failureReason, cb);
    } else {
      evalRules(flag, user, featureStore, cb);
    }
  });
}

// Callback receives (err, reason) where reason is null if successful, or a "prerequisite failed" reason
function checkPrerequisites(flag, user, featureStore, events, eventFactory, cb) {
  if (flag.prerequisites) {
    async.mapSeries(flag.prerequisites,
      function(prereq, callback) {
        featureStore.get(dataKind.features, prereq.key, function(prereqFlag) {
          // If the flag does not exist in the store or is not on, the prerequisite
          // is not satisfied
          if (!prereqFlag) {
            callback({ key: prereq.key, err: new Error("Could not retrieve prerequisite feature flag \"" + prereq.key + "\"") });
            return;
          }
          evalInternal(prereqFlag, user, featureStore, events, eventFactory, function(err, detail) {
            // If there was an error, the value is null, the variation index is out of range,
            // or the value does not match the indexed variation the prerequisite is not satisfied
            events.push(eventFactory.newEvalEvent(prereqFlag, user, detail, null, flag));
            if (err) {
              callback({ key: prereq.key, err: err });
            } else if (!prereqFlag.on || detail.variationIndex != prereq.variation) {
              // Note that if the prerequisite flag is off, we don't consider it a match no matter what its
              // off variation was. But we still evaluate it and generate an event.
              callback({ key: prereq.key });
            } else {
              // The prerequisite was satisfied
              callback(null);
            }
          });
        });
      },
      function(errInfo) {
        if (errInfo) {
          cb(errInfo.err, { 'kind': 'PREREQUISITE_FAILED', 'prerequisiteKey': errInfo.key });
        } else {
          cb(null, null);
        }
      });
  } else {
    cb(null, null);
  }
}

// Callback receives (err, detail)
function evalRules(flag, user, featureStore, cb) {
  var i, j;
  var target;
  var variation;
  var rule;
  // Check target matches
  for (i = 0; i < (flag.targets || []).length; i++) {
    target = flag.targets[i];

    if (!target.values) {
      continue;
    }

    for (j = 0; j < target.values.length; j++) {
      if (user.key === target.values[j]) {
        getVariation(flag, target.variation, { kind: 'TARGET_MATCH' }, cb);
        return;
      }
    }
  }

  i = 0;
  async.mapSeries(flag.rules || [],
    function(rule, callback) {
      ruleMatchUser(rule, user, featureStore, function(matched) {
        var match = matched ? { index: i, rule: rule } : null;
        setImmediate(callback, match, null);
      });
    },
    function(err, results) {
      // we use the "error" value to indicate that a rule was successfully matched (since we only care
      // about the first match, and mapSeries terminates on the first "error")
      if (err) {
        var reason = { kind: 'RULE_MATCH', ruleIndex: err.index, ruleId: err.rule.id };
        getResultForVariationOrRollout(err.rule, user, flag, reason, cb);
      } else {
        // no rule matched; check the fallthrough
        getResultForVariationOrRollout(flag.fallthrough, user, flag, { kind: 'FALLTHROUGH' }, cb);
      }
    }
  );
}

function ruleMatchUser(r, user, featureStore, cb) {
  var i;

  if (!r.clauses) {
    return false;
  }

  // A rule matches if all its clauses match
  async.mapSeries(r.clauses,
    function(clause, callback) {
      clauseMatchUser(clause, user, featureStore, function(matched) {
        // on the first clause that does *not* match, we raise an "error" to stop the loop
        setImmediate(callback, matched ? null : clause, null);
      });
    },
    function(err, results) {
      cb(!err);
    }
  );
}

function clauseMatchUser(c, user, featureStore, cb) {
  if (c.op == 'segmentMatch') {
    async.mapSeries(c.values,
      function(value, callback) {
        featureStore.get(dataKind.segments, value, function(segment) {
          if (segment && segmentMatchUser(segment, user)) {
            // on the first segment that matches, we raise an "error" to stop the loop
            callback(segment, null);
          } else {
            callback(null, null);
          }
        });
      },
      function(err, results) {
        // an "error" indicates that a segment *did* match
        cb(maybeNegate(c, !!err));
      }
    );
  } else {
    cb(clauseMatchUserNoSegments(c, user));
  }
}

function clauseMatchUserNoSegments(c, user) {
  var uValue;
  var matchFn;
  var i;

  uValue = userValue(user, c.attribute);

  if (uValue === null || uValue === undefined) {
    return false;
  }

  matchFn = operators.fn(c.op)

  // The user's value is an array
  if (Array === uValue.constructor) {
    for (i = 0; i < uValue.length; i++) {
      if (matchAny(matchFn, uValue[i], c.values)) {
        return maybeNegate(c, true);
      }
    }
    return maybeNegate(c, false);
  }

  return maybeNegate(c, matchAny(matchFn, uValue, c.values));
}

function segmentMatchUser(segment, user) {
  if (user.key) {
    if ((segment.included || []).indexOf(user.key) >= 0) {
      return true;
    }
    if ((segment.excluded || []).indexOf(user.key) >= 0) {
      return false;
    }
    for (var i = 0; i < (segment.rules || []).length; i++) {
      if (segmentRuleMatchUser(segment.rules[i], user, segment.key, segment.salt)) {
        return true;
      }
    }
  }
  return false;
}

function segmentRuleMatchUser(rule, user, segmentKey, salt) {
  for (var i = 0; i < (rule.clauses || []).length; i++) {
    if (!clauseMatchUserNoSegments(rule.clauses[i], user)) {
      return false;
    }
  }

  // If the weight is absent, this rule matches
  if (rule.weight === undefined || rule.weight === null) {
    return true;
  }

  // All of the clauses are met. See if the user buckets in
  var bucket = bucketUser(user, segmentKey, rule.bucketBy || "key", salt);
  var weight = rule.weight / 100000.0;
  return bucket < weight;
}

function maybeNegate(c, b) {
  if (c.negate) {
    return !b;
  } else {
    return b;
  }
}

function matchAny(matchFn, value, values) {
  var i = 0;

  for (i = 0; i < values.length; i++) {
    if (matchFn(value, values[i])) {
      return true;
    }
  }

  return false;
}

function getVariation(flag, index, reason, cb) {
  if (index === null || index === undefined || index < 0 || index >= flag.variations.length) {
    cb(new Error('Invalid variation index in flag'), errorResult('MALFORMED_FLAG'));
  } else {
    cb(null, { value: flag.variations[index], variationIndex: index, reason: reason });
  }
}

function getOffResult(flag, reason, cb) {
  if (flag.offVariation === null || flag.offVariation === undefined) {
    cb(null, { value: null, variationIndex: null, reason: reason });
  } else {
    getVariation(flag, flag.offVariation, reason, cb);
  }
}

function getResultForVariationOrRollout(r, user, flag, reason, cb) {
  if (!r) {
    cb(new Error('Fallthrough variation undefined'), errorResult('MALFORMED_FLAG'));
  } else {
    var index = variationForUser(r, user, flag);
    if (index === null) {
      cb(new Error('Variation/rollout object with no variation or rollout'), errorResult('MALFORMED_FLAG'));
    } else {
      getVariation(flag, index, reason, cb);
    }
  }
}

function errorResult(errorKind) {
  return { value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: errorKind }};
}

// Given a variation or rollout 'r', select
// the variation for the given user
function variationForUser(r, user, flag) {
  var bucketBy;
  var bucket;
  var sum = 0;
  var i;
  var variation;
  if (r.variation != null) {
    // This represets a fixed variation; return it
    return r.variation;
  } else if (r.rollout != null) {
    // This represents a percentage rollout. Assume
    // we're rolling out by key
    bucketBy = r.rollout.bucketBy != null ? r.rollout.bucketBy : "key";
    bucket = bucketUser(user, flag.key, bucketBy, flag.salt);
    for (i = 0; i < r.rollout.variations.length; i++) {
      var variate = r.rollout.variations[i];
      sum += variate.weight / 100000.0;
      if (bucket < sum) {
        return variate.variation;
      }
    }
  }

  return null;
}

// Fetch an attribute value from a user object. Automatically
// navigates into the custom array when necessary
function userValue(user, attr) {
  if (builtins.indexOf(attr) >= 0 && user.hasOwnProperty(attr)) {
    return user[attr];
  }
  if (user.custom && user.custom.hasOwnProperty(attr)) {
    return user.custom[attr];
  }
  return null;
}

// Compute a percentile for a user
function bucketUser(user, key, attr, salt) {
  var uValue;
  var idHash;

  idHash = bucketableStringValue(userValue(user, attr));

  if (idHash === null) {
    return 0;
  }

  if (user.secondary) {
    idHash += "." + user.secondary;
  }

  var hashKey = util.format("%s.%s.%s", key, salt, idHash);
  var hashVal = parseInt(sha1(hashKey).substring(0,15), 16);

  return hashVal / 0xFFFFFFFFFFFFFFF;
}

function bucketableStringValue(value) {
  if (typeof(value) === 'string') {
    return value;
  }
  if (Number.isInteger(value)) {
    return '' + value;
  }
  return null;
}

module.exports = {evaluate: evaluate, bucketUser: bucketUser};
