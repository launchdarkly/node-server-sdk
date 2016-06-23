var operators = require('./operators');
var util = require('util');
var sha1 = require('node-sha1');

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

var noop = function(){};

function evaluate(flag, user, store, cb) {
  cb = cb || noop;
  if (!user || !user.key) {
    cb(null, null, null);
    return;
  }

  if (!flag) {
    cb(null, null, null);
    return;
  }

  if (!flag.on) {
    // Return the off variation if defined and valid
    if (flag.offVariation != null) {
      cb(null, get_variation(flag, flag.offVariation), null);
    }
    // Otherwise, return the default variation
    else {
      cb(null, null, null);
    }
    return;
  }

  eval_internal(flag, user, store, [], {}, cb);
  return;
}

function eval_internal(flag, user, store, events, visited, cb) {
  // Evaluate prerequisites, if any
  visited[flag.key] = true;
  if (flag.prerequisites) {
    async.mapSeries(flag.prerequisites, 
      function(prereq, callback) {
        // Check for cycles
        if (visited[prereq.key]) {
          callback(new Error("[LaunchDarkly] Cycle detected in prerequisites when evaluating feature key " + prereq.key), null);
          return;
        }
        store.get(prereq.key, function(f) {
          // If the flag does not exist in the store or is not on, the prerequisite
          // is not satisfied
          if (!f || !f.on) {
            callback(new Error("Unsatisfied prerequisite"), null);
            return;
          }
          eval_internal(f, user, store, events, visited, function(err, value) {
            // If there was an error, the value is null, the variation index is out of range, 
            // or the value does not match the indexed variation the prerequisite is not satisfied
            var variation = get_variation(f, prereq.variation);
            events.push(create_flag_event(f.key, user, variation, null));
            if (err || value === null || variation === null || value != variation) {
              callback(new Error("Unsatisfied prerequisite"), null)
            } else { 
              // The prerequisite was satisfied
              callback(null, null);
            }
          });          
        });
      }, 
      function(err, results) {
        var i;
        // If the error is that prerequisites weren't satisfied, we don't return an error,
        // because we want to serve the 'offVariation'
        if (err) {
          cb(null, null, events);
          return;
        } 
        evalRules(flag, user, function(e, variation) {
          cb(e, variation, events);
        });
      })
  } else {
    evalRules(flag, user, function(e, variation) {
      cb(e, variation, events);
    });
  }
}

function evalRules(flag, user, cb) {
  var i, j;
  var target;
  var variation;
  var rule;
  // Check target matches
  for (i = 0; i < flag.targets.length; i++) {
    target = flag.targets[i];

    if (!target.values) {
      continue;
    }

    for (j = 0; j < target.values.length; j++) {
      if (user.key === target.values[j]) {
        variation = get_variation(flag, target.variation);
        cb(variation === null ? new Error("Undefined variation") : null, variation);
        return;
      }
    }
  }

  // Check rules
  for (i = 0; i < flag.rules.length; i++) {
    rule = flag.rules[i];
    if (match_user(rule, user)) {
      variation = variation_for_user(rule, user, flag);
      cb(variation === null ? new Error("Undefined variation") : null, variation);
      return;
    }
  }

  // Check the fallthrough
  variation = variation_for_user(flag.fallthrough, user, flag);
  cb(variation === null ? new Error("Undefined variation") : null, variation);
}

function rule_match_user(r, user) {
  var i;

  if (!r.clauses) {
    return false;
  }

  // A rule matches if all its clauses match
  for (i = 0; i < r.clauses; i++) {
    if (!clause_match_user(r.clauses[i], user)) {
      return false;
    }
  }
  return true;
}

function clause_match_user(c, user) {
  var uValue;
  var matchFn;
  var i;

  uValue = user_value(user, c.attribute);

  if (uValue === null) {
    return false;
  }

  matchFn = operators.fn(c.op)

  // The user's value is an array
  if (Array === uValue.constructor) {
    for (i = 0; i < uValue.length; i++) {
      if (match_any(matchFn, uValue[i], c.values)) {
        return maybe_negate(c, true);
      }
    }
    return maybe_negate(c, false);
  }

  return maybe_negate(c, match_any(matchFn, uValue, c.values));
}

function maybe_negate(c, b) {
  if (c.negate) {
    return !b;
  } else {
    return b;
  }
}

function match_any(matchFn, value, values) {
  var i = 0;

  for (i = 0; i < values.length; i++) {
    if (matchFn(value, values[i])) {
      return true;
    }
  }

  return false;
}

// Given an index, return the variation value, or null if 
// the index is invalid
function get_variation(flag, index) {
  if (index >= flag.variations.length) {
    return null;
  } else {
    return flag.variations[index];
  }
}

// Given a variation or rollout 'r', select
// the variation for the given user
function variation_for_user(r, user, flag) {
  var bucketBy;
  var bucket;
  var sum;
  var i;
  var variation;
  if (r.variation != null) {
    // This represets a fixed variation; return it
    return get_variation(flag, r.variation);
  } else if (r.rollout != null) {
    // This represents a percentage rollout. Assume 
    // we're rolling out by key
    bucketBy = r.rollout.bucketBy != null ? r.rollout.bucketBy : "key";
    bucket = bucket_user(user, flag.key, bucketBy, flag.salt);

    for (i = 0; i < r.rollout.variations.length; i++) {
      variation = r.rollout.variations[i];
      sum += variation.weight / 100000.0;
      if (bucket < sum) {
        return get_variation(flag, variation);
      }
    }
  }

  return null;
}

// Fetch an attribute value from a user object. Automatically
// navigates into the custom array when necessary
function user_value(user, attr) {
  if (builtins.includes(attr)) {
    return user[attr];
  } 
  if (user.custom) {
    return user.custom[attr];
  }
  return null;
}

// Compute a percentile for a user
function bucket_user(user, key, attr, salt) {
  var uValue
  var idHash

  uValue = user_value(user, attr);

  if (!uValue) {
    return 0;
  }

  if (user.secondary) {
    idHash += "." + user.secondary;
  }

  hashKey = util.format("%s.%s.%s", key, salt, idHash);
  hashVal = parseInt(sha1(hashKey).substring(0,15), 16);

  result = hashVal / 0xFFFFFFFFFFFFFFF;
  return result;
}

function create_flag_event(key, user, value, default_val) {
  return {
    "kind": "feature",
    "key": key,
    "user": user,
    "value": value,
    "default": default_val,
    "creationDate": new Date().getTime()
  };
}

module.exports = {evaluate: evaluate, create_flag_event: create_flag_event};