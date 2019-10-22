const errors = require('./errors');
const messages = require('./messages');
const dataKind = require('./versioned_data_kind');

function PollingProcessor(config, requestor) {
  const processor = {},
    featureStore = config.featureStore;
  let stopped = false;

  function poll(cb) {
    let startTime;

    cb = cb || function(){};

    if (stopped) {
      return;
    }

    startTime = new Date().getTime();
    config.logger.debug('Polling LaunchDarkly for feature flag updates');
    requestor.requestAllData((err, resp) => {
      const elapsed = new Date().getTime() - startTime;
      const sleepFor = Math.max(config.pollInterval * 1000 - elapsed, 0);
      config.logger.debug('Elapsed: %d ms, sleeping for %d ms', elapsed, sleepFor);
      if (err) {
        if (err.status && !errors.isHttpErrorRecoverable(err.status)) {
          const message = messages.httpErrorMessage(err.status, 'polling request');
          config.logger.error(message);
          cb(new errors.LDPollingError(message));
        } else {
          config.logger.warn(messages.httpErrorMessage(err.status || err.message, 'polling request', 'will retry'));
          // Recursively call poll after the appropriate delay
          setTimeout(() => { poll(cb); }, sleepFor);
        }
      } else {
        const allData = JSON.parse(resp);
        const initData = {};
        initData[dataKind.features.namespace] = allData.flags;
        initData[dataKind.segments.namespace] = allData.segments;
        featureStore.init(initData, () => {
          cb();
          // Recursively call poll after the appropriate delay
          setTimeout(() => { poll(cb); }, sleepFor);
        });
      }
    });
  }

  processor.start = cb => {
    poll(cb);
  };

  processor.stop = () => {
    stopped = true;
  };

  processor.close = () => {
    processor.stop();
  };

  return processor;
}

module.exports = PollingProcessor;