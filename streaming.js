var errors = require('./errors');

var EventSource = require('./eventsource');
var dataKind = require('./versioned_data_kind');

function StreamProcessor(sdkKey, config, requestor, eventSourceFactory) {
  var processor = {},
      featureStore = config.featureStore,
      es;

  eventSourceFactory = eventSourceFactory || EventSource;

  function getKeyFromPath(kind, path) {
    return path.startsWith(kind.streamApiPath) ? path.substring(kind.streamApiPath.length) : null;
  }

  processor.start = function(fn) {
    var cb = fn || function(){};
    es = new eventSourceFactory(config.streamUri + "/all", 
      {
        agent: config.proxyAgent, 
        headers: {'Authorization': sdkKey,'User-Agent': config.userAgent},
        tlsParams: config.tlsParams
      });
      
    es.onerror = function(err) {
      cb(new errors.LDStreamingError(err.message, err.code));
    };

    function reportJsonError(type, data) {
      config.logger.error('Stream received invalid data in "' + type + '" message');
      config.logger.debug('Invalid JSON follows: ' + data);
      cb(new errors.LDStreamingError('Malformed JSON data in event stream'));
    }

    es.addEventListener('put', function(e) {
      config.logger.debug('Received put event');
      if (e && e.data) {
        var all;
        try {
          all = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('put', e.data);
          return;
        }
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
        var patch;
        try {
          patch = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('patch', e.data);
          return;
        }
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
        var data, version;
        try {
          data = JSON.parse(e.data);
        } catch (err) {
          reportJsonError('delete', e.data);
          return;
        }
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
      requestor.requestAllData(function (err, resp) {
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
          var key = getKeyFromPath(kind, path);
          if (key != null) {
            requestor.requestObject(kind, key, function(err, resp) {
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