const errors = require('./errors');

exports.deprecated = (oldName, newName) =>
  '"' + oldName + '" is deprecated, please use "' + newName + '"';

exports.httpErrorMessage = (status, context, retryMessage) =>
  'Received error ' + status
    + (status == 401 ? ' (invalid SDK key)' : '')
    + ' for ' + context
    + ' - ' + (errors.isHttpErrorRecoverable(status) ? retryMessage : 'giving up permanently');

exports.missingUserKeyNoEvent = () => 'User was unspecified or had no key; event will not be sent';

exports.unknownOption = name => 'Ignoring unknown config option "' + name + '"';

exports.wrongOptionType = (name, expectedType, actualType) =>
  'Config option "' + name + '" should be a ' + expectedType + ', got ' + actualType + ', using default value';

exports.wrongOptionTypeBoolean = (name, expectedType, actualType) =>
  'Config option "' + name + '" should be a ' + expectedType + ', got ' + actualType + ', converting to boolean';

exports.optionBelowMinimum = (name, value, min) =>
  'Config option "' + name + '" had invalid value of ' + value + ', using minimum of ' + min + ' instead';
