var errors = require('./errors');

exports.deprecated = function(oldName, newName) {
  return '"' + oldName + '" is deprecated, please use "' + newName + '"';
};

exports.httpErrorMessage = function(status, context, retryMessage) {
  return 'Received error ' + status
    + (status == 401 ? ' (invalid SDK key)' : '')
    + ' for ' + context
    + ' - ' + (errors.isHttpErrorRecoverable(status) ? retryMessage : 'giving up permanently');
};

exports.missingUserKeyNoEvent = function() {
  return 'User was unspecified or had no key; event will not be sent';
};
