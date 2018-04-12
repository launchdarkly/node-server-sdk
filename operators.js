
var semver = require('semver');

function semVerOperator(fn) {
  return function(a, b) {
    var av = parseSemVer(a), bv = parseSemVer(b);
    return (av && bv) ? fn(av, bv) : false;
  };
}

function parseSemVer(input) {
  if (input.startsWith("v")) {
    // the semver library tolerates a leading "v", but the standard does not.
    return null;
  }
  var ret = semver.parse(input);
  if (!ret) {
    var versionNumericComponents = new RegExp("^\\d+(\\.\\d+)?(\\.\\d+)?").exec(input);
    if (versionNumericComponents) {
      var transformed = versionNumericComponents[0];
      for (var i = 1; i < versionNumericComponents.length; i++) {
        if (versionNumericComponents[i] == undefined) {
          transformed = transformed + ".0";
        }
      }
      transformed = transformed + input.substring(versionNumericComponents[0].length);
      ret = semver.parse(transformed);
    }
  }
  return ret;
}

var operators = {
  "in": function(a, b) {
    return a === b;
  },
  "endsWith": function(a, b) {
    return typeof a === 'string' && a.endsWith(b);
  },
  "startsWith": function(a, b) {
    return typeof a === 'string' && a.startsWith(b);
  },
  "matches": function(a, b) {
    return typeof b === 'string' && new RegExp(b).test(a);
  },
  "contains": function(a, b) {
    return typeof a === 'string' && a.indexOf(b) > -1;
  },
  "lessThan": function(a, b) {
    return typeof a === 'number' && a < b;
  },
  "lessThanOrEqual": function(a, b) {
    return typeof a === 'number' && a <= b;
  },
  "greaterThan": function(a, b) {
    return typeof a === 'number' && a > b;
  },
  "greaterThanOrEqual": function(a, b) {
    return typeof a === 'number' && a >= b;
  },
  "before": function(a, b) {
    if (typeof a === 'string') {
      a = Date.parse(a);
    }
    if (typeof b === 'string') {
      b = Date.parse(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
      return a < b;
    }
    return false;
  },
  "after": function(a, b) {
    if (typeof a === 'string') {
      a = Date.parse(a);
    }
    if (typeof b === 'string') {
      b = Date.parse(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
      return a > b;
    }
    return false;
  },
  "semVerEqual": semVerOperator(function(a, b) { return a.compare(b) == 0; }),
  "semVerLessThan": semVerOperator(function(a, b) { return a.compare(b) < 0; }),
  "semVerGreaterThan": semVerOperator(function(a, b) { return a.compare(b) > 0; })
};

var operatorNone = function(a, b) {
  return false;
}

function fn(op) {
  return operators[op] || operatorNone;
}

module.exports = {operators: operators, fn: fn};