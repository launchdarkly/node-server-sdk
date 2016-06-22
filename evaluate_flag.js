var operators = require('./operators');

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

var noop = function(){};

function evaluate(flag, user, store, cb) {
  cb = cb || noop;
  if (!user || !user.key) {
    cb(null, null);
    return;
  }

  if (!flag || flag.deleted) {
    cb(null, null);
    return;
  }

  if (!flag.on) {
    // Return the off variation if defined and valid
    if (flag.offVariation && flag.offVariation < flag.variations.length) {
      cb(null, flag.variations[flag.offVariation]);
      return
    }
    // Otherwise, return the default variation
    else {
      cb(null, null);
    }
  }

  eval(flag, user, store, [], {}, cb);
  return;
}

function eval(flag, user, store, events, visited, cb) {
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
          // If the flag does not exist in the store, is deleted, or is not on, the prerequisite
          // is not satisfied
          if (!f || f.deleted || !f.on) {
            callback(new Error("Unsatisfied prerequisite"), null);
            return;
          }
          eval(f, user, store, events, visited, function(err, value) {
            // If there was an error, the value is null, the variation index is out of range, 
            // or the value does not match the indexed variation the prerequisite is not satisfied
            if (err || value === null || len(f.variations) <= prereq.variation || value != f.variations[prereq.variation]) {
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
        if (err) {
          cb(null, null);
          return;
        } 
        evalRules(flag, user, cb);
      })
  } else {
    evalRules(flag, user, cb);
  }
}

function evalRules(flag, user, cb) {
  // Check target matches

  // Check rules

  // Check the fallthrough
}

function create_flag_event(key, user, value, default_val) {
  var event = {
    "kind": "feature",
    "key": key,
    "user": user,
    "value": value,
    "default": default_val,
    "creationDate": new Date().getTime()
  };

module.exports = [evaluate, create_flag_event];