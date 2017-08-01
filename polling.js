var errors = require('./errors');

function PollingProcessor(config, requestor) {
  var processor = {},
      store = config.feature_store,
      stopped = false;

  function poll(cb) {
    var start_time, delta;

    cb = cb || function(){};

    if (stopped) {
      return;
    }

    start_time = new Date().getTime();
    config.logger.debug("Polling LaunchDarkly for feature flag updates");
    requestor.request_all_flags(function(err, flags) {
      elapsed = new Date().getTime() - start_time;
      sleepFor = Math.max(config.poll_interval * 1000 - elapsed, 0);
      config.logger.debug("Elapsed: %d ms, sleeping for %d ms", elapsed, sleepFor);
      if (err) {
        cb(new errors.LDPollingError('Failed to fetch all feature flags: ' + err.message));
        // Recursively call poll after the appropriate delay
        setTimeout(function() { poll(cb); }, sleepFor);
      } else {
        store.init(flags, function() {
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