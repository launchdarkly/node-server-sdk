var deepEqual = require('deep-equal');
// An in-memory feature store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
var noop = function(){};
function InMemoryFeatureStore(emitter) {
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

    var oldFlags = this.flags;
    this.flags = flags;

    for (var key in oldFlags) {
      if (oldFlags.hasOwnProperty(key)) {
        differ(key, oldFlags[key], flags[key]);
      }
    }

    this.init_called = true;
    cb();
  }

  store.delete = function(key, version, cb) {
    cb = cb || noop;

    var oldFlag = this.flags[key];

    if (this.flags.hasOwnProperty(key)) {
      if (oldFlag && oldFlag.version < version) {
        oldFlag.deleted = true;
        oldFlag.version = version;
        this.flags[key] = oldFlag;
      } 
    } else {
      this.flags[key] = oldFlag;
    }

    differ(key, oldFlag, {});

    cb();
  }

  store.upsert = function(key, flag, cb) {
    cb = cb || noop;

    var oldFlag = this.flags[key];

    if (this.flags.hasOwnProperty(key)) {
      if (oldFlag && oldFlag.version < flag.version) {
        this.flags[key] = flag;
      }
    } else {
      this.flags[key] = flag;
    }

    differ(key, oldFlag, flag);

    cb();
  }

  function differ(key, oldValue, newValue) {
    if(deepEqual(oldValue, newValue)) return;
    emitter.emit("update", newValue);
    emitter.emit(`update:${key}`, oldValue, newValue);
  }

  store.initialized = function() {
    return this.init_called === true;
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