var errors = require('./errors');
var dataKind = require('./versioned_data_kind');

function PollingProcessor(config, requestor) {
  var processor = {},
      featureStore = config.feature_store,
      segmentStore = config.segment_store,
      stopped = false;

  function poll(cb) {
    var startTime, delta;

    cb = cb || function(){};

    if (stopped) {
      return;
    }

    startTime = new Date().getTime();
    config.logger.debug("Polling LaunchDarkly for feature flag updates");
    requestor.request_all_data(function(err, resp) {
      elapsed = new Date().getTime() - startTime;
      sleepFor = Math.max(config.poll_interval * 1000 - elapsed, 0);
      config.logger.debug("Elapsed: %d ms, sleeping for %d ms", elapsed, sleepFor);
      if (err) {
        cb(new errors.LDPollingError('Failed to fetch all feature flags: ' + (err.message || JSON.stringify(err))), err.status);
        if (err.status === 401) {
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