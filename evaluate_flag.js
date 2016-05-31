var util = require('util');
var sha1 = require('node-sha1');
var operators = require('./operators');

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];




// TODO : because this accesses the store, it needs to be
// converted into an asynchronous function
function evaluate(flag, user, store, cb) {
  if (!user || !user.key) {
    cb(null);
    return;
  }

  if (!flag || flag.deleted) {
    cb(null);
    return;
  }

  if (!flag.on) {
    // Return the off variation if defined and valid
    if (flag.offVariation && flag.offVariation < flag.variations.length) {
      cb(flag.variations[flag.offVariation]);
      return
    }
    // Otherwise, return the default variation
    else {
      return null;
    }
  }

  return eval(flag, user, store);
}

function eval(flag, user, store, events, visited) {
  var index, prereqFlag;
  // Evaluate prerequisites, if any
  if (flag.prerequisites) {
    for (index = 0; index < flag.prerequisites.length; index++) {
      prereqFlag = store
    }
  }

  // Check target matches

  // Check rules

  // Check the fallthrough
}

module.exports = evaluate;