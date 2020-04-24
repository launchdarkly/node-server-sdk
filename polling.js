const errors = require('./errors');
const messages = require('./messages');
const dataKind = require('./versioned_data_kind');

function PollingProcessor(config, requestor) {
  const processor = {},
    featureStore = config.featureStore;
  let stopped = false;

  function poll(maybeCallback) {
    const cb = maybeCallback || function() {};

    if (stopped) {
      return;
    }

    const startTime = new Date().getTime();
    config.logger.debug('Polling LaunchDarkly for feature flag updates');
    requestor.requestAllData((err, respBody) => {
      const elapsed = new Date().getTime() - startTime;
      const sleepFor = Math.max(config.pollInterval * 1000 - elapsed, 0);
      config.logger.debug('Elapsed: %d ms, sleeping for %d ms', elapsed, sleepFor);
      if (err) {
        if (err.status && !errors.isHttpErrorRecoverable(err.status)) {
          const message = messages.httpErrorMessage(err, 'polling request');
          config.logger.error(message);
          cb(new errors.LDPollingError(message));
        } else {
          config.logger.warn(messages.httpErrorMessage(err, 'polling request', 'will retry'));
          // Recursively call poll after the appropriate delay
          setTimeout(() => {
            poll(cb);
          }, sleepFor);
        }
      } else {
        if (respBody) {
          const allData = JSON.parse(respBody);
          const initData = {};
          initData[dataKind.features.namespace] = allData.flags;
          initData[dataKind.segments.namespace] = allData.segments;
          featureStore.init(initData, () => {
            cb();
            // Recursively call poll after the appropriate delay
            setTimeout(() => {
              poll(cb);
            }, sleepFor);
          });
        } else {
          // There wasn't an error but there wasn't any new data either, so just keep polling
          setTimeout(() => {
            poll(cb);
          }, sleepFor);
        }
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
