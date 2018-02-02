var errors = require('./errors');

var EventSource = require('./eventsource');
var dataKind = require('./versioned_data_kind');

function StreamProcessor(sdk_key, config, requestor) {
  var processor = {},
      featureStore = config.feature_store,
      es;

  function getKeyFromPath(kind, path) {
    return path.startsWith(kind.streamApiPath) ? path.substring(kind.streamApiPath.length) : null;
  }

  processor.start = function(fn) {
    var cb = fn || function(){};
    es = new EventSource(config.stream_uri + "/all", 
      {
        agent: config.proxy_agent, 
        headers: {'Authorization': sdk_key,'User-Agent': config.user_agent}
      });
      
    es.onerror = function(err) {
      cb(new errors.LDStreamingError(err.message, err.code));
    };

    es.addEventListener('put', function(e) {
      config.logger.debug('Received put event');
      if (e && e.data) {
        var all = JSON.parse(e.data);
        var initData = {};
        initData[dataKind.features.namespace] = all.data.flags;
        initData[dataKind.segments.namespace] = all.data.segments;
        featureStore.init(initData, function() {
          cb();
        });
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('patch', function(e) {
      config.logger.debug('Received patch event');
      if (e && e.data) {
        var patch = JSON.parse(e.data),
            key = getKeyFromPath(dataKind.features, patch.path);
        if (key != null) {
          featureStore.upsert(dataKind.features, patch.data);
        } else {
          key = getKeyFromPath(dataKind.segments, patch.path);
          if (key != null) {
            featureStore.upsert(dataKind.segments, patch.data);
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('delete', function(e) {
      config.logger.debug('Received delete event');
      if (e && e.data) {        
        var data = JSON.parse(e.data),
            version = data.version,
            key = getKeyFromPath(dataKind.features, data.path);
        if (key != null) {
          featureStore.delete(dataKind.features, key, version);
        } else {
          key = getKeyFromPath(dataKind.segments, patch.path);
          if (key != null) {
            featureStore.delete(dataKind.segments, key, version);
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('indirect/put', function(e) {
      config.logger.debug('Received indirect put event')
      requestor.request_all_flags(function (err, resp) {
        if (err) {
          cb(err);
        } else {
          var all = JSON.parse(resp);
          var initData = {};
          initData[dataKind.features.namespace] = all.flags;
          initData[dataKind.segments.namespace] = all.segments;
          featureStore.init(initData, function() {
            cb();
          });
        }
      })
    });

    es.addEventListener('indirect/patch', function(e) {
      config.logger.debug('Received indirect patch event')
      if (e && e.data) {
        var path = e.data,
            key = getKeyFromPath(dataKind.features, path);
        if (key != null) {
          requestor.request_flag(key, function(err, flag) {
            if (err) {
              cb(new errors.LDStreamingError('Unexpected error requesting feature flag'));
            } else {
              featureStore.upsert(dataKind.features, JSON.parse(flag));
            }
          });
        } else {
          key = getKeyFromPath(dataKind.segments, path);
          if (key != null) {
            requestor.request_segment(key, function(err, segment) {
            if (err) {
              cb(new errors.LDStreamingError('Unexpected error requesting segment'));
            } else {
              featureStore.upsert(dataKind.segments, JSON.parse(segment));
            }
          });
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });
  }

  processor.stop = function() {
    if (es) {
      es.close();
    }
  }

  processor.close = function() {
    this.stop();
  }


  return processor;
}

module.exports = StreamProcessor;