var request = require('request');
var EventSerializer = require('./event_serializer');
var errors = require('./errors');
var wrapPromiseCallback = require('./utils/wrapPromiseCallback');

function EventProcessor(sdk_key, config) {
  var ep = {};

  var eventSerializer = EventSerializer(config);
  var queue = [];
  var shutdown = false;
  var flushTimer;

  ep.send_event = function(event) {
    if (shutdown) {
      return;
    }
    config.logger.debug("Sending flag event", JSON.stringify(event));
    queue.push(event);
    if (queue.length >= config.capacity) {
      ep.flush();
    }
  }

  ep.flush = function(callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      var worklist;
      if (shutdown) {
        var err = new errors.LDInvalidSDKKeyError("Events cannot be posted because SDK key is invalid");
        reject(err);
        return;
      } else if (!queue.length) {
        resolve();
        return;
      }

      worklist = eventSerializer.serialize_events(queue.slice(0));
      queue = [];

      config.logger.debug("Flushing %d events", worklist.length);

      request({
        method: "POST",
        url: config.events_uri + '/bulk',
        headers: {
          'Authorization': sdk_key,
          'User-Agent': config.user_agent
        },
        json: true,
        body: worklist,
        timeout: config.timeout * 1000,
        agent: config.proxy_agent
      }).on('response', function(resp, body) {
        if (resp.statusCode > 204) {
          var err = new errors.LDUnexpectedResponseError("Unexpected status code " + resp.statusCode + "; events may not have been processed",
            resp.statusCode);
          maybeReportError(err);
          reject(err);
          if (resp.statusCode === 401) {
            var err1 = new errors.LDInvalidSDKKeyError("Received 401 error, no further events will be posted since SDK key is invalid");
            maybeReportError(err1);
            shutdown = true;
          }
        } else {
          resolve(resp, body);
        }
      }).on('error', reject);
    }.bind(this)), callback);
  }

  ep.close = function() {
    clearInterval(flushTimer);
  }

  flushTimer = setInterval(ep.flush.bind(ep), config.flush_interval * 1000);

  return ep;
}

module.exports = EventProcessor;
