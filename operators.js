
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
      return Date.parse(a) < Date.parse(b);
    } else if (typeof a === 'number') {
      return a < b;
    }
  },
  "after": function(a, b) {
    if (typeof a === 'string') {
      return Date.parse(a) > Date.parse(b);
    } else if (typeof a === 'number') {
      return a > b;
    }
  }
}

var operator_none = function(a, b) {
  return false;
}

function fn(op) {
  return operators[op] || operator_none;
}

module.exports = {operators: operators, fn: fn};