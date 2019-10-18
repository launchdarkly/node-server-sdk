const errors = require('./errors');
const EventSource = require('./eventsource');
const dataKind = require('./versioned_data_kind');

function StreamProcessor(sdkKey, config, requestor, eventSourceFactory) {
  const processor = {},
    featureStore = config.featureStore;
  let es;

  eventSourceFactory = eventSourceFactory || EventSource;

  function getKeyFromPath(kind, path) {
    return path.startsWith(kind.streamApiPath) ? path.substring(kind.streamApiPath.length) : null;
  }

  processor.start = fn => {
    const cb = fn || function(){};
    es = new eventSourceFactory(config.streamUri + '/all', 
      {
        agent: config.proxyAgent, 
        headers: {'Authorization': sdkKey,'User-Agent': config.userAgent},
        tlsParams: config.tlsParams
      });
      
    es.onerror = err => {
      cb(new errors.LDStreamingError(err.message, err.code));
    };

    function reportJsonError(type, data) {
      config.logger.error('Stream received invalid data in "' + type + '" message');
      config.logger.debug('Invalid JSON follows: ' + data);
      cb(new errors.LDStreamingError('Malformed JSON data in event stream'));
    }

    es.addEventListener('put', e => {
      config.logger.debug('Received put event');
      if (e && e.data) {
        let all;
        try {
          all = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('put', e.data);
          return;
        }
        const initData = {};
        initData[dataKind.features.namespace] = all.data.flags;
        initData[dataKind.segments.namespace] = all.data.segments;
        featureStore.init(initData, () => {
          cb();
        });
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('patch', e => {
      config.logger.debug('Received patch event');
      if (e && e.data) {
        let patch;
        try {
          patch = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('patch', e.data);
          return;
        }
        for (let k in dataKind) {
          const kind = dataKind[k];
          const key = getKeyFromPath(kind, patch.path);
          if (key != null) {
            config.logger.debug('Updating ' + key + ' in ' + kind.namespace);
            featureStore.upsert(kind, patch.data);
            break;
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('delete', e => {
      config.logger.debug('Received delete event');
      if (e && e.data) {        
        let data, version;
        try {
          data = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('delete', e.data);
          return;
        }
        version = data.version;
        for (let k in dataKind) {
          const kind = dataKind[k];
          const key = getKeyFromPath(kind, data.path);
          if (key != null) {
            config.logger.debug('Deleting ' + key + ' in ' + kind.namespace);
            featureStore.delete(kind, key, version);
            break;
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('indirect/put', () => {
      config.logger.debug('Received indirect put event');
      requestor.requestAllData((err, resp) => {
        if (err) {
          cb(err);
        } else {
          const all = JSON.parse(resp);
          const initData = {};
          initData[dataKind.features.namespace] = all.flags;
          initData[dataKind.segments.namespace] = all.segments;
          featureStore.init(initData, () => {
            cb();
          });
        }
      });
    });

    es.addEventListener('indirect/patch', e => {
      config.logger.debug('Received indirect patch event');
      if (e && e.data) {
        const path = e.data;
        for (let k in dataKind) {
          const kind = dataKind[k];
          const key = getKeyFromPath(kind, path);
          if (key != null) {
            requestor.requestObject(kind, key, (err, resp) => {
              if (err) {
                cb(new errors.LDStreamingError('Unexpected error requesting ' + key + ' in ' + kind.namespace));
              } else {
                config.logger.debug('Updating ' + key + ' in ' + kind.namespace);
                featureStore.upsert(kind, JSON.parse(resp));
              }
            });
            break;
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });
  };

  processor.stop = () => {
    if (es) {
      es.close();
    }
  };

  processor.close = () => {
    processor.stop();
  };

  return processor;
}

module.exports = StreamProcessor;