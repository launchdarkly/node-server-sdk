var operators = require('./operators');
var util = require('util');
var sha1 = require('node-sha1');
var async = require('async');

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

var noop = function(){};

function evaluate(flag, user, store, cb) {
  cb = cb || noop;
  if (!user || user.key === null || user.key === undefined) {
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

  eval_internal(flag, user, store, [], function(err, result, events) {
    if (err) {
      cb(err, result, events);
      return;
    }

    if (result === null) {
      // Return the off variation if defined and valid
      if (flag.offVariation != null) {
        cb(null, get_variation(flag, flag.offVariation), null);
      }
      // Otherwise, return the default variation
      else {
        cb(null, null, null);
      }
    } else {
      cb(err, result, events);
    }
  });
  return;
}

function eval_internal(flag, user, store, events, cb) {
  // Evaluate prerequisites, if any
  if (flag.prerequisites) {
    async.mapSeries(flag.prerequisites, 
      function(prereq, callback) {
        store.get(prereq.key, function(f) {
          // If the flag does not exist in the store or is not on, the prerequisite
          // is not satisfied
          if (!f || !f.on) {
            callback(new Error("Unsatisfied prerequisite"), null);
            return;
          }
          eval_internal(f, user, store, events, function(err, value) {
            // If there was an error, the value is null, the variation index is out of range, 
            // or the value does not match the indexed variation the prerequisite is not satisfied
            var variation = get_variation(f, prereq.variation);
            events.push(create_flag_event(f.key, user, value, null, f.version, flag.key));
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
        cb(variation === null ? new Error("Undefined variation for flag " + flag.key) : null, variation);
        return;
      }
    }
  }

  // Check rules
  for (i = 0; i < flag.rules.length; i++) {
    rule = flag.rules[i];
    if (rule_match_user(rule, user)) {
      variation = variation_for_user(rule, user, flag);
      cb(variation === null ? new Error("Undefined variation for flag " + flag.key) : null, variation);
      return;
    }
  }

  // Check the fallthrough
  variation = variation_for_user(flag.fallthrough, user, flag);
  cb(variation === null ? new Error("Undefined variation for flag " + flag.key) : null, variation);
}

function rule_match_user(r, user) {
  var i;

  if (!r.clauses) {
    return false;
  }

  // A rule matches if all its clauses match
  for (i = 0; i < r.clauses.length; i++) {
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
  var sum = 0;
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
      variate = r.rollout.variations[i];
      sum += variate.weight / 100000.0;
      if (bucket < sum) {
        return get_variation(flag, variate.variation);
      }
    }
  }

  return null;
}

// Fetch an attribute value from a user object. Automatically
// navigates into the custom array when necessary
function user_value(user, attr) {
  if (builtins.indexOf(attr) >= 0 && user.hasOwnProperty(attr)) {
    return user[attr];
  } 
  if (user.custom && user.custom.hasOwnProperty(attr)) {
    return user.custom[attr];
  }
  return null;
}

// Compute a percentile for a user
function bucket_user(user, key, attr, salt) {
  var uValue;
  var idHash;

  idHash = user_value(user, attr);

  if (idHash === null) {
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

function create_flag_event(key, user, value, default_val, version, prereqOf) {
  return {
    "kind": "feature",
    "key": key,
    "user": user,
    "value": value,
    "default": default_val,
    "creationDate": new Date().getTime(),
    "version": version,
    "prereqOf": prereqOf
  };
}

module.exports = {evaluate: evaluate, create_flag_event: create_flag_event};