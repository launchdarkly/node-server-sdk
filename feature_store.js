// An in-memory store with an async interface.
// It's async as other implementations (e.g. the RedisFeatureStore)
// may be async, and we want to retain interface compatibility.
var noop = function(){};
function InMemoryFeatureStore() {
  var store = {allData:{}};

  store.get = function(kind, key, cb) {
    cb = cb || noop;
    var items = this.allData[kind] || {};
    if (Object.hasOwnProperty.call(items, key)) {
      var item = items[key];

      if (!item || item.deleted) {
        cb(null);
      } else {
        cb(clone(item));
      }
    } else {
      cb (null);
    }
  }

  store.all = function(kind, cb) {
    cb = cb || noop;
    var results = {};
    var items = this.allData[kind] || {};

    for (var key in items) {
      if (Object.hasOwnProperty.call(items, key)) {
        var item = items[key];
        if (item && !item.deleted) {
          results[key] = clone(item);          
        }
      }
    }

    cb(results);
  }

  store.init = function(allData, cb) {
    cb = cb || noop;
    this.items = allData;
    this.init_called = true;
    cb();
  }

  store.delete = function(kind, key, version, cb) {
    cb = cb || noop;
    var items = this.allData[kind];
    if (!items) {
      items = {};
      this.allData[kind] = items;
    }
    var deletedItem = { version: version, deleted: true };
    if (Object.hasOwnProperty.call(items, key)) {
      var old = items[key];
      if (!old || old.version < version) {
        items[key] = deletedItem;
      } 
    } else {
      items[key] = deletedItem;
    }


    cb();
  }

  store.upsert = function(kind, item, cb) {
    cb = cb || noop;
    var key = item.key;
    var items = this.allData[kind];
    if (!items) {
      items = {};
      this.allData[kind] = items;
    }

    if (Object.hasOwnProperty.call(items, key)) {
      var old = items[key];
      if (old && old.version < item.version) {
        items[key] = item;
      }
    } else {
      items[key] = item;
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

module.exports = InMemoryFeatureStore;
