const semver = require('semver');

function semVerOperator(fn) {
  return (a, b) => {
    const av = parseSemVer(a), bv = parseSemVer(b);
    return (av && bv) ? fn(av, bv) : false;
  };
}

function parseSemVer(input) {
  if (input.startsWith('v')) {
    // the semver library tolerates a leading "v", but the standard does not.
    return null;
  }
  let ret = semver.parse(input);
  if (!ret) {
    const versionNumericComponents = new RegExp('^\\d+(\\.\\d+)?(\\.\\d+)?').exec(input);
    if (versionNumericComponents) {
      let transformed = versionNumericComponents[0];
      for (let i = 1; i < versionNumericComponents.length; i++) {
        if (versionNumericComponents[i] == undefined) {
          transformed = transformed + '.0';
        }
      }
      transformed = transformed + input.substring(versionNumericComponents[0].length);
      ret = semver.parse(transformed);
    }
  }
  return ret;
}

const operators = {
  in: (a, b) => a === b,
  endsWith: (a, b) => typeof a === 'string' && a.endsWith(b),
  startsWith: (a, b) => typeof a === 'string' && a.startsWith(b),
  matches: (a, b) => typeof b === 'string' && new RegExp(b).test(a),
  contains: (a, b) => typeof a === 'string' && a.indexOf(b) > -1,
  lessThan: (a, b) => typeof a === 'number' && a < b,
  lessThanOrEqual: (a, b) => typeof a === 'number' && a <= b,
  greaterThan: (a, b) => typeof a === 'number' && a > b,
  greaterThanOrEqual: (a, b) => typeof a === 'number' && a >= b,
  before: (a, b) => {
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
  after: (a, b) => {
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
  semVerEqual: semVerOperator((a, b) => a.compare(b) == 0),
  semVerLessThan: semVerOperator((a, b) => a.compare(b) < 0),
  semVerGreaterThan: semVerOperator((a, b) => a.compare(b) > 0)
};

const operatorNone = () => false;

function fn(op) {
  return operators[op] || operatorNone;
}

module.exports = {operators: operators, fn: fn};