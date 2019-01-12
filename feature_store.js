var dataKind = require('./versioned_data_kind');

// The default in-memory implementation of a feature store, which holds feature flags and
// other related data received from LaunchDarkly.
//
// Other implementations of the same interface can be used by passing them in the featureStore
// property of the client configuration (that's why the interface here is async, even though
// the in-memory store doesn't do anything asynchronous - because other implementations may
// need to be async). The interface is defined by LDFeatureStore in index.d.ts. There is a
// Redis-backed implementation in RedisFeatureStore; for other options, see
// [https://docs.launchdarkly.com/v2.0/docs/using-a-persistent-feature-store].
//
// Additional implementations should use CachingStoreWrapper if possible.

var noop = function(){};
function InMemoryFeatureStore() {
  var store = {allData:{}};

  function callbackResult(cb, result) {
    cb = cb || noop;
    setTimeout(function() { cb(result); }, 0);  // ensure this is dispatched asynchronously
  }

  store.get = function(kind, key, cb) {
    var items = this.allData[kind.namespace] || {};
    if (Object.hasOwnProperty.call(items, key)) {
      var item = items[key];

      if (!item || item.deleted) {
        callbackResult(cb, null);
      } else {
        callbackResult(cb, clone(item));
      }
    } else {
      callbackResult(cb, null);
    }
  }

  store.all = function(kind, cb) {
    var results = {};
    var items = this.allData[kind.namespace] || {};

    for (var key in items) {
      if (Object.hasOwnProperty.call(items, key)) {
        var item = items[key];
        if (item && !item.deleted) {
          results[key] = clone(item);          
        }
      }
    }

    callbackResult(cb, results);
  }

  store.init = function(allData, cb) {
    this.allData = allData;
    this.initCalled = true;
    callbackResult(cb);
  }

  store.delete = function(kind, key, version, cb) {
    var items = this.allData[kind.namespace];
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

    callbackResult(cb);
  }

  store.upsert = function(kind, item, cb) {
    var key = item.key;
    var items = this.allData[kind.namespace];
    if (!items) {
      items = {};
      this.allData[kind.namespace] = items;
    }

    if (Object.hasOwnProperty.call(items, key)) {
      var old = items[key];
      if (old && old.version < item.version) {
        items[key] = item;
      }
    } else {
      items[key] = item;
    }

    callbackResult(cb);
  }

  store.initialized = function(cb) {
    callbackResult(cb, this.initCalled === true);
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
