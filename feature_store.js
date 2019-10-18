
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

const noop = function(){};
function InMemoryFeatureStore() {
  let allData = {};
  let initCalled = false;

  const store = {};

  function callbackResult(cb, result) {
    cb = cb || noop;
    setTimeout(() => { cb(result); }, 0);  // ensure this is dispatched asynchronously
  }

  store.get = (kind, key, cb) => {
    const items = allData[kind.namespace] || {};
    if (Object.hasOwnProperty.call(items, key)) {
      const item = items[key];

      if (!item || item.deleted) {
        callbackResult(cb, null);
      } else {
        callbackResult(cb, clone(item));
      }
    } else {
      callbackResult(cb, null);
    }
  };

  store.all = (kind, cb) => {
    const results = {};
    const items = allData[kind.namespace] || {};

    for (let key in items) {
      if (Object.hasOwnProperty.call(items, key)) {
        const item = items[key];
        if (item && !item.deleted) {
          results[key] = clone(item);          
        }
      }
    }

    callbackResult(cb, results);
  };

  store.init = (newData, cb) => {
    allData = newData;
    initCalled = true;
    callbackResult(cb);
  };

  store.delete = (kind, key, version, cb) => {
    let items = allData[kind.namespace];
    if (!items) {
      items = {};
      allData[kind] = items;
    }
    const deletedItem = { version: version, deleted: true };
    if (Object.hasOwnProperty.call(items, key)) {
      const old = items[key];
      if (!old || old.version < version) {
        items[key] = deletedItem;
      } 
    } else {
      items[key] = deletedItem;
    }

    callbackResult(cb);
  };

  store.upsert = (kind, item, cb) => {
    const key = item.key;
    let items = allData[kind.namespace];
    if (!items) {
      items = {};
      allData[kind.namespace] = items;
    }

    if (Object.hasOwnProperty.call(items, key)) {
      const old = items[key];
      if (old && old.version < item.version) {
        items[key] = item;
      }
    } else {
      items[key] = item;
    }

    callbackResult(cb);
  };

  store.initialized = cb => {
    callbackResult(cb, initCalled === true);
  };

  store.close = () => {
    // Close on the in-memory store is a no-op
  };

  return store;
}

// Deep clone an object. Does not preserve any
// functions on the object
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = InMemoryFeatureStore;
