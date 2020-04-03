const errors = require('./errors');

exports.deprecated = (oldName, newName) => '"' + oldName + '" is deprecated, please use "' + newName + '"';

exports.httpErrorMessage = (status, context, retryMessage) => {
  let desc;
  if (status) {
    desc = 'error ' + status + (status === 401 ? ' (invalid SDK key)' : '');
  } else {
    desc = 'I/O error';
  }
  const action = errors.isHttpErrorRecoverable(status) ? retryMessage : 'giving up permanently';
  return 'Received ' + desc + ' for ' + context + ' - ' + action;
};

exports.missingUserKeyNoEvent = () => 'User was unspecified or had no key; event will not be sent';

exports.optionBelowMinimum = (name, value, min) =>
  'Config option "' + name + '" had invalid value of ' + value + ', using minimum of ' + min + ' instead';

exports.unknownOption = name => 'Ignoring unknown config option "' + name + '"';

exports.wrongOptionType = (name, expectedType, actualType) =>
  'Config option "' + name + '" should be of type ' + expectedType + ', got ' + actualType + ', using default value';

exports.wrongOptionTypeBoolean = (name, actualType) =>
  'Config option "' + name + '" should be a boolean, got ' + actualType + ', converting to boolean';
