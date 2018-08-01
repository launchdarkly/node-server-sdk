var FeatureStoreEventWrapper = require('./feature_store_event_wrapper');
var RedisFeatureStore = require('./redis_feature_store');
var Requestor = require('./requestor');
var EventEmitter = require('events').EventEmitter;
var EventProcessor = require('./event_processor');
var PollingProcessor = require('./polling');
var StreamingProcessor = require('./streaming');
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
      queue = [],
      requestor,
      updateProcessor,
      eventProcessor,
      flushTimer;

  config = configuration.validate(config);

  // Initialize global tunnel if proxy options are set
  if (config.proxyHost && config.proxyPort ) {
    config.proxyAgent = createProxyAgent(config);
  }

  config.featureStore = FeatureStoreEventWrapper(config.featureStore, client);

  var maybeReportError = createErrorReporter(client, config.logger);

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

  if (config.updateProcessor) {
    updateProcessor = config.updateProcessor;
  } else if (config.useLdd || config.offline) {
    updateProcessor = NullUpdateProcessor();
  } else {
    requestor = Requestor(sdkKey, config);

    if (config.stream) {
      config.logger.info("Initializing stream processor to receive feature flag updates");
      updateProcessor = StreamingProcessor(sdkKey, config, requestor);
    } else {
      config.logger.info("Initializing polling processor to receive feature flag updates");
      config.logger.warn("You should only disable the streaming API if instructed to do so by LaunchDarkly support");
      updateProcessor = PollingProcessor(config, requestor);
    }
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
      client.once('ready', resolve);
      client.once('failed', reject);
    });
  };

  client.variation = function(key, user, defaultVal, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      sanitizeUser(user);
      var variationErr;

      if (this.isOffline()) {
        config.logger.info("Variation called in offline mode. Returning default value.");
        return resolve(defaultVal);
      }

      else if (!key) {
        variationErr = new errors.LDClientError('No feature flag key specified. Returning default value.');
        maybeReportError(variationError);
        sendFlagEvent(key, null, user, null, defaultVal, defaultVal);
        return resolve(defaultVal);
      }

      else if (user && user.key === "") {
        config.logger.warn("User key is blank. Flag evaluation will proceed, but the user will not be stored in LaunchDarkly");
      }

      if (!initComplete) {
        config.featureStore.initialized(function(storeInited) {
          if (storeInited) {
            config.logger.warn("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using last known values from feature store")
            variationInternal(key, user, defaultVal, resolve, reject);
          } else {
            variationErr = new errors.LDClientError("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using default value");
            maybeReportError(variationErr);
            sendFlagEvent(key, null, user, null, defaultVal, defaultVal);
            return resolve(defaultVal);
          }
        });
        return;
      }

      variationInternal(key, user, defaultVal, resolve, reject);
    }.bind(this)), callback);
  }

  function variationInternal(key, user, defaultVal, resolve, reject) {
    config.featureStore.get(dataKind.features, key, function(flag) {
      if (!user) {
        variationErr = new errors.LDClientError('No user specified. Returning default value.');
        maybeReportError(variationErr);
        sendFlagEvent(key, flag, user, null, defaultVal, defaultVal);
        return resolve(defaultVal);
      }

      evaluate.evaluate(flag, user, config.featureStore, function(err, variation, value, events) {
        var i;
        var version = flag ? flag.version : null;

        if (err) {
          maybeReportError(new errors.LDClientError('Encountered error evaluating feature flag:' + (err.message ? (': ' + err.message) : err)));
        }

        // Send off any events associated with evaluating prerequisites. The events
        // have already been constructed, so we just have to push them onto the queue.
        if (events) {
          for (i = 0; i < events.length; i++) {
            eventProcessor.sendEvent(events[i]);
          }
        }

        if (value === null) {
          config.logger.debug("Result value is null in variation");
          sendFlagEvent(key, flag, user, null, defaultVal, defaultVal);
          return resolve(defaultVal);
        } else {
          sendFlagEvent(key, flag, user, variation, value, defaultVal);
          return resolve(value);
        }
      });
    });
  }

  client.toggle = function(key, user, defaultVal, callback) {
    config.logger.warn("toggle() is deprecated. Call 'variation' instead");
    return client.variation(key, user, defaultVal, callback);
  }

  client.allFlags = function(user, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      sanitizeUser(user);
      var results = {};

      if (this.isOffline()) {
        config.logger.info("allFlags() called in offline mode. Returning empty map.");
        return resolve({});
      }

      if (!user) {
        config.logger.info("allFlags() called without user. Returning empty map.");
        return resolve({});
      }

      config.featureStore.all(dataKind.features, function(flags) {
        async.forEachOf(flags, function(flag, key, iterateeCb) {
          // At the moment, we don't send any events here
          evaluate.evaluate(flag, user, config.featureStore, function(err, variation, value, events) {
            results[key] = value;
            setImmediate(iterateeCb);
          })
        }, function(err) {
          return err ? reject(err) : resolve(results);
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
    clearInterval(flushTimer);
  }

  client.isOffline = function() {
    return config.offline;
  }

  client.track = function(eventName, user, data) {
    sanitizeUser(user);
    var event = {"key": eventName,
                "user": user,
                "kind": "custom",
                "creationDate": new Date().getTime()};

    if (data) {
      event.data = data;
    }

    eventProcessor.sendEvent(event);
  };

  client.identify = function(user) {
    sanitizeUser(user);
    var event = {"key": user.key,
                 "kind": "identify",
                 "user": user,
                 "creationDate": new Date().getTime()};
    eventProcessor.sendEvent(event);
  };

  client.flush = function(callback) {
    return eventProcessor.flush(callback);
  };

  function sendFlagEvent(key, flag, user, variation, value, defaultVal) {
    var event = evaluate.createFlagEvent(key, flag, user, variation, value, defaultVal);
    eventProcessor.sendEvent(event);
  }

  function backgroundFlush() {
    client.flush().then(function() {}, function() {});
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

  flushTimer = setInterval(backgroundFlush, config.flushInterval * 1000);

  return client;
};

module.exports = {
  init: newClient,
  RedisFeatureStore: RedisFeatureStore,
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


function sanitizeUser(u) {
  if (!u) {
    return;
  }
  if (u['key']) {
    u['key'] = u['key'].toString();
  }
}
