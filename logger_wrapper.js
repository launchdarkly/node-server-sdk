const logLevels = ['error', 'warn', 'info', 'debug'];

/**
 * Asserts that the caller-supplied logger contains all required methods
 * and wraps it in an exception handler that falls back to the fallbackLogger
 * @param {LDLogger} logger
 * @param {LDLogger} fallbackLogger
 */
function LoggerWrapper(logger, fallbackLogger) {
  validateLogger(logger);

  const wrappedLogger = {};
  logLevels.forEach(level => {
    wrappedLogger[level] = wrapLoggerLevel(logger, fallbackLogger, level);
  });

  return wrappedLogger;
}

function validateLogger(logger) {
  logLevels.forEach(level => {
    if (!logger[level] || typeof logger[level] !== 'function') {
      throw new Error('Provided logger instance must support logger.' + level + '(...) method');
    }
  });
}

function wrapLoggerLevel(logger, fallbackLogger, level) {
  return function wrappedLoggerMethod() {
    try {
      return logger[level].apply(logger, arguments);
    } catch (err) {
      fallbackLogger.error('Error calling provided logger instance method ' + level + ': ' + err);
      fallbackLogger[level].apply(fallbackLogger, arguments);
    }
  };
}

module.exports = LoggerWrapper;
