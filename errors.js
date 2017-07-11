function createCustomError(name) {
  function CustomError(message) {
    Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
    this.message = message;
  }

  CustomError.prototype = new Error();
  CustomError.prototype.name = name;
  CustomError.prototype.constructor = CustomError;

  return CustomError;
}

exports.LDPollingError = createCustomError('LaunchDarklyPollingError');
exports.LDStreamingError = createCustomError('LaunchDarklyStreamingError');
exports.LDClientError = createCustomError('LaunchDarklyClientError');
