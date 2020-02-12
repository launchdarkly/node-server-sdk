const crypto = require('crypto');

const operators = require('./operators');
const dataKind = require('./versioned_data_kind');
const util = require('util');
const stringifyAttrs = require('./utils/stringifyAttrs');
const { safeAsyncEachSeries } = require('./utils/asyncUtils');

const builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];
const userAttrsToStringifyForEvaluation = ['key', 'secondary'];
// Currently we are not stringifying the rest of the built-in attributes prior to evaluation, only for events.
// This is because it could affect evaluation results for existing users (ch35206).

const noop = () => {};

// Callback receives (err, detail, events) where detail has the properties "value", "variationIndex", and "reason";
// detail will never be null even if there's an error.
function evaluate(flag, user, featureStore, eventFactory, maybeCallback) {
  const cb = maybeCallback || noop;
  if (!user || user.key === null || user.key === undefined) {
    cb(null, errorResult('USER_NOT_SPECIFIED'), []);
    return;
  }

  if (!flag) {
    cb(null, errorResult('FLAG_NOT_FOUND'), []);
    return;
  }

  const sanitizedUser = stringifyAttrs(user, userAttrsToStringifyForEvaluation);
  const events = [];
  evalInternal(flag, sanitizedUser, featureStore, events, eventFactory, (err, detail) => {
    cb(err, detail, events);
  });
}

function evalInternal(flag, user, featureStore, events, eventFactory, cb) {
  // If flag is off, return the off variation
  if (!flag.on) {
    getOffResult(flag, { kind: 'OFF' }, cb);
    return;
  }

  checkPrerequisites(flag, user, featureStore, events, eventFactory, (err, failureReason) => {
    if (err || failureReason) {
      getOffResult(flag, failureReason, cb);
    } else {
      evalRules(flag, user, featureStore, cb);
    }
  });
}

