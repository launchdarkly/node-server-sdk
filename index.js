var requestify = require('requestify');
var sha1 = require('node-sha1');
var util = require('util');
var EventSource = require('./eventsource');
var pointer = require('json-pointer');
var tunnel = require('tunnel');
var VERSION = "1.5.0";

var noop = function(){};

global.setImmediate = global.setImmediate || process.nextTick.bind(process);

var new_client = function(api_key, config) {
  var client = {};

  config = config || {};

  client.base_uri = (config.base_uri || 'https://app.launchdarkly.com').replace(/\/+$/, "");
  client.stream_uri = (config.stream_uri || 'https://stream.launchdarkly.com').replace(/\/+$/, "");
  client.events_uri = (config.events_uri || 'https://events.launchdarkly.com').replace(/\/+$/, "");
  client.stream = (typeof config.stream === 'undefined') ? true : config.stream;
  client.timeout = config.timeout || 5;
  client.capacity = config.capacity || 1000;
  client.flush_interval = config.flush_interval || 5;  
  client.api_key = api_key;
  client.queue = [];
  client.offline = false;
  client.proxy_host = config.proxy_host;
  client.proxy_port = config.proxy_port;
  client.proxy_auth = config.proxy_auth;
  client.proxy_scheme = config.proxy_scheme;

  // Initialize global tunnel if proxy options are set
  if (client.proxy_host && client.proxy_port ) {
    client.proxy_agent = create_proxy_agent(config);
  }

  if (!api_key) {
    throw new Error("You must configure the client with an API key");
  }

  requestify.cacheTransporter({
    cache: {},
    get: function(url, fn) {
      fn(null, this.cache[url]);
    },

    set: function(url, response, fn) {
      this.cache[url] = response;
      fn();
    },
    purge: function(url, fn) {
      delete this.cache[url];
      fn();
    }
  });

  client.initializeStream = function() {
    this.initialized = false;

    if (this.es) {
      this.es.close();
    }

    this.es = new EventSource(this.stream_uri + "/features", {agent: client.proxy_agent, headers: {'Authorization': 'api_key ' + this.api_key}});
    this.features = {};

    var _self = this;

    this.es.addEventListener('put', function(e) {
      if (e && e.data) {
        _self.features = JSON.parse(e.data);
        delete _self.disconnected;
        _self.initialized = true;
      }
    });

    this.es.addEventListener('patch', function(e) {
      if (e && e.data) {
        var patch = JSON.parse(e.data);
        if (patch && patch.path && patch.data && patch.data.version) {
          old = pointer.get(_self.features, patch.path);
          if (old === null || old.version < patch.data.version) {
            pointer.set(_self.features, patch.path, patch.data);
          }
        }
      }
    });

    this.es.addEventListener('delete', function(e) {
      if (e && e.data) {
        var data = JSON.parse(e.data);

        if (data && data.path && data.version) {
          old = pointer.get(_self.features, data.path);
          if (old === null || old.version < data.version) {
            pointer.set(_self.features, data.path, {"deleted": true, "version": data.version});         
          }
        }
      }
    });

    this.es.onerror = function(e) {
      if (e && e.status == 401) {
        throw new Error("[LaunchDarkly] Invalid API key");
      }
      if (!_self.disconnected) {
        _self.disconnected = new Date().getTime();      
      }
    }    
  }

  client.get_flag = function(key, user, default_val, fn) {
    client.toggle(key, user, default_val, fn);
  }

  client.toggle = function(key, user, default_val, fn) {
    var cb = fn || noop;

    var request_params = {
      method: "GET",
      headers: {
        'Authorization': 'api_key ' + this.api_key,
        'User-Agent': 'NodeJSClient/' + VERSION
      },
      timeout: this.timeout * 1000,
      agent: this.proxy_agent
    };

    var make_request = (function(cb, err_cb) {
      requestify.request(this.base_uri + '/api/eval/features/' + key, request_params)
      .then(cb, err_cb);
    }).bind(this);

    if (this.offline) {
      cb(null, default_val);
      return;
    }

    else if (!key) {
      send_flag_event(client, key, user, default_val, default_val);
      cb(new Error("[LaunchDarkly] No flag key specified in toggle call"), default_val);
      return;
    }

    else if (!user) {
      send_flag_event(client, key, user, default_val, default_val);
      cb(new Error("[LaunchDarkly] No user specified in toggle call"), default_val);
      return;
    }
    
    if (this.stream && this.initialized) {
      var result = evaluate(this.features[key], user);
      var _self = this;

      if (this.disconnected && should_fallback_update(this.disconnected)) {
        make_request(function(response){
          var feature = response.getBody(), old = _self.features[key];
          if (typeof feature !== 'undefined' && feature.version > old.version) {
            _self.features[key] = feature;
          }
        },
        function(error) {
          console.log("[LaunchDarkly] Failed to update feature in fallback mode. Flag values may be stale.");
        });
      }

      if (result === null) {
          send_flag_event(client, key, user, default_val, default_val);
          cb(null, default_val);
          return;
      } else {
        send_flag_event(client, key, user, result, default_val);
        cb(null, result);
        return;
      }        
    }
    else {
      make_request(function(response) {      
        var result = evaluate(response.getBody(), user);
        if (result === null) {
          send_flag_event(client, key, user, default_val, default_val);
          cb(null, default_val);
          return;
        } else {
          send_flag_event(client, key, user, result, default_val);
          cb(null, result);
          return;
        }
      },
      function(error) {
        cb(error, default_val);
        return;
      });
    }

  }

  client.close = function() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  client.set_offline = function() {
    this.offline = true;
    if (this.es) {
      this.es.close();
      this.es = null;
    } 
  }

  client.set_online = function() {
    this.offline = false;
    if (this.stream) {
      this.initializeStream();
    }
  }

  client.is_offline = function() {
    return this.offline;
  }

  client.track = function(eventName, user, data) {
    var event = {"key": eventName, 
                "user": user,
                "kind": "custom", 
                "creationDate": new Date().getTime()};

    if (data) {
      event.data = data;
    }

    enqueue(client, event);
  };

  client.identify = function(user) {
    var event = {"key": user.key,
                 "kind": "identify",
                 "user": user,
                 "creationDate": new Date().getTime()};
    enqueue(client, event);
  };

  client.flush = function(fn) {
    var cb = fn || noop;
    var worklist;
    if (!this.queue.length) {
      return process.nextTick(cb);
    }

    worklist = this.queue.slice(0);
    this.queue = [];

    requestify.request(this.events_uri + '/bulk', {
      method: "POST",
      headers: {
        'Authorization': 'api_key ' + this.api_key,
        'User-Agent': 'NodeJSClient/' + VERSION,
        'Content-Type': 'application/json'
      },
      body: worklist,
      timeout: this.timeout * 1000,
      agent: this.proxy_agent
    })
    .then(function(response) {
      cb(null, response);
      return;
    }, function(error) {
      cb(error, null);
      return;
    });
  };

  if (client.stream) {
    client.initializeStream();
  }

  setInterval(client.flush.bind(client), client.flush_interval * 1000).unref();

  return client;
};

