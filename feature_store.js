// An in-memory feature store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
var noop = function(){};
function InMemoryFeatureStore() {
  var store = {flags:{}};

  store.get = function(key, cb) {
    cb = cb || noop;

    if (this.flags.hasOwnProperty(key)) {
      var flag = this.flags[key];

      if (!flag || flag.deleted) {
        cb(null);
      } else {
        cb(clone(flag));
      }
    } else {
      cb(null);
    }
  }

  store.all = function(cb) {
    cb = cb || noop;
    var results = {};

    for (var key in this.flags) {
      if (this.flags.hasOwnProperty(key)) {
        var flag = this.flags[key];
        if (flag && !flag.deleted) {
          results[key] = clone(flag);          
        }
      }
    }

    cb(results);
  }

  store.init = function(flags, cb) {
    cb = cb || noop;
    this.flags = flags;
    this.init_called = true;
    cb();
  }

  store.delete = function(key, version, cb) {
    cb = cb || noop;
    var deletedItem = { version: version, deleted: true };
    if (this.flags.hasOwnProperty(key)) {
      var old = this.flags[key];
      if (old && old.version < version) {
        this.flags[key] = deletedItem;
      } 
    } else {
      this.flags[key] = deletedItem;
    }

    cb();
  }

  store.upsert = function(key, flag, cb) {
    cb = cb || noop;    
    var old = this.flags[key];

    if (this.flags.hasOwnProperty(key)) {
      var old = this.flags[key];
      if (old && old.version < flag.version) {
        this.flags[key] = flag;
      }
    } else {
      this.flags[key] = flag;
    }

    cb();
  }

  store.initialized = function(cb) {
    cb(this.init_called === true);
  }

  store.close = function() {
    // Close on the in-memory store is a no-op
  }

  return store;
}

// Deep clone an object. Does not preserve any
// functions on the object
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = InMemoryFeatureStore;