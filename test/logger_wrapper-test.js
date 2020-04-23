const LoggerWrapper = require('../logger_wrapper');

describe('LoggerWrapper', function () {

  function mockLogger() {
    return {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
  }

  const levels = ['error', 'warn', 'info', 'debug'];

  it('throws an error if you pass in a logger that does not conform to the LDLogger schema', () => {
    const fallbackLogger = mockLogger();

    // If the method does not exist
    levels.forEach(method => {
      const logger = mockLogger();
      delete logger[method];
      expect(() => LoggerWrapper(logger, fallbackLogger)).toThrow(/Provided logger instance must support .* method/);
    });

    // If the method is not a function
    levels.forEach(method => {
      const logger = mockLogger();
      logger[method] = 'invalid';
      expect(() => LoggerWrapper(logger, fallbackLogger)).toThrow(/Provided logger instance must support .* method/);
    });
  });

  it('If a logger method throws an error, the error is caught and logged, then the fallback logger is called', () => {
    const err = Error('Something bad happened');

    levels.forEach(level => {
      const logger = mockLogger();
      logger[level] = jest.fn(() => {
        throw err
      });
      const fallbackLogger = mockLogger();
      const wrappedLogger = LoggerWrapper(logger, fallbackLogger);

      expect(() => wrappedLogger[level]('this is a logline', 'with multiple', 'arguments')).not.toThrow();

      expect(fallbackLogger.error).toHaveBeenNthCalledWith(1, 'Error calling provided logger instance method ' + level + ': ' + err);

      const nthCall = level === 'error' ? 2 : 1;
      expect(fallbackLogger[level]).toHaveBeenNthCalledWith(nthCall, 'this is a logline', 'with multiple', 'arguments');
    });
  });
});
