var requestify = require('requestify');
/**
 * Creates a new Requestor object, which handles remote requests to fetch feature flags for LaunchDarkly.
 * This is never called synchronously when requesting a feature flag for a user (e.g. via the toggle) call.
 * 
 * It will be called once per second in polling mode (i.e. when streaming is disabled), or for extremely large
 * feature flag representations if streaming is enabled (the stream may contain a pointer to a large representation, 
 * which will be polled by the requestor)
 *
 * @param {String} the SDK key
 * @param {Object} the LaunchDarkly client configuration object
 **/
function Requestor(sdk_key, config) {
  var requestor = {};

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

  function make_request(resource) {
    var request_params = {
      method: "GET",
      headers: {
        'Authorization': sdk_key,
        'User-Agent': config.user_agent
      },
      timeout: config.timeout * 1000,
      agent: config.proxy_agent
    }

    return function(cb, err_cb) {
      requestify.request(config.base_uri + resource, request_params).then(cb, err_cb);
    };
  }

  requestor.request_flag = function(key, cb) {
    var req = make_request('/sdk/latest-flags/' + key);
    req(
      function(response) {
        if (response.code !== 200) {
          cb(new Error('[LaunchDarkly] Unexpected status code: ' + response.code), null);
        } else {
          cb(null, response.getBody());
        }
      },
      function(err) {
        cb(err, null);
      }
    );
  } 

  requestor.request_all_flags = function(cb) {
    var req = make_request('/sdk/latest-flags');
    req(
      function(response) {
        if (response.code !== 200) {
          cb(new Error('[LaunchDarkly] Unexpected status code: ' + response.code), null);
        } else {
          cb(null, response.getBody());
        }
      },
      function(err) {
        cb(err, null);
      }
    );
  }

  return requestor;
}

module.exports = Requestor;