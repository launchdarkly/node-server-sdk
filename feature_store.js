// An in-memory feature store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
function InMemoryFeatureStore() {
  var store = {flags:{}};

  store.get = function(key, cb) {
    var flag = store.flags[key];

    if (!flag || flag.deleted) {
      cb(null);
    } else {
      cb(clone(store.flags[key]));
    }
  }

  store.all = function(cb) {
    var results = {};

    for (var key in store.flags) {
      if (store.flags.hasOwnProperty(key)) {
        var flag = store.flags[key];
        if (!flag.deleted) {
          results[key] = clone(flag);          
        }
      }
    }

    cb(results);
  }

  store.init = function(flags, cb) {
    store.flags = flags;
    store.init_called = true;
    cb();
  }

  store.delete = function(key, version, cb) {
    var old = store.flags[key];

    if (old === null || old.version < version) {
      old.deleted = true;
      old.version = version;
      store.flags[key] = old;
    } 
    cb();
  }

  store.upsert = function(key, flag, cb) {
    var old = store.flags[key];

    if (old === null || old.version < flag.version) {
      store.flags[key] = flag;
    }
    cb();
  }

  store.initialized = function() {
    return store.init_called === true;
  }

  return store;
}

// Deep clone an object. Does not preserve any
// functions on the object
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = InMemoryFeatureStore;