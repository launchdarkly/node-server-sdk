
var operators = {
  "in": function(a, b) {
    if (a === b) {
      return true;
    }
    // TODO continue adding operators
  }
}

var operator_none = function(a, b) {
  return false;
}

function fn(op) {
  return operators[op] || operator_none;
}

module.exports = [operators, fn];