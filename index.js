var requestify = require('requestify');
var InMemoryFeatureStore = require('./feature_store');
var RedisFeatureStore = require('./redis_feature_store');
var Requestor = require('./requestor');
var EventEmitter = require('events').EventEmitter;
var PollingProcessor = require('./polling');
var StreamingProcessor = require('./streaming');
var evaluate = require('./evaluate_flag');
var tunnel = require('tunnel');
var winston = require('winston');
var async = require("async");
var VERSION = "2.0.0";

var noop = function(){};

global.setImmediate = global.setImmediate || process.nextTick.bind(process);

var new_client = function(api_key, config) {
  var client = new EventEmitter(),
      initialized = false;

  config = config || {};
  config.version = VERSION;
  
  config.base_uri = (config.base_uri || 'https://app.launchdarkly.com').replace(/\/+$/, "");
  config.stream_uri = (config.stream_uri || 'https://stream.launchdarkly.com').replace(/\/+$/, "");
  config.events_uri = (config.events_uri || 'https://events.launchdarkly.com').replace(/\/+$/, "");
  config.stream = (typeof config.stream === 'undefined') ? true : config.stream;
  config.timeout = config.timeout || 5;
  config.capacity = config.capacity || 1000;
  config.flush_interval = config.flush_interval || 5;  
  config.poll_interval = config.poll_interval > 1 ? config.poll_interval : 1;
  // Initialize global tunnel if proxy options are set
  if (config.proxy_host && config.proxy_port ) {
    config.proxy_agent = create_proxy_agent(config);
  }
  config.logger = (config.logger || 
    new winston.Logger({
      level: 'error',
      transports: [
        new (winston.transports.Console)(),
      ]
    })
  );
  config.feature_store = config.feature_store || InMemoryFeatureStore();

  api_key = api_key;
  queue = [];

  if (!api_key) {
    throw new Error("You must configure the client with an API key");
  }

  requestor = Requestor(api_key, config);

  if (!config.use_ldd && !config.offline) {
    if (config.stream) {
      config.logger.info("[LaunchDarkly] Initializing stream processor to receive feature flag updates");
      update_processor = StreamingProcessor(api_key, config, requestor);
    } else {
      config.logger.info("[LaunchDarkly] Initializing polling processor to receive feature flag updates");
      update_processor = PollingProcessor(config, requestor);
    }
    update_processor.start(function(err) {
      if (err) {
        client.emit('error', err);
      }
      else if (!initialized) {
        initialized = true;
        client.emit('ready');
      }
    });
  } else {
    client.emit('ready');
  }

  client.toggle = function(key, user, default_val, fn) {
    sanitize_user(user);
    var cb = fn || noop;

    if (this.is_offline()) {
      config.logger.info("[LaunchDarkly] toggle called in offline mode. Returning default value.");
      cb(null, default_val);
      return;
    }

    else if (!key) {
      config.logger.error("[LaunchDarkly] No feature flag key specified. Returning default value.");
      send_flag_event(key, user, default_val, default_val);
      cb(new Error("[LaunchDarkly] No flag key specified in toggle call"), default_val);
      return;
    }

    else if (!user) {
      config.logger.error("[LaunchDarkly] No user specified. Returning default value.");
      send_flag_event(key, user, default_val, default_val);
      cb(new Error("[LaunchDarkly] No user specified in toggle call"), default_val);
      return;
    }

    if (!initialized) {
      config.logger.error("LaunchDarkly client has not finished initializing. Returning default value.");
      send_flag_event(key, user, default_val, default_val);
      cb(new Error("[LaunchDarkly] toggle called before LaunchDarkly client initialization completed (did you wait for the 'ready' event?)"), default_val);
      return; 
    }

    config.feature_store.get(key, function(flag) {
      evaluate(flag, user, config.feature_store, function(result) {
        if (result === null) {
          config.logger.debug("[LaunchDarkly] Result value is null in toggle");
          send_flag_event(key, user, default_val, default_val);
          cb(null, default_val);
          return;
        } else {
          send_flag_event(key, user, result, default_val);
          cb(null, result);
          return;
        }               
      });
    });
  }

  client.all_flags = function(user, fn) {
    var cb = fn || noop;
    var results = {};

    if (this.is_offline() || !user) {
      config.logger.info("[LaunchDarkly] all_flags called in offline mode. Returning empty map.");

      cb(null, null);
      return;
    }

    config.feature_store.all(function(flags) {
      async.forEachOf(flags, function(value, key, iteratee_cb) {
        evaluate(flag, user, config.feature_store, function(result) {
          results[key] = result;
          iteratee_cb(null);
        })
      }, function(err) {
        cb(err, results);
      });
    });
  }

  client.close = function() {
    if (update_processor) {
      update_processor.close();
    }
    config.feature_store.close();
  }

  client.is_offline = function() {
    return config.offline;
  }

  client.track = function(eventName, user, data) {
    sanitize_user(user);
    var event = {"key": eventName, 
                "user": user,
                "kind": "custom", 
                "creationDate": new Date().getTime()};

    if (data) {
      event.data = data;
    }

    enqueue(event);
  };

  client.identify = function(user) {
    sanitize_user(user);
    var event = {"key": user.key,
                 "kind": "identify",
                 "user": user,
                 "creationDate": new Date().getTime()};
    enqueue(event);
  };

  client.flush = function(fn) {
    var cb = fn || noop;
    var worklist;
    if (!queue.length) {
      return process.nextTick(cb);
    }

    worklist = queue.slice(0);
    queue = [];

    config.logger.debug("Flushing %d events", worklist.length);

    requestify.request(config.events_uri + '/bulk', {
      method: "POST",
      headers: {
        'Authorization': 'api_key ' + api_key,
        'User-Agent': 'NodeJSClient/' + VERSION,
        'Content-Type': 'application/json'
      },
      body: worklist,
      timeout: config.timeout * 1000,
      agent: config.proxy_agent
    })
    .then(function(response) {
      cb(null, response);
      return;
    }, function(error) {
      cb(error, null);
      return;
    });
  };

  function enqueue(event) {
    if (config.offline) {
      return;
    }

    queue.push(event);

    if (queue.length >= config.capacity) {
      client.flush();
    } 
  }

  function send_flag_event(key, user, value, default_val) {
    var event = {
      "kind": "feature",
      "key": key,
      "user": user,
      "value": value,
      "default": default_val,
      "creationDate": new Date().getTime()
    };

    enqueue(event);
  }

  // TODO keep the reference and stop flushing after close
  setInterval(client.flush.bind(client), client.flush_interval * 1000).unref();

  return client;
};

module.exports = {
  init: new_client,
  RedisFeatureStore: RedisFeatureStore
};


function create_proxy_agent(config) {
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


function sanitize_user(u) {
  if (u['key']) {
    u['key'] = u['key'].toString();
  }
}


