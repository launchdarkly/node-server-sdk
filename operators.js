
var semver = require('semver');

function semVerOperator(fn) {
  return function(a, b) {
    var av = parseSemVer(a), bv = parseSemVer(b);
    return (av && bv) ? fn(av, bv) : false;
  };
}

function parseSemVer(input) {
  var ret = semver.parse(input);
  if (!ret) {
    input = addZeroVersionComponent(input);
    ret = semver.parse(input);
    if (!ret) {
      input = addZeroVersionComponent(input);
      ret = semver.parse(input);
    }
  }
  return ret;
}

function addZeroVersionComponent(input) {
  // allows for loose versions like "2" or "2.0-rc1"
  var matches = new RegExp("^([0-9.]*)(.*)").exec(input);
  if (!matches) {
    return input + ".0";
  }
  return matches[1] + ".0" + matches[2];
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

var operator_none = function(a, b) {
  return false;
}

function fn(op) {
  return operators[op] || operator_none;
}

module.exports = {operators: operators, fn: fn};