// Callback receives (err, reason) where reason is null if successful, or a "prerequisite failed" reason
function checkPrerequisites(flag, user, featureStore, events, eventFactory, cb) {
  if (flag.prerequisites && flag.prerequisites.length) {
    safeAsyncEachSeries(
      flag.prerequisites,
      (prereq, callback) => {
        featureStore.get(dataKind.features, prereq.key, prereqFlag => {
          // If the flag does not exist in the store or is not on, the prerequisite
          // is not satisfied
          if (!prereqFlag) {
            callback({
              key: prereq.key,
              err: new Error('Could not retrieve prerequisite feature flag "' + prereq.key + '"'),
            });
            return;
          }
          evalInternal(prereqFlag, user, featureStore, events, eventFactory, (err, detail) => {
            // If there was an error, the value is null, the variation index is out of range,
            // or the value does not match the indexed variation the prerequisite is not satisfied
            events.push(eventFactory.newEvalEvent(prereqFlag, user, detail, null, flag));
            if (err) {
              callback({ key: prereq.key, err: err });
            } else if (!prereqFlag.on || detail.variationIndex !== prereq.variation) {
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
      errInfo => {
        if (errInfo) {
          cb(errInfo.err, {
            kind: 'PREREQUISITE_FAILED',
            prerequisiteKey: errInfo.key,
          });
        } else {
          cb(null, null);
        }
      }
    );
  } else {
    cb(null, null);
  }
}

// Callback receives (err, detail)
function evalRules(flag, user, featureStore, cb) {
  // Check target matches
  for (let i = 0; i < (flag.targets || []).length; i++) {
    const target = flag.targets[i];

    if (!target.values) {
      continue;
    }

    for (let j = 0; j < target.values.length; j++) {
      if (user.key === target.values[j]) {
        getVariation(flag, target.variation, { kind: 'TARGET_MATCH' }, cb);
        return;
      }
    }
  }

  safeAsyncEachSeries(
    flag.rules,
    (rule, callback) => {
      ruleMatchUser(rule, user, featureStore, matched => {
        // We raise an "error" on the first rule that *does* match, to stop evaluating more rules
        callback(matched ? rule : null);
      });
    },
    // The following function executes once all of the rules have been checked
    err => {
      // we use the "error" value to indicate that a rule was successfully matched (since we only care
      // about the first match, and eachSeries terminates on the first "error")
      if (err) {
        const rule = err;
        const reason = { kind: 'RULE_MATCH', ruleId: rule.id };
        for (let i = 0; i < flag.rules.length; i++) {
          if (flag.rules[i].id === rule.id) {
            reason.ruleIndex = i;
            break;
          }
        }
        getResultForVariationOrRollout(rule, user, flag, reason, cb);
      } else {
        // no rule matched; check the fallthrough
        getResultForVariationOrRollout(flag.fallthrough, user, flag, { kind: 'FALLTHROUGH' }, cb);
      }
    }
  );
}

function ruleMatchUser(r, user, featureStore, cb) {
  if (!r.clauses) {
    cb(false);
    return;
  }

  // A rule matches if all its clauses match.
  safeAsyncEachSeries(
    r.clauses,
    (clause, callback) => {
      clauseMatchUser(clause, user, featureStore, matched => {
        // on the first clause that does *not* match, we raise an "error" to stop the loop
        callback(matched ? null : clause);
      });
    },
    err => {
      cb(!err);
    }
  );
}

function clauseMatchUser(c, user, featureStore, cb) {
  if (c.op === 'segmentMatch') {
    safeAsyncEachSeries(
      c.values,
      (value, callback) => {
        featureStore.get(dataKind.segments, value, segment => {
          if (segment && segmentMatchUser(segment, user)) {
            // on the first segment that matches, we raise an "error" to stop the loop
            callback(segment);
          } else {
            callback(null);
          }
        });
      },
      // The following function executes once all of the clauses have been checked
      err => {
        // an "error" indicates that a segment *did* match
        cb(maybeNegate(c, !!err));
      }
    );
  } else {
    cb(clauseMatchUserNoSegments(c, user));
  }
}

function clauseMatchUserNoSegments(c, user) {
  const uValue = userValue(user, c.attribute);

  if (uValue === null || uValue === undefined) {
    return false;
  }

  const matchFn = operators.fn(c.op);

  // The user's value is an array
  if (Array === uValue.constructor) {
    for (let i = 0; i < uValue.length; i++) {
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
    for (let i = 0; i < (segment.rules || []).length; i++) {
      if (segmentRuleMatchUser(segment.rules[i], user, segment.key, segment.salt)) {
        return true;
      }
    }
  }
  return false;
}

function segmentRuleMatchUser(rule, user, segmentKey, salt) {
  for (let i = 0; i < (rule.clauses || []).length; i++) {
    if (!clauseMatchUserNoSegments(rule.clauses[i], user)) {
      return false;
    }
  }

  // If the weight is absent, this rule matches
  if (rule.weight === undefined || rule.weight === null) {
    return true;
  }

  // All of the clauses are met. See if the user buckets in
  const bucket = bucketUser(user, segmentKey, rule.bucketBy || 'key', salt);
  const weight = rule.weight / 100000.0;
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
  for (let i = 0; i < values.length; i++) {
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
    const index = variationForUser(r, user, flag);
    if (index === null || index === undefined) {
      cb(new Error('Variation/rollout object with no variation or rollout'), errorResult('MALFORMED_FLAG'));
    } else {
      getVariation(flag, index, reason, cb);
    }
  }
}

function errorResult(errorKind) {
  return { value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: errorKind } };
}

// Given a variation or rollout 'r', select
// the variation for the given user
function variationForUser(r, user, flag) {
  if (r.variation !== null && r.variation !== undefined) {
    // This represets a fixed variation; return it
    return r.variation;
  }
  const rollout = r.rollout;
  if (rollout) {
    const variations = rollout.variations;
    if (variations && variations.length > 0) {
      // This represents a percentage rollout. Assume
      // we're rolling out by key
      const bucketBy = rollout.bucketBy || 'key';
      const bucket = bucketUser(user, flag.key, bucketBy, flag.salt);
      let sum = 0;
      for (let i = 0; i < variations.length; i++) {
        const variate = variations[i];
        sum += variate.weight / 100000.0;
        if (bucket < sum) {
          return variate.variation;
        }
      }

      // The user's bucket value was greater than or equal to the end of the last bucket. This could happen due
      // to a rounding error, or due to the fact that we are scaling to 100000 rather than 99999, or the flag
      // data could contain buckets that don't actually add up to 100000. Rather than returning an error in
      // this case (or changing the scaling, which would potentially change the results for *all* users), we
      // will simply put the user in the last bucket.
      return variations[variations.length - 1].variation;
    }
  }

  return null;
}

// Fetch an attribute value from a user object. Automatically
// navigates into the custom array when necessary
function userValue(user, attr) {
  if (builtins.indexOf(attr) >= 0 && Object.hasOwnProperty.call(user, attr)) {
    return user[attr];
  }
  if (user.custom && Object.hasOwnProperty.call(user.custom, attr)) {
    return user.custom[attr];
  }
  return null;
}

// Compute a percentile for a user
function bucketUser(user, key, attr, salt) {
  let idHash = bucketableStringValue(userValue(user, attr));

  if (idHash === null) {
    return 0;
  }

  if (user.secondary) {
    idHash += '.' + user.secondary;
  }

  const hashKey = util.format('%s.%s.%s', key, salt, idHash);
  const hashVal = parseInt(sha1Hex(hashKey).substring(0, 15), 16);

  return hashVal / 0xfffffffffffffff;
}

function bucketableStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Number.isInteger(value)) {
    return '' + value;
  }
  return null;
}

function sha1Hex(input) {
  const hash = crypto.createHash('sha1');
  hash.update(input);
  return hash.digest('hex');
}

module.exports = { evaluate: evaluate, bucketUser: bucketUser };
