var configuration = require('../configuration');

describe('configuration', function() {
  const defaults = configuration.defaults();

  function emptyConfigWithMockLogger() {
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    return { logger };
  }

  function expectDefault(name) {
    const configIn = emptyConfigWithMockLogger();
    const config = configuration.validate(configIn);
    expect(config[name]).toBe(defaults[name]);
    expect(configIn.logger.warn).not.toHaveBeenCalled();
  }

  // Even if checkDeprecated is not currently used in this file, please do not
  // remove it, since we may deprecate an option in the future and should use this
  // logic if we do.
  function checkDeprecated(oldName, newName, value) {
    it(`allows "${oldName}" as a deprecated equivalent to "${newName}"`, function() {
      const configIn = emptyConfigWithMockLogger();
      configIn[oldName] = value;
      const config1 = configuration.validate(configIn);
      expect(config1[newName]).toEqual(value);
      expect(config1[oldName]).toBeUndefined();
      expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
    });
  }

  function checkBooleanProperty(name) {
    it(`enforces boolean type and default for "${name}"`, () => {
      expectDefault(name);

      const configIn1 = emptyConfigWithMockLogger();
      configIn1[name] = true;
      const config1 = configuration.validate(configIn1);
      expect(config1[name]).toBe(true);
      expect(configIn1.logger.warn).not.toHaveBeenCalled();

      const configIn2 = emptyConfigWithMockLogger();
      configIn2[name] = false;
      const config2 = configuration.validate(configIn2);
      expect(config2[name]).toBe(false);
      expect(configIn2.logger.warn).not.toHaveBeenCalled();

      const configIn3 = emptyConfigWithMockLogger();
      configIn3[name] = 'abc';
      const config3 = configuration.validate(configIn3);
      expect(config3[name]).toBe(true);
      expect(configIn3.logger.warn).toHaveBeenCalledTimes(1);

      const configIn4 = emptyConfigWithMockLogger();
      configIn4[name] = 0;
      const config4 = configuration.validate(configIn4);
      expect(config4[name]).toBe(false);
      expect(configIn4.logger.warn).toHaveBeenCalledTimes(1);
    });
  }

  checkBooleanProperty('stream');
  checkBooleanProperty('sendEvents');
  checkBooleanProperty('offline');
  checkBooleanProperty('useLdd');
  checkBooleanProperty('allAttributesPrivate');
  checkBooleanProperty('diagnosticOptOut');

  function checkNumericProperty(name, validValue) {
    it(`enforces numeric type and default for "${name}"`, () => {
      expectDefault(name);

      const configIn1 = emptyConfigWithMockLogger();
      configIn1[name] = validValue;
      const config1 = configuration.validate(configIn1);
      expect(config1[name]).toBe(validValue);
      expect(configIn1.logger.warn).not.toHaveBeenCalled();

      const configIn2 = emptyConfigWithMockLogger();
      configIn2[name] = 'no';
      const config2 = configuration.validate(configIn2);
      expect(config2[name]).toBe(defaults[name]);
      expect(configIn2.logger.warn).toHaveBeenCalledTimes(1);
    });
  }

  checkNumericProperty('timeout', 10);
  checkNumericProperty('capacity', 500);
  checkNumericProperty('flushInterval', 45);
  checkNumericProperty('pollInterval', 45);
  checkNumericProperty('contextKeysCapacity', 500);
  checkNumericProperty('contextKeysFlushInterval', 45);
  checkNumericProperty('diagnosticRecordingInterval', 110);

  function checkNumericRange(name, minimum, maximum) {
    if (minimum !== undefined) {
      it(`enforces minimum for "${name}"`, () => {
        const configIn = emptyConfigWithMockLogger();
        configIn[name] = minimum - 1;
        const config = configuration.validate(configIn);
        expect(config[name]).toBe(minimum);
        expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
      });
    }
    if (maximum !== undefined) {
      it(`enforces maximum for "${name}"`, () => {
        const configIn = emptyConfigWithMockLogger();
        configIn[name] = maximum + 1;
        const config = configuration.validate(configIn);
        expect(config[name]).toBe(maximum);
        expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
      });
    }
  }

  checkNumericRange('pollInterval', 30);
  checkNumericRange('diagnosticRecordingInterval', 60);

  function checkUriProperty(name) {
    expectDefault(name);

    const configIn1 = emptyConfigWithMockLogger();
    configIn1[name] = 'http://test.com/';
    const config1 = configuration.validate(configIn1);
    expect(config1[name]).toEqual('http://test.com'); // trailing slash is removed
    expect(configIn1.logger.warn).not.toHaveBeenCalled();

    const configIn2 = emptyConfigWithMockLogger();
    configIn2[name] = 3;
    const config2 = configuration.validate(configIn2);
    expect(config2[name]).toEqual(defaults[name]);
    expect(configIn2.logger.warn).toHaveBeenCalledTimes(1);
  }

  checkUriProperty('baseUri');
  checkUriProperty('streamUri');
  checkUriProperty('eventsUri');

  it('enforces array value for privateAttributes', () => {
    const configIn0 = emptyConfigWithMockLogger();
    const config0 = configuration.validate(configIn0);
    expect(config0.privateAttributes).toEqual([]);
    expect(configIn0.logger.warn).not.toHaveBeenCalled();

    const configIn1 = emptyConfigWithMockLogger();
    configIn1.privateAttributes = [ 'a' ];
    const config1 = configuration.validate(configIn1);
    expect(config1.privateAttributes).toEqual([ 'a' ]);
    expect(configIn1.logger.warn).not.toHaveBeenCalled();

    const configIn2 = emptyConfigWithMockLogger();
    configIn2.privateAttributes = 'no';
    const config2 = configuration.validate(configIn2);
    expect(config2.privateAttributes).toEqual([]);
    expect(configIn2.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('should not share the default featureStore across different config instances', () => {
    var config1 = configuration.validate({});
    var config2 = configuration.validate({});
    expect(config1.featureStore).not.toEqual(config2.featureStore);
  });

  it('complains if you set an unknown property', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.unsupportedThing = true;
    configuration.validate(configIn);
    expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('throws an error if you pass in a logger with missing methods', () => {
    const methods = ['error', 'warn', 'info', 'debug'];

    methods.forEach(method => {
      const configIn = emptyConfigWithMockLogger();
      delete configIn.logger[method];
      expect(() => configuration.validate(configIn)).toThrow(/Provided logger instance must support .* method/);
    });
  });

  it('handles a valid application id', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.application = {id: 'test-application'};
    expect(configuration.validate(configIn).application.id).toEqual('test-application');
  });

  it('logs a warning with an invalid application id', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.application = {id: 'test #$#$#'};
    expect(configuration.validate(configIn).application.id).toBeUndefined();
    expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('handles a valid application version', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.application = {version: 'test-version'};
    expect(configuration.validate(configIn).application.version).toEqual('test-version');
  });

  it('logs a warning with an invalid application version', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.application = {version: 'test #$#$#'};
    expect(configuration.validate(configIn).application.version).toBeUndefined();
    expect(configIn.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('includes application id and version in tags when present', () => {
    expect(configuration.getTags({application: {id: 'test-id', version: 'test-version'}}))
      .toEqual({'application-id': ['test-id'], 'application-version': ['test-version']});
  });

  it('handles the conversion of renamed options', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.userKeysCapacity = 1234;
    configIn.userKeysFlushInterval = 5678;
    const updatedConfig = configuration.validate(configIn);
    expect(updatedConfig.contextKeysCapacity).toEqual(1234);
    expect(updatedConfig.contextKeysFlushInterval).toEqual(5678);
    expect(updatedConfig.userKeysCapacity).toBeUndefined();
    expect(updatedConfig.userKeysFlushInterval).toBeUndefined();
  });

  it('does not override keys with renamed keys', () => {
    const configIn = emptyConfigWithMockLogger();
    configIn.contextKeysCapacity = 9999;
    configIn.contextKeysFlushInterval = 8888;

    configIn.userKeysCapacity = 1234;
    configIn.userKeysFlushInterval = 5678;

    const updatedConfig = configuration.validate(configIn);
    expect(updatedConfig.contextKeysCapacity).toEqual(9999);
    expect(updatedConfig.contextKeysFlushInterval).toEqual(8888);
    expect(updatedConfig.userKeysCapacity).toBeUndefined();
    expect(updatedConfig.userKeysFlushInterval).toBeUndefined();
  });
});
