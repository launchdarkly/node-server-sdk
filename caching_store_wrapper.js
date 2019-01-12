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
  querying and updating the data store, while CachingStoreWrapper adds optional caching of
  stored items and of the initialized state, and ensures that asynchronous operations are
  serialized correctly.

  The underlyingStore object must have the following methods:

  - getInternal(kind, key, callback): Queries a single item from the data store. The kind
  parameter is an object with a "namespace" property that uniquely identifies the
  category of data (features, segments), and the key is the unique key within that
  category. It calls the callback with the resulting item as a parameter, or, if no such
  item exists, null/undefined. It should not attempt to filter out any items, nor to
  cache any items.

  - getAllInternal(kind, callback): Queries all items in a given category from the data
  store, calling the callback with an object where each key is the item's key and each
  value is the item. It should not attempt to filter out any items, nor to cache any items.

  - upsertInternal(kind, newItem, callback): Adds or updates a single item. If an item with
  the same key already exists (in the category specified by "kind"), it should update it
  only if the new item's "version" property is greater than the old one. On completion, it
  should call the callback with the final state of the item, i.e. if the update succeeded
  then it passes the item that was passed in, and if the update failed due to the version
  check then it passes the item that is currently in the data store (this ensures that
  caching works correctly). Note that deletions are implemented by upserting a placeholder
  item with the property "deleted: true".

  - initializedInternal(callback): Tests whether the data store contains a complete data
  set, meaning that initInternal() or initOrdereInternal() has been called at least once.
  In a shared data store, it should be able to detect this even if the store was
  initialized by a different process, i.e. the test should be based on looking at what is
  in the data store. The method does not need to worry about caching this value;
  CachingStoreWrapper will only call it when necessary. Call callback with true or false.

  - initInternal(allData, callback): Replaces the entire contents of the data store. This
  should be done atomically (i.e. within a transaction); if that isn't possible, use
  initOrderedInternal() instead. The allData parameter is an object where each key is one
  of the "kind" objects, and each value is an object with the keys and values of all
  items of that kind. Call callback with no parameters when done.
    OR:
  - initOrderedInternal(collections, callback): Replaces the entire contents of the data
  store. The collections parameter is an array of objects, each of which has "kind" and
  "items" properties; "items" is an array of data items. Each array should be processed
  in the specified order. The store should delete any obsolete items only after writing
  all of the items provided.
*/
function CachingStoreWrapper(underlyingStore, ttl) {
  var cache = ttl ? new NodeCache({ stdTTL: ttl }) : null;
  var queue = new UpdateQueue();
  var initialized = false;

  this.underlyingStore = underlyingStore;
  
  this.init = function(allData, cb) {
    queue.enqueue(function(cb) {
      // The underlying store can either implement initInternal, which receives unordered  data,
      // or initOrderedInternal, which receives ordered data (for implementations that cannot do
      // an atomic update and therefore need to be told what order to do the operations in).
      var afterInit = function() {
        initialized = true;

        if (cache) {
          cache.del(initializedKey);
          cache.flushAll();

          // populate cache with initial data
          Object.keys(allData).forEach(function(kindNamespace) {
            var kind = dataKind[kindNamespace];
            var items = allData[kindNamespace];
            cache.set(allCacheKey(kind), items);
            Object.keys(items).forEach(function(key) {
              cache.set(cacheKey(kind, key), items[key]);
            });
          });
        }

        cb();
      };

      if (underlyingStore.initOrderedInternal) {
        var orderedData = sortAllCollections(allData);
        underlyingStore.initOrderedInternal(orderedData, afterInit);
      } else {
        underlyingStore.initInternal(allData, afterInit);
      }
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

  // This and the next function are used by init() to provide the best ordering of items
  // to write the underlying store, if the store supports the initOrderedInternal method.
  function sortAllCollections(dataMap) {
    var result = [];
    Object.keys(dataMap).forEach(function(kindNamespace) {
      var kind = dataKind[kindNamespace];
      result.push({ kind: kind, items: sortCollection(kind, dataMap[kindNamespace]) });
    });
    var kindPriority = function(kind) {
      return kind.priority === undefined ? kind.namespace.length : kind.priority
    };
    result.sort(function(i1, i2) {
      return kindPriority(i1.kind) - kindPriority(i2.kind);
    });
    return result;
  }

  function sortCollection(kind, itemsMap) {
    var itemsOut = [];
    var remainingItems = new Set(Object.keys(itemsMap));
    var addWithDependenciesFirst = function(key) {
      if (remainingItems.has(key)) {
        remainingItems.delete(key);
        var item = itemsMap[key];
        if (kind.getDependencyKeys) {
          kind.getDependencyKeys(item).forEach(function(prereqKey) {
            addWithDependenciesFirst(prereqKey);
          });
        }
        itemsOut.push(item);
      }
    };
    while (remainingItems.size > 0) {
      // pick a random item that hasn't been updated yet
      var key = remainingItems.values().next().value;
      addWithDependenciesFirst(key);
    }
    return itemsOut;
  }
}

module.exports = CachingStoreWrapper;

