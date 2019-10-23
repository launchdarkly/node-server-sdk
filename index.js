var FeatureStoreEventWrapper = require('./feature_store_event_wrapper');
var RedisFeatureStore = require('./redis_feature_store');
var FileDataSource = require('./file_data_source');
var Requestor = require('./requestor');
var EventEmitter = require('events').EventEmitter;
var EventFactory = require('./event_factory');
var EventProcessor = require('./event_processor');
var PollingProcessor = require('./polling');
var StreamingProcessor = require('./streaming');
var FlagsStateBuilder = require('./flags_state');
var configuration = require('./configuration');
var evaluate = require('./evaluate_flag');
var messages = require('./messages');
var tunnel = require('tunnel');
var crypto = require('crypto');
var async = require('async');
var errors = require('./errors');
var wrapPromiseCallback = require('./utils/wrapPromiseCallback');
var dataKind = require('./versioned_data_kind');

function createErrorReporter(emitter, logger) {
  return function(error) {
    if (!error) {
      return;
    }

    if (emitter.listenerCount('error')) {
      emitter.emit('error', error);
    } else {
      logger.error(error.message);
    }
  };
}

global.setImmediate = global.setImmediate || process.nextTick.bind(process);

function NullEventProcessor() {
  return {
    sendEvent: function() {},
    flush: function(callback) {
      return wrapPromiseCallback(Promise.resolve(), callback);
    },
    close: function() {}
  };
}

function NullUpdateProcessor() {
  return {
    start: function(callback) {
      setImmediate(callback, null);
    },
    close: function() {}
  };
}

