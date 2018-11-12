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


function CachingStoreWrapper(underlyingStore, ttl) {
  var cache = ttl ? new NodeCache({ stdTTL: ttl }) : null;
  var queue = new UpdateQueue();
  var initialized = false;

  this.underlyingStore = underlyingStore;
  
  this.init = function(allData, cb) {
    queue.enqueue(function(cb) {
      underlyingStore.init(allData, function() {
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
      underlyingStore.initialized(function(inited) {
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

    underlyingStore.all(kind, function(items) {
      cache && cache.set(allCacheKey(kind), items);
      cb(items);
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

    underlyingStore.get(kind, key, function(item) {
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
    cache.close();
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

