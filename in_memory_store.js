// An in-memory store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
var noop = function(){};
function InMemoryStore() {
  var store = {items:{}};

  store.get = function(key, cb) {
    cb = cb || noop;

    if (this.items.hasOwnProperty(key)) {
      var item = this.items[key];

      if (!item || item.deleted) {
        cb(null);
      } else {
        cb(clone(item));
      }
    } else {
      cb(null);
    }
  }

  store.all = function(cb) {
    cb = cb || noop;
    var results = {};

    for (var key in this.items) {
      if (this.items.hasOwnProperty(key)) {
        var item = this.items[key];
        if (item && !item.deleted) {
          results[key] = clone(item);          
        }
      }
    }

    cb(results);
  }

  store.init = function(items, cb) {
    cb = cb || noop;
    this.items = items;
    this.init_called = true;
    cb();
  }

  store.delete = function(key, version, cb) {
    cb = cb || noop;

    if (this.items.hasOwnProperty(key)) {
      var old = this.items[key];
      if (old && old.version < version) {
        old.deleted = true;
        old.version = version;
        this.items[key] = old;
      } 
    } else {
      this.items[key] = old;
    }


    cb();
  }

  store.upsert = function(key, item, cb) {
    cb = cb || noop;    
    var old = this.items[key];

    if (this.items.hasOwnProperty(key)) {
      var old = this.items[key];
      if (old && old.version < item.version) {
        this.items[key] = item;
      }
    } else {
      this.items[key] = item;
    }

    cb();
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

module.exports = InMemoryStore;
