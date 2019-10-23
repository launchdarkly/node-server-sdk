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
function Requestor(sdkKey, config) {
  var requestor = {};

  var cacheConfig = {
    max: 100,
    // LRUCache passes each cached item through the "length" function to determine how many units it should
    // count for toward "max".  We want our cache limit to be based on the number of responses, not their
    // size; that is in fact the default behavior of LRUCache, but request-etag overrides it unless we do this:
    length: function() { return 1; }
  };
  var requestWithETagCaching = new ETagRequest(cacheConfig);

  function makeRequest(resource) {
    var requestParams = Object.assign({}, config.tlsParams, {
      method: "GET",
      url: config.baseUri + resource,
      headers: {
        'Authorization': sdkKey,
        'User-Agent': config.userAgent
      },
      timeout: config.timeout * 1000,
      agent: config.proxyAgent
    });

    return function(cb, errCb) {
      requestWithETagCaching(requestParams, function(err, resp, body) {
        // Note that when request-etag gives us a cached response, the body will only be in the "body"
        // callback parameter -- not in resp.getBody().  For a fresh response, it'll be in both.
        if (err) {
          errCb(err);
        } else {
          cb(resp, body);
        }
      });
    };
  }

  function processResponse(cb) {
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

  function processErrorResponse(cb) {
    return function(err) {
      cb(err, null);
    }
  }

  requestor.requestObject = function(kind, key, cb) {
    var req = makeRequest(kind.requestPath + key);
    req(
      processResponse(cb),
      processErrorResponse(cb)
    );
  }

  requestor.requestAllData = function(cb) {
    var req = makeRequest('/sdk/latest-all');
    req(
      processResponse(cb),
      processErrorResponse(cb)
    );
  }

  return requestor;
}

module.exports = Requestor;