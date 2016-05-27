var EventSource = require('./eventsource');

function StreamProcessor(api_key, config, requestor) {
  var processor = {},
      store = config.feature_store,
      es;

  processor.start = function(cb) {
    // TODO change the URL for v2
    es = new EventSource(config.stream_uri + "/features", 
      {
        agent: config.proxy_agent, 
        headers: {'Authorization': 'api_key ' + api_key}
      });


    es.addEventListener('put', function(e) {
      if (e && e.data) {
        var flags = JSON.parse(e.data);
        store.init(flags, function() {
          cb();
        })     
      } else {
        cb(new Error("[LaunchDarkly] Unexpected payload from event stream"));
      }
    });

    es.addEventListener('patch', function(e) {
      if (e && e.data) {
        var flag = JSON.parse(e.data);
        store.upsert(flag.key, flag);
      } else {
        cb(new Error("[LaunchDarkly] Unexpected payload from event stream"));
      }
    });

    es.addEventListener('delete', function(e) {
      if (e && e.data) {
        var data = JSON.parse(e.data),
            key = data.path.charAt(0) === '/' ? data.path.substring(1) : data.path, // trim leading '/'
            version = data.version;

        store.delete(key, version);
      } else {
        cb(new Error("[LaunchDarkly] Unexpected payload from event stream"));
      }
    });

    es.addEventListener('indirect/put', function(e) {
      requestor.request_all_flags(true, function (err, flags) {
        if (err) {
          cb(err);
        } else {
          store.init(flags, function() {
            cb();
          })          
        }
      })
    });

    es.addEventListener('indirect/patch', function(e) {
      if (e && e.data) {
        var key = data.charAt(0) === '/' ? data.substring(1) : data
        requestor.request_flag(key, true, function(err, flag) {
          if (err) {
            cb(err);
          } else {
            store.upsert(key, flag);
          }
        })
      } else {
        cb(new Error("[LaunchDarkly] Unexpected payload from event stream"));
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