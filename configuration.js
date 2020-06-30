const winston = require('winston');
const InMemoryFeatureStore = require('./feature_store');
const messages = require('./messages');
const LoggerWrapper = require('./logger_wrapper');

module.exports = (function() {
  const defaults = function() {
    return {
      baseUri: 'https://app.launchdarkly.com',
      streamUri: 'https://stream.launchdarkly.com',
      eventsUri: 'https://events.launchdarkly.com',
      stream: true,
      streamInitialReconnectDelay: 1,
      sendEvents: true,
      timeout: 5,
      capacity: 10000,
      flushInterval: 5,
      pollInterval: 30,
      offline: false,
      useLdd: false,
      allAttributesPrivate: false,
      privateAttributeNames: [],
      inlineUsersInEvents: false,
      userKeysCapacity: 1000,
      userKeysFlushInterval: 300,
      diagnosticOptOut: false,
      diagnosticRecordingInterval: 900,
      featureStore: InMemoryFeatureStore(),
    };
  };

  const typesForPropertiesWithNoDefault = {
    // Add a value here if we add a configuration property whose type cannot be determined by looking
    // in baseDefaults (for instance, the default is null but if the value isn't null it should be a
    // string). The allowable values are 'boolean', 'string', 'number', 'object', 'function', or
    // 'factory' (the last one means it can be either a function or an object).
    eventProcessor: 'object',
    featureStore: 'object',
    logger: 'object', // winston.Logger
    proxyAgent: 'object',
    proxyAuth: 'string',
    proxyHost: 'string',
    proxyPort: 'number',
    proxyScheme: 'string',
    tlsParams: 'object', // LDTLSOptions
    streamInitialReconnectDelayMillis: 'number', // deprecated - overridden by streamInitialReconnectDelay
    updateProcessor: 'factory', // gets special handling in validation
    wrapperName: 'string',
    wrapperVersion: 'string',
  };

  /* eslint-disable camelcase */
  const deprecatedOptions = {
    base_uri: 'baseUri',
    stream_uri: 'streamUri',
    events_uri: 'eventsUri',
    send_events: 'sendEvents',
    flush_interval: 'flushInterval',
    poll_interval: 'pollInterval',
    proxy_host: 'proxyHost',
    proxy_port: 'proxyPort',
    proxy_auth: 'proxyAuth',
    feature_store: 'featureStore',
    use_ldd: 'useLdd',
    all_attributes_private: 'allAttributesPrivate',
    private_attribute_names: 'privateAttributeNames',
  };
  /* eslint-enable camelcase */

  function checkDeprecatedOptions(configIn) {
    const config = configIn;
    Object.keys(deprecatedOptions).forEach(oldName => {
      if (config[oldName] !== undefined) {
        const newName = deprecatedOptions[oldName];
        config.logger.warn(messages.deprecated(oldName, newName));
        if (config[newName] === undefined) {
          config[newName] = config[oldName];
        }
        delete config[oldName];
      }
    });
  }

  function applyDefaults(config, defaults) {
    // This works differently from Object.assign() in that it will *not* override a default value
    // if the provided value is explicitly set to null.
    const ret = Object.assign({}, config);
    Object.keys(defaults).forEach(name => {
      if (ret[name] === undefined || ret[name] === null) {
        ret[name] = defaults[name];
      }
    });
    return ret;
  }

  function canonicalizeUri(uri) {
    return uri.replace(/\/+$/, '');
  }

  function validateTypesAndNames(configIn, defaultConfig) {
    const config = configIn;
    const typeDescForValue = value => {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (Array.isArray(value)) {
        return 'array';
      }
      const t = typeof value;
      if (t === 'boolean' || t === 'string' || t === 'number') {
        return t;
      }
      return 'object';
    };
    Object.keys(config).forEach(name => {
      const value = config[name];
      if (value !== null && value !== undefined) {
        const defaultValue = defaultConfig[name];
        const typeDesc = typesForPropertiesWithNoDefault[name];
        if (defaultValue === undefined && typeDesc === undefined) {
          config.logger.warn(messages.unknownOption(name));
        } else {
          const expectedType = typeDesc || typeDescForValue(defaultValue);
          const actualType = typeDescForValue(value);
          if (actualType !== expectedType) {
            if (expectedType === 'factory' && (typeof value === 'function' || typeof value === 'object')) {
              // for some properties, we allow either a factory function or an instance
              return;
            }
            if (expectedType === 'boolean') {
              config[name] = !!value;
              config.logger.warn(messages.wrongOptionTypeBoolean(name, actualType));
            } else {
              config.logger.warn(messages.wrongOptionType(name, expectedType, actualType));
              config[name] = defaultConfig[name];
            }
          }
        }
      }
    });
  }

  function enforceMinimum(configIn, name, min) {
    const config = configIn;
    if (config[name] < min) {
      config.logger.warn(messages.optionBelowMinimum(name, config[name], min));
      config[name] = min;
    }
  }

  function fallbackLogger() {
    const prefixFormat = winston.format(info => {
      // eslint-disable-next-line no-param-reassign
      info.message = `[LaunchDarkly] ${info.message ? info.message : ''}`;
      return info;
    });

    return winston.createLogger({
      level: 'info',
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(prefixFormat(), winston.format.simple()),
        }),
      ],
    });
  }

  function validate(options) {
    let config = Object.assign({}, options || {});

    config.logger = config.logger ? LoggerWrapper(config.logger, fallbackLogger()) : fallbackLogger();

    checkDeprecatedOptions(config);

    const defaultConfig = defaults();
    config = applyDefaults(config, defaultConfig);

    validateTypesAndNames(config, defaultConfig);

    config.baseUri = canonicalizeUri(config.baseUri);
    config.streamUri = canonicalizeUri(config.streamUri);
    config.eventsUri = canonicalizeUri(config.eventsUri);

    enforceMinimum(config, 'pollInterval', 30);
    enforceMinimum(config, 'diagnosticRecordingInterval', 60);

    return config;
  }

  return {
    validate: validate,
    defaults: defaults,
  };
})();
