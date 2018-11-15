var NodeCache = require('node-cache'),
    dataKind = require('./versioned_data_kind'),
    UpdateQueue = require('./update_queue');

function cacheKey(kind, key) {
  return kind.namespace + ":" + key;
}

function allCacheKey(kind) {
  return "$all:" + kind.namespace;
}

var initializedKey = "$checkedInit";

/*
  CachingStoreWrapper provides commonly needed functionality for implementations of an
  SDK feature store. The underlyingStore must implement a simplified interface for
  querying and updating the data store (see redis_feature_store.js for an example)
  while CachingStoreWrapper adds optional caching of stored items and of the
  initialized state, and ensures that asynchronous operations are serialized correctly.
*/
function CachingStoreWrapper(underlyingStore, ttl) {
  var cache = ttl ? new NodeCache({ stdTTL: ttl }) : null;
  var queue = new UpdateQueue();
  var initialized = false;

  this.underlyingStore = underlyingStore;
  
  this.init = function(allData, cb) {
    queue.enqueue(function(cb) {
      underlyingStore.initInternal(allData, function() {
        initialized = true;

        if (cache) {
          cache.del(initializedKey);
          cache.flushAll();

          // populate cache with initial data
          for (var kindNamespace in allData) {
            if (Object.hasOwnProperty.call(allData, kindNamespace)) {
              var kind = dataKind[kindNamespace];
              var items = allData[kindNamespace];
              cache.set(allCacheKey(kind), items);
              for (var key in items) {
                cache.set(cacheKey(kind, key), items[key]);
              }
            }
          }
        }

        cb();
      });
    }, [], cb);
  };

  this.initialized = function(cb) {
    if (initialized) {
      cb(true);
    } else if (cache && cache.get(initializedKey)) {
      cb(false);
    } else {
      underlyingStore.initializedInternal(function(inited) {
        initialized = inited;
        if (!initialized) {
          cache && cache.set(initializedKey, true);
        }
        cb(initialized);
      });
    }
  };

  this.all = function(kind, cb) {
    var items = cache && cache.get(allCacheKey(kind));
    if (items) {
      cb(items);
      return;
    }

    underlyingStore.getAllInternal(kind, function(items) {
      if (items === null || items === undefined) {
        cb(items);
        return;
      }
      var filteredItems = {};
      Object.keys(items).forEach(function(key) {
        var item = items[key];
        if (item && !item.deleted) {
          filteredItems[key] = item;
        }
      });
      cache && cache.set(allCacheKey(kind), filteredItems);
      cb(filteredItems);
    });
  };

  this.get = function(kind, key, cb) {
    if (cache) {
      var item = cache.get(cacheKey(kind, key));
      if (item !== undefined) {
        cb(itemOnlyIfNotDeleted(item));
        return;
      }
    }

    underlyingStore.getInternal(kind, key, function(item) {
      cache && cache.set(cacheKey(kind, key), item);
      cb(itemOnlyIfNotDeleted(item));
    });
  };

  function itemOnlyIfNotDeleted(item) { 
    return (!item || item.deleted) ? null : item;
  }

  this.upsert = function(kind, newItem, cb) {
    queue.enqueue(function (cb) {
      flushAllCaches();
      underlyingStore.upsertInternal(kind, newItem, function(err, updatedItem) {
        if (!err) {
          cache && cache.set(cacheKey(kind, newItem.key), updatedItem);
        }
        cb();
      });
    }, [], cb);
  };

  this.delete = function(kind, key, version, cb) {
    this.upsert(kind, { key: key, version: version, deleted: true }, cb);
  };

  this.close = function() {
    cache && cache.close();
    underlyingStore.close();
  };

  function flushAllCaches() {
    if (!cache) {
      return;
    }
    for (var kindNamespace in dataKind) {
      cache.del(allCacheKey(dataKind[kindNamespace]));
    }
  }
}

module.exports = CachingStoreWrapper;

