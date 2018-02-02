var ETagRequest = require('request-etag');
/**
 * Creates a new Requestor object, which handles remote requests to fetch feature flags or segments for LaunchDarkly.
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

  var cacheConfig = {
    max: 100,
    // LRUCache passes each cached item through the "length" function to determine how many units it should
    // count for toward "max".  We want our cache limit to be based on the number of responses, not their
    // size; that is in fact the default behavior of LRUCache, but request-etag overrides it unless we do this:
    length: function() { return 1; }
  };
  var requestWithETagCaching = new ETagRequest(cacheConfig);

  function make_request(resource) {
    var request_params = {
      method: "GET",
      url: config.base_uri + resource,
      headers: {
        'Authorization': sdk_key,
        'User-Agent': config.user_agent
      },
      timeout: config.timeout * 1000,
      agent: config.proxy_agent
    }

    return function(cb, err_cb) {
      requestWithETagCaching(request_params, function(err, resp, body) {
        // Note that when request-etag gives us a cached response, the body will only be in the "body"
        // callback parameter -- not in resp.getBody().  For a fresh response, it'll be in both.
        if (err) {
          err_cb(err);
        } else {
          cb(resp, body);
        }
      });
    };
  }

  function process_response(cb) {
    return function(response, body) {
      if (response.statusCode !== 200 && response.statusCode != 304) {
        var err = new Error('Unexpected status code: ' + response.statusCode);
        err.status = response.statusCode;
        cb(err, null);
      } else {
        cb(null, body);
      }
    };
  }

  function process_error_response(cb) {
    return function(err) {
      cb(err, null);
    }
  }

  requestor.request_object = function(kind, key, cb) {
    var req = make_request(kind.requestPath + key);
    req(
      process_response(cb),
      process_error_response(cb)
    );
  }

  requestor.request_all_data = function(cb) {
    var req = make_request('/sdk/latest-all');
    req(
      process_response(cb),
      process_error_response(cb)
    );
  }

  return requestor;
}

module.exports = Requestor;