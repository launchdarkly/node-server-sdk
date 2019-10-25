const errors = require('./errors');

exports.deprecated = (oldName, newName) =>
  '"' + oldName + '" is deprecated, please use "' + newName + '"';

exports.httpErrorMessage = (status, context, retryMessage) =>
  'Received error ' + status
    + (status == 401 ? ' (invalid SDK key)' : '')
    + ' for ' + context
    + ' - ' + (errors.isHttpErrorRecoverable(status) ? retryMessage : 'giving up permanently');

exports.missingUserKeyNoEvent = () => 'User was unspecified or had no key; event will not be sent';
