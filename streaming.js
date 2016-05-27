 
// TODO turn this into a StreamProcessor class
 client.initializeStream = function(fn) {
    var cb = fn || noop;
    this.initialized = false;

    if (this.es) {
      this.es.close();
    }

    this.es = new EventSource(config.stream_uri + "/features", {agent: config.proxy_agent, headers: {'Authorization': 'api_key ' + this.api_key}});
    this.features = {};

    var _self = this;

    this.es.addEventListener('put', function(e) {
      if (e && e.data) {
        _self.features = JSON.parse(e.data);
        delete _self.disconnected;
        _self.initialized = true;
      }
      cb();
    });

    this.es.addEventListener('patch', function(e) {
      if (e && e.data) {
        try {
          var patch = JSON.parse(e.data);
          if (patch && patch.path && patch.data && patch.data.version) {
            old = pointer.get(_self.features, patch.path);
            if (old === null || old.version < patch.data.version) {
              pointer.set(_self.features, patch.path, patch.data);
            }
          }
        } catch(e) {}  // do not update a flag that does not exist
      }
    });

    this.es.addEventListener('delete', function(e) {
      if (e && e.data) {
        try {
          var data = JSON.parse(e.data);

          if (data && data.path && data.version) {
            old = pointer.get(_self.features, data.path);
            if (old === null || old.version < data.version) {
              pointer.set(_self.features, data.path, {
                "deleted": true,
                "version": data.version
              });
            }
          }
        } catch(e) {}  // do not delete a flag that does not exist
      }
    });

    this.es.onerror = function(e) {
      if (e && e.status == 401) {
        throw new Error("[LaunchDarkly] Invalid API key");
      }
      if (!_self.disconnected) {
        _self.disconnected = new Date().getTime();      
      }
    }    
  }