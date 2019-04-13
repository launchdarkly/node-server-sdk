var errors = require('./errors');
var messages = require('./messages');
var dataKind = require('./versioned_data_kind');

function PollingProcessor(config, requestor) {
  var processor = {},
      featureStore = config.featureStore,
      stopped = false;

  function poll(cb) {
    var startTime, delta;

    cb = cb || function(){};

    if (stopped) {
      return;
    }

    startTime = new Date().getTime();
    config.logger.debug("Polling LaunchDarkly for feature flag updates");
    requestor.requestAllData(function(err, resp) {
      const elapsed = new Date().getTime() - startTime;
      const sleepFor = Math.max(config.pollInterval * 1000 - elapsed, 0);
      config.logger.debug("Elapsed: %d ms, sleeping for %d ms", elapsed, sleepFor);
      if (err) {
        const message = err.status || err.message;
        cb(new errors.LDPollingError(messages.httpErrorMessage(message, 'polling request', 'will retry')));
        if (!errors.isHttpErrorRecoverable(err.status)) {
          config.logger.error('Received 401 error, no further polling requests will be made since SDK key is invalid');
        } else {
          // Recursively call poll after the appropriate delay
          setTimeout(function() { poll(cb); }, sleepFor);
        }
      } else {
        var allData = JSON.parse(resp);
        var initData = {};
        initData[dataKind.features.namespace] = allData.flags;
        initData[dataKind.segments.namespace] = allData.segments;
        featureStore.init(initData, function() {
          cb();
          // Recursively call poll after the appropriate delay
          setTimeout(function() { poll(cb); }, sleepFor);
        });
      }
    });
  };

  processor.start = function(cb) {
    poll(cb);
  }

  processor.stop = function() {
    stopped = true;
  }

  processor.close = function() {
    this.stop();
  }

  return processor;
}

module.exports = PollingProcessor;