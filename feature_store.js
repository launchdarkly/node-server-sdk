// An in-memory feature store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
var noop = function(){};
function InMemoryFeatureStore() {
  var store = {flags:{}};

  function callbackResult(cb, result) {
    cb = cb || noop;
    setTimeout(function() { cb(result); }, 0);  // ensure this is dispatched asynchronously
  }

  store.get = function(key, cb) {
    if (this.flags.hasOwnProperty(key)) {
      var flag = this.flags[key];

      if (!flag || flag.deleted) {
        callbackResult(cb, null);
      } else {
        callbackResult(cb, clone(flag));
      }
    } else {
      cb(null);
    }
  }

  store.all = function(cb) {
    var results = {};

    for (var key in this.flags) {
      if (this.flags.hasOwnProperty(key)) {
        var flag = this.flags[key];
        if (flag && !flag.deleted) {
          results[key] = clone(flag);          
        }
      }
    }

    callbackResult(cb, results);
  }

  store.init = function(flags, cb) {
    this.flags = flags;
    this.init_called = true;
    callbackResult(cb);
  }

  store.delete = function(key, version, cb) {
    var deletedItem = { version: version, deleted: true };
    if (this.flags.hasOwnProperty(key)) {
      var old = this.flags[key];
      if (old && old.version < version) {
        this.flags[key] = deletedItem;
      } 
    } else {
      this.flags[key] = deletedItem;
    }

    callbackResult(cb);
  }

  store.upsert = function(key, flag, cb) {
    var old = this.flags[key];

    if (this.flags.hasOwnProperty(key)) {
      var old = this.flags[key];
      if (old && old.version < flag.version) {
        this.flags[key] = flag;
      }
    } else {
      this.flags[key] = flag;
    }

    callbackResult(cb);
  }

  store.initialized = function(cb) {
    callbackResult(cb, this.init_called === true);
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