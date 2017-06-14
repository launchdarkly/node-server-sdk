var noop = function(){};

function PollingProcessor(config, requestor) {
  var processor = {},
      store = config.feature_store,
      stopped = false;

  function poll(cb) {
    var start_time, delta;

    cb = cb || noop;

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
        config.logger.error("[LaunchDarkly] Error polling for all feature flags", err);
        cb(err);
        // Recursively call poll after the appropriate delay
        setTimeout(poll, sleepFor);
      } else {
        store.init(flags, function() {
          cb();
          // Recursively call poll after the appropriate delay
          setTimeout(poll, sleepFor);
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