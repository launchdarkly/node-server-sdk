var errors = require('./errors');

var EventSource = require('./eventsource');

function StreamProcessor(sdk_key, config, requestor) {
  var processor = {},
      store = config.feature_store,
      es;

  processor.start = function(fn) {
    var cb = fn || function(){};
    es = new EventSource(config.stream_uri + "/flags", 
      {
        agent: config.proxy_agent, 
        headers: {'Authorization': sdk_key,'User-Agent': config.user_agent}
      });
      
    es.onerror = function(err) {
      cb(new errors.LDStreamingError(err.message));
    };

    es.addEventListener('put', function(e) {
      config.logger.debug('Received put event');
      if (e && e.data) {
        var flags = JSON.parse(e.data);
        store.init(flags, function() {
          cb();
        })     
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('patch', function(e) {
      config.logger.debug('Received patch event');
      if (e && e.data) {
        var patch = JSON.parse(e.data);
        store.upsert(patch.data.key, patch.data);
      } else {
        cb(new errors.LDStreamingError('Unexpected payload from event stream'));
      }
    });

    es.addEventListener('delete', function(e) {
      config.logger.debug('Received delete event');
      if (e && e.data) {        
        var data = JSON.parse(e.data),
            key = data.path.charAt(0) === '/' ? data.path.substring(1) : data.path, // trim leading '/'
            version = data.version;

        store.delete(key, version);
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
          console.log('!!! indirect/put flag response type', typeof flags);
          store.init(flags, function() {
            cb();
          })          
        }
      })
    });

    es.addEventListener('indirect/patch', function(e) {
      config.logger.debug('Received indirect patch event')
      if (e && e.data) {
        var key = e.data.charAt(0) === '/' ? e.data.substring(1) : e.data;
        requestor.request_flag(key, function(err, flag) {
          if (err) {
            cb(new errors.LDStreamingError('Unexpected error requesting feature flag'));
          } else {
            console.log('!!! indirect/patch flag response type', typeof flag);
            store.upsert(key, flag);
          }
        })
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