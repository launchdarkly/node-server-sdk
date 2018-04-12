var FeatureStoreEventWrapper = require('./feature_store_event_wrapper');
var InMemoryFeatureStore = require('./feature_store');
var RedisFeatureStore = require('./redis_feature_store');
var Requestor = require('./requestor');
var EventEmitter = require('events').EventEmitter;
var EventProcessor = require('./event_processor');
var PollingProcessor = require('./polling');
var StreamingProcessor = require('./streaming');
var evaluate = require('./evaluate_flag');
var tunnel = require('tunnel');
var winston = require('winston');
var crypto = require('crypto');
var async = require('async');
var errors = require('./errors');
var package_json = require('./package.json');
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
    flush: function(callback) { callback(); },
    close: function() {}
  }
}

var newClient = function(sdkKey, config) {
  var client = new EventEmitter(),
      initComplete = false,
      queue = [],
      requestor,
      updateProcessor,
      eventProcessor,
      flushTimer;

  config = Object.assign({}, config || {});
  config.user_agent = 'NodeJSClient/' + package_json.version;

  config.base_uri = (config.base_uri || 'https://app.launchdarkly.com').replace(/\/+$/, "");
  config.stream_uri = (config.stream_uri || 'https://stream.launchdarkly.com').replace(/\/+$/, "");
  config.events_uri = (config.events_uri || 'https://events.launchdarkly.com').replace(/\/+$/, "");
  config.stream = (typeof config.stream === 'undefined') ? true : config.stream;
  config.send_events = (typeof config.send_events === 'undefined') ? true : config.send_events;
  config.timeout = config.timeout || 5;
  config.capacity = config.capacity || 1000;
  config.flush_interval = config.flush_interval || 5;  
  config.poll_interval = config.poll_interval > 30 ? config.poll_interval : 30;
  config.user_keys_capacity = config.user_keys_capacity || 1000;
  config.user_keys_flush_interval = config.user_keys_flush_interval || 300;
  // Initialize global tunnel if proxy options are set
  if (config.proxy_host && config.proxy_port ) {
    config.proxy_agent = createProxyAgent(config);
  }
  config.logger = (config.logger ||
    new winston.Logger({
      level: 'info',
      transports: [
        new (winston.transports.Console)(({
          formatter: function(options) {
            return '[LaunchDarkly] ' + (options.message ? options.message : '');
          }
        })),
      ]
    })
  );

  var featureStore = config.feature_store || InMemoryFeatureStore();
  config.feature_store = FeatureStoreEventWrapper(featureStore, client);

  var maybeReportError = createErrorReporter(client, config.logger);

  if (config.offline || !config.send_events) {
    eventProcessor = NullEventProcessor();
  } else {
    eventProcessor = EventProcessor(sdkKey, config, maybeReportError);
  }

  if (!sdkKey && !config.offline) {
    throw new Error("You must configure the client with an SDK key");
  }

  if (!config.use_ldd && !config.offline) {
    requestor = Requestor(sdkKey, config);

    if (config.stream) {
      config.logger.info("Initializing stream processor to receive feature flag updates");
      updateProcessor = StreamingProcessor(sdkKey, config, requestor);
    } else {
      config.logger.info("Initializing polling processor to receive feature flag updates");
      config.logger.warn("You should only disable the streaming API if instructed to do so by LaunchDarkly support");
      updateProcessor = PollingProcessor(config, requestor);
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
      } else if (!initComplete) {
        initComplete = true;
        client.emit('ready');
      }
    });
  } else {
    process.nextTick(function() {
      initComplete = true;
      client.emit('ready');
    });
  }

  client.initialized = function() {
    return initComplete;
  };

  client.waitUntilReady = function() {
    return new Promise(function(resolve) {
      client.once('ready', resolve);
    });
  };

  client.variation = function(key, user, defaultVal, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      sanitizeUser(user);
      var variationErr;

      if (this.is_offline()) {
        config.logger.info("Variation called in offline mode. Returning default value.");
        return resolve(defaultVal);
      }

      else if (!key) {
        variationErr = new errors.LDClientError('No feature flag key specified. Returning default value.');
        maybeReportError(variationError);
        sendFlagEvent(key, null, user, null, defaultVal, defaultVal);
        return resolve(defaultVal);
      }

      else if (!user) {
        variationErr = new errors.LDClientError('No user specified. Returning default value.');
        maybeReportError(variationErr);
        sendFlagEvent(key, null, user, null, defaultVal, defaultVal);
        return resolve(defaultVal);
      }
      
      else if (user.key === "") {
        config.logger.warn("User key is blank. Flag evaluation will proceed, but the user will not be stored in LaunchDarkly");
      }

      if (!initComplete) {
        config.feature_store.initialized(function(storeInited) {
          if (config.feature_store.initialized()) {
            config.logger.warn("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using last known values from feature store")
            variationInternal(key, user, defaultVal, resolve, reject);
          } else {
            variationErr = new errors.LDClientError("Variation called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?) - using default value");
            maybeReportError(variationErr);
            sendFlagEvent(key, null, user, null, defaultVal, defaultVal);
            return resolve(defaultVal);
          }
        });
      }

      variationInternal(key, user, defaultVal, resolve, reject);
    }.bind(this)), callback);
  }

  function variationInternal(key, user, defaultVal, resolve, reject) {
    config.feature_store.get(dataKind.features, key, function(flag) {
      evaluate.evaluate(flag, user, config.feature_store, function(err, variation, value, events) {
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

  client.all_flags = function(user, callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      sanitizeUser(user);
      var results = {};

      if (this.is_offline() || !user) {
        config.logger.info("all_flags() called in offline mode. Returning empty map.");
        return resolve({});
      }

      config.feature_store.all(dataKind.features, function(flags) {
        async.forEachOf(flags, function(flag, key, iterateeCb) {
          // At the moment, we don't send any events here
          evaluate.evaluate(flag, user, config.feature_store, function(err, result, events) {
            results[key] = result;
            iterateeCb(null);
          })
        }, function(err) {
          return err ? reject(err) : resolve(results);
        });
      });
    }.bind(this)), callback);
  }

  client.secure_mode_hash = function(user) {
    var hmac = crypto.createHmac('sha256', sdkKey);
    hmac.update(user.key);
    return hmac.digest('hex');
  }

  client.close = function() {
    eventProcessor.close();
    if (updateProcessor) {
      updateProcessor.close();
    }
    config.feature_store.close();
    clearInterval(flushTimer);
  }

  client.is_offline = function() {
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

  flushTimer = setInterval(backgroundFlush, config.flush_interval * 1000);

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
      host: config.proxy_host,
      port: config.proxy_port,
      proxyAuth: config.proxy_auth
    }
  };

  if (config.proxy_scheme === 'https') {
    if (!config.base_uri || config.base_uri.startsWith('https')) {
     return tunnel.httpsOverHttps(options);
    } else {
      return tunnel.httpOverHttps(options);
    }
  } else if (!config.base_uri || config.base_uri.startsWith('https')) {
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