module.exports = {
  init: new_client
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


// Try to update in fallback mode if we've been disconnected for longer than two minutes
function should_fallback_update(disconnect_time) {
  var now = new Date().getTime();
  return now - disconnect_time > 120000;
}

function enqueue(client, event) {
  if (client.offline) {
    return;
  }

  client.queue.push(event);

  if (client.queue.length >= client.capacity) {
    client.flush();
  } 
}

function send_flag_event(client, key, user, value, default_val) {
  var event = {
    "kind": "feature",
    "key": key,
    "user": user,
    "value": value,
    "default": default_val,
    "creationDate": new Date().getTime()
  };

  enqueue(client, event);
}


function param_for_user(feature, user) {
  var idHash, hashKey, hashVal, result;
  
  if (user.key) {
    idHash = user.key;
  }

  if (user.secondary) {
    idHash += "." + user.secondary;
  }

  hashKey = util.format("%s.%s.%s", feature.key, feature.salt, idHash);
  hashVal = parseInt(sha1(hashKey).substring(0,15), 16);

  result = hashVal / 0xFFFFFFFFFFFFFFF;
  return result;
}

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

function match_target(target, user) {
  var uValue;
  var attr = target.attribute;

  if (builtins.indexOf(attr) >= 0) {
    uValue = user[attr];
    if (uValue) {
      return target.values.indexOf(uValue) >= 0;
    }
    else {
      return false;
    }
  }
  else { // custom attribute
    if (!user.custom) {
      return false;
    }
    if (!user.custom.hasOwnProperty(attr)) {
      return false;
    }
    uValue = user.custom[attr];

    if (uValue instanceof Array) {
      return intersect_safe(uValue, target.values).length > 0;
    }
    return target.values.indexOf(uValue) >= 0;
  }
}

function match_user(variation, user) {
  if (variation.userTarget) {
    return match_target(variation.userTarget, user);
  }
  return false;
}

function match_variation(variation, user) {
  var i;
  for (i = 0; i < variation.targets.length; i++) {
    if (variation.userTarget && variation.targets[i].attribute === 'key') {
      continue;
    }

    if (match_target(variation.targets[i], user)) {
      return true;
    }
  }
  return false;
}

function evaluate(feature, user) {
  var param, i;
  if (typeof feature === 'undefined') {
    return null;
  }

  if (feature.deleted || !feature.on) {
    return null;
  }

  param = param_for_user(feature, user);

  if (!param) {
    return null;
  }

  for (i = 0; i < feature.variations.length; i ++) {
    if (match_user(feature.variations[i], user)) {
      return feature.variations[i].value;
    }
  }  

  for (i = 0; i < feature.variations.length; i ++) {
    if (match_variation(feature.variations[i], user)) {
      return feature.variations[i].value;
    }
  }

  var total = 0.0;   
  for (i = 0; i < feature.variations.length; i++) {
    total += feature.variations[i].weight / 100.0
    if (param < total) {
      return feature.variations[i].value;
    }
  }

  return null;
}

function intersect_safe(a, b)
{
  return a.filter(function(value) {
    return b.indexOf(value) > -1;
  });
}
