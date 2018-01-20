var errors = require('./errors');

var EventSource = require('./eventsource');

function StreamProcessor(sdk_key, config, requestor) {
  var processor = {},
      featureStore = config.feature_store,
      segmentStore = config.segment_store,
      es;

  function getFlagKeyFromPath(path) {
    return getKeyFromPath(path, '/flags/');
  }

  function getSegmentKeyFromPath(path) {
    return getKeyFromPath(path, '/segments/');
  }

  function getKeyFromPath(path, prefix) {
    return path.startsWith(prefix) ? path.substring(prefix.length) : null;
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
        featureStore.init(all.flags, function() {
          segmentStore.init(all.flags, function() {
            cb();
          });
        })     
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('patch', function(e) {
      config.logger.debug('Received patch event');
      if (e && e.data) {
        var patch = JSON.parse(e.data),
            key = getFlagKeyFromPath(patch.path);
        if (key != null) {
          featureStore.upsert(key, patch.data);
        } else {
          key = getSegmentKeyFromPath(patch.path);
          if (key != null) {
            segmentStore.upsert(key, patch.data);
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
            key = getFlagKeyFromPath(data.path);
        if (key != null) {
          featureStore.delete(key, version);
        } else {
          key = getSegmentKeyFromPath(patch.path);
          if (key != null) {
            segmentStore.delete(key, version);
          }
        }
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('indirect/put', function(e) {
      config.logger.debug('Received indirect put event')
      requestor.request_all_flags(function (err, flags) {
        if (err) {
          cb(err);
        } else {
          featureStore.init(JSON.parse(flags), function() {
            requestor.request_all_segments(function(err, segments) {
              if (err) {
                cb(err);
              } else {
                segmentStore.init(JSON.parse(segments), function() {
                  cb();
                })
              }
            });
          })          
        }
      })
    });

    es.addEventListener('indirect/patch', function(e) {
      config.logger.debug('Received indirect patch event')
      if (e && e.data) {
        var path = e.data,
            key = getFlagKeyFromPath(path);
        if (key != null) {
          requestor.request_flag(key, function(err, flag) {
            if (err) {
              cb(new errors.LDStreamingError('Unexpected error requesting feature flag'));
            } else {
              featureStore.upsert(key, JSON.parse(flag));
            }
          });
        } else {
          key = getSegmentKeyFromPath(path);
          if (key != null) {
            requestor.request_segment(key, function(err, segment) {
            if (err) {
              cb(new errors.LDStreamingError('Unexpected error requesting segment'));
            } else {
              segmentStore.upsert(key, JSON.parse(segment));
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