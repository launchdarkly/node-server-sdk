var requestify = require('requestify');

var defaultConfig = {
  base_uri : 'https://app.launchdarkly.com'
};

var VERSION = "0.0.1";

var new_client = function(api_key, config) {
  var client = {};

  if (!config) {
    client.config = defaultConfig;
  } 
  else {
    client.config = config;
  }

  if (!api_key) {
    throw new Error("You must configure the client with an API key");
  }
  
  client.api_key = api_key;

  requestify.cacheTransporter({
    cache: {},
    get: function(url, fn) {
      fn(null, cache[url]);
    },

    set: function(url, response, fn) {
      cache[url] = response;
      fn();
    },
    purge: function(url, fn) {
      delete cache[url];
      fn();
    }
  });

  client.get_flag = function(key, user, default_val) {
    if (!key || !user) {
      return default_val;
    }

    requestify.request(client.config.base_uri + '/api/eval/features/' + key, {
      method: "GET",
      headers: {
        'Authorization': 'api_key ' + client.api_key,
        'User-Agent': 'NodeJSClient/' + VERSION
      }
    })
    .then(function(response) {      
      console.log(response.getBody());
    });
  }


  return client;
};

module.exports = {
  init: new_client
}