var newClient = function(sdkKey, config) {
  var client = new EventEmitter(),
      initComplete = false,
      failure,
      requestor,
      updateProcessor,
      eventProcessor,
      eventFactoryDefault,
      eventFactoryWithReasons;

  config = configuration.validate(config);
  
  // Initialize global tunnel if proxy options are set
  if (config.proxyHost && config.proxyPort ) {
    config.proxyAgent = createProxyAgent(config);
  }

  config.featureStore = FeatureStoreEventWrapper(config.featureStore, client);

  var maybeReportError = createErrorReporter(client, config.logger);

  eventFactoryDefault = EventFactory(false);
  eventFactoryWithReasons = EventFactory(true);

  if (config.eventProcessor) {
    eventProcessor = config.eventProcessor;
  } else {
    if (config.offline || !config.sendEvents) {
      eventProcessor = NullEventProcessor();
    } else {
      eventProcessor = EventProcessor(sdkKey, config, maybeReportError);
    }
  }

  if (!sdkKey && !config.offline) {
    throw new Error("You must configure the client with an SDK key");
  }

  var createDefaultUpdateProcessor = function(config) {
    if (config.useLdd || config.offline) {
      return NullUpdateProcessor();
    } else {
      requestor = Requestor(sdkKey, config);
  
      if (config.stream) {
        config.logger.info("Initializing stream processor to receive feature flag updates");
        return StreamingProcessor(sdkKey, config, requestor);
      } else {
        config.logger.info("Initializing polling processor to receive feature flag updates");
        config.logger.warn("You should only disable the streaming API if instructed to do so by LaunchDarkly support");
        return PollingProcessor(config, requestor);
      }
    }
  }
  var updateProcessorFactory = createDefaultUpdateProcessor;
  if (config.updateProcessor) {
    if (typeof config.updateProcessor === 'function') {
      updateProcessorFactory = config.updateProcessor;
    } else {
      updateProcessor = config.updateProcessor;
    }
  }
  if (!updateProcessor) {
    updateProcessor = updateProcessorFactory(config);
  }

  updateProcessor.start(function(err) {
    if (err) {
      var error;
      if ((err.status && err.status === 401) || (err.code && err.code === 401)) {
        error = new Error("Authentication failed. Double check your SDK key.");
      } else {
        error = err;
      }

      maybeReportError(error);
      client.emit('failed', error);
      failure = error;
    } else if (!initComplete) {
      initComplete = true;
      client.emit('ready');
    }
  });

  client.initialized = function() {
    return initComplete;
  };

  client.waitUntilReady = function() {
    config.logger.warn(messages.deprecated("waitUntilReady", "waitForInitialization"));

    if (initComplete) {
      return Promise.resolve();
    }

    return new Promise(function(resolve) {
      client.once('ready', resolve);
    });
  };

  client.waitForInitialization = function() {
    if (initComplete) {
      return Promise.resolve(client);
    }
    if (failure) {
      return Promise.reject(failure);
    }

    return new Promise(function(resolve, reject) {
      client.once('ready', function() { resolve(client) });
      client.once('failed', reject);
    });
  };

  client.variation = function(key, user, defaultVal, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      evaluateIfPossible(key, user, defaultVal, eventFactoryDefault,
        function(detail) {
          resolve(detail.value)
        },
        reject);
    }.bind(this)), callback);
  };

  client.variationDetail = function(key, user, defaultVal, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      evaluateIfPossible(key, user, defaultVal, eventFactoryWithReasons, resolve, reject);
    }.bind(this)), callback);
  };

  function errorResult(errorKind, defaultVal) {
    return { value: defaultVal, variationIndex: null, reason: { kind: 'ERROR', errorKind: errorKind } };
  };

  function evaluateIfPossible(key, user, defaultVal, eventFactory, resolve, reject) {
    if (!initComplete) {
      config.featureStore.initialized(function(storeInited) {
        if (storeInited) {
          config.logger.warn("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using last known values from feature store")
          variationInternal(key, user, defaultVal, eventFactory, resolve, reject);
        } else {
          var err = new errors.LDClientError("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using default value");
          maybeReportError(err);
          var result = errorResult('CLIENT_NOT_READY', defaultVal);
          eventProcessor.sendEvent(eventFactory.newUnknownFlagEvent(key, user, result));
          return resolve(result);
        }
      });
    } else {
      variationInternal(key, user, defaultVal, eventFactory, resolve, reject);
    }
  }

  // resolves to a "detail" object with properties "value", "variationIndex", "reason"
  function variationInternal(key, user, defaultVal, eventFactory, resolve, reject) {
    if (client.isOffline()) {
      config.logger.info("Variation called in offline mode. Returning default value.");
      return resolve(errorResult('CLIENT_NOT_READY', defaultVal));
    }

    else if (!key) {
      var err = new errors.LDClientError('No feature flag key specified. Returning default value.');
      maybeReportError(err);
      return resolve(errorResult('FLAG_NOT_FOUND', defaultVal));
    }

    if (user && user.key === "") {
      config.logger.warn("User key is blank. Flag evaluation will proceed, but the user will not be stored in LaunchDarkly");
    }

    config.featureStore.get(dataKind.features, key, function(flag) {

      if (!flag) {
        maybeReportError(new errors.LDClientError('Unknown feature flag "' + key + '"; returning default value'));
        var result = errorResult('FLAG_NOT_FOUND', defaultVal);
        eventProcessor.sendEvent(eventFactory.newUnknownFlagEvent(key, user, result));
        return resolve(result);
      }

      if (!user) {
        var variationErr = new errors.LDClientError('No user specified. Returning default value.');
        maybeReportError(variationErr);
        var result = errorResult('USER_NOT_SPECIFIED', defaultVal);
        eventProcessor.sendEvent(eventFactory.newDefaultEvent(flag, user, result));
        return resolve(result);
      }

      evaluate.evaluate(flag, user, config.featureStore, eventFactory, function(err, detail, events) {
        if (err) {
          maybeReportError(new errors.LDClientError('Encountered error evaluating feature flag:' + (err.message ? (': ' + err.message) : err)));
        }

        // Send off any events associated with evaluating prerequisites. The events
        // have already been constructed, so we just have to push them onto the queue.
        if (events) {
          for (var i = 0; i < events.length; i++) {
            eventProcessor.sendEvent(events[i]);
          }
        }

        if (detail.variationIndex === null) {
          config.logger.debug("Result value is null in variation");
          detail.value = defaultVal;
        }
        eventProcessor.sendEvent(eventFactory.newEvalEvent(flag, user, detail, defaultVal));
        return resolve(detail);
      });
    });
  }

  client.toggle = function(key, user, defaultVal, callback) {
    config.logger.warn("toggle() is deprecated. Call 'variation' instead");
    return client.variation(key, user, defaultVal, callback);
  }

  client.allFlags = function(user, callback) {
    config.logger.warn("allFlags() is deprecated. Call 'allFlagsState' instead and call toJSON() on the result");
    return wrapPromiseCallback(
      client.allFlagsState(user).then(function(state) {
        return state.allValues();
      }),
      callback);
  }

  client.allFlagsState = function(user, options, callback) {
    if (callback === undefined && typeof(options) === 'function') {
      callback = options;
      options = {};
    } else {
      options = options || {};
    }
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      if (this.isOffline()) {
        config.logger.info("allFlagsState() called in offline mode. Returning empty state.");
        return resolve(FlagsStateBuilder(false).build());
      }

      if (!user) {
        config.logger.info("allFlagsState() called without user. Returning empty state.");
        return resolve(FlagsStateBuilder(false).build());
      }

      var builder = FlagsStateBuilder(true);
      var clientOnly = options.clientSideOnly;
      var withReasons = options.withReasons;
      var detailsOnlyIfTracked = options.detailsOnlyForTrackedFlags;
      config.featureStore.all(dataKind.features, function(flags) {
        async.forEachOf(flags, function(flag, key, iterateeCb) {
          if (clientOnly && !flag.clientSide) {
            setImmediate(iterateeCb);
          } else {
            // At the moment, we don't send any events here
            evaluate.evaluate(flag, user, config.featureStore, eventFactoryDefault, function(err, detail, events) {
              if (err != null) {
                maybeReportError(new Error('Error for feature flag "' + flag.key + '" while evaluating all flags: ' + err));
              }
              builder.addFlag(flag, detail.value, detail.variationIndex, withReasons ? detail.reason : null, detailsOnlyIfTracked);
              setImmediate(iterateeCb);
            });
          }
        }, function(err) {
          return err ? reject(err) : resolve(builder.build());
        });
      });
    }.bind(this)), callback);
  }

  client.secureModeHash = function(user) {
    var hmac = crypto.createHmac('sha256', sdkKey);
    hmac.update(user.key);
    return hmac.digest('hex');
  }

  client.close = function() {
    eventProcessor.close();
    if (updateProcessor) {
      updateProcessor.close();
    }
    config.featureStore.close();
  }

  client.isOffline = function() {
    return config.offline;
  }

  client.track = function(eventName, user, data, metricValue) {
    if (!userExistsAndHasKey(user)) {
      config.logger.warn(messages.missingUserKeyNoEvent());
      return;
    }
    eventProcessor.sendEvent(eventFactoryDefault.newCustomEvent(eventName, user, data, metricValue));
  };

  client.identify = function(user) {
    if (!userExistsAndHasKey(user)) {
      config.logger.warn(messages.missingUserKeyNoEvent());
      return;
    }
    eventProcessor.sendEvent(eventFactoryDefault.newIdentifyEvent(user));
  };

  client.flush = function(callback) {
    return eventProcessor.flush(callback);
  };

  function userExistsAndHasKey(user) {
    if (user) {
      var key = user.key;
      return key !== undefined && key !== null && key !== "";
    }
    return false;
  }

  function deprecatedMethod(oldName, newName) {
    client[oldName] = function() {
      config.logger.warn(messages.deprecated(oldName, newName));
      return client[newName].apply(client, arguments);
    };
  }

  deprecatedMethod('all_flags', 'allFlags');
  deprecatedMethod('is_offline', 'isOffline');
  deprecatedMethod('secure_mode_hash', 'secureModeHash');

  return client;
};

module.exports = {
  init: newClient,
  RedisFeatureStore: RedisFeatureStore,
  FileDataSource: FileDataSource,
  errors: errors
};


function createProxyAgent(config) {
  var options = {
    proxy: {
      host: config.proxyHost,
      port: config.proxyPort,
      proxyAuth: config.proxyAuth
    }
  };

  if (config.proxyScheme === 'https') {
    if (!config.baseUri || config.baseUri.startsWith('https')) {
     return tunnel.httpsOverHttps(options);
    } else {
      return tunnel.httpOverHttps(options);
    }
  } else if (!config.baseUri || config.baseUri.startsWith('https')) {
    return tunnel.httpsOverHttp(options);
  } else {
    return tunnel.httpOverHttp(options);
  }
}
