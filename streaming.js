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
        var patch = JSON.parse(e.data);
        for (var k in dataKind) {
          var kind = dataKind[k];
          var key = getKeyFromPath(kind, patch.path);
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

    es.addEventListener('delete', function(e) {
      config.logger.debug('Received delete event');
      if (e && e.data) {        
        var data = JSON.parse(e.data),
            version = data.version;
        for (var k in dataKind) {
          var kind = dataKind[k];
          var key = getKeyFromPath(kind, data.path);
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
        var path = e.data;
        for (var k in dataKind) {
          var kind = dataKind[k];
          var key = getKeyFromPath(kind, patch.path);
          if (key != null) {
            requestor.request_object(kind, key, function(err, resp) {
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