var NodeCache = require('node-cache'),
    dataKind = require('./versioned_data_kind');

function cacheKey(kind, key) {
  return kind.namespace + ":" + key;
}

function CachingStoreWrapper(underlyingStore, ttl) {
  var cache = new NodeCache({ stdTTL: ttl });

  this.init = function(allData, cb) {
    cache.flushAll();

    // populate cache with initial data
    for (var kindNamespace in allData) {
      if (Object.hasOwnProperty.call(allData, kindNamespace)) {
        var kind = dataKind[kindNamespace];
        var items = allData[kindNamespace];
        for (var key in items) {
          cache.set(kind, key, items[key]);
        }
      }
    }

    underlyingStore.init(allData, cb);
  };

  this.initialized = function(cb) {
    underlyingStore.initialized(cb);
  };

  this.all = function(kind, cb) {
    underlyingStore.all(kind, cb);
  };

  this.get = function(kind, key, cb) {
    item = cache.get(cacheKey(kind, key));
    if (item) {
      cb(item);
      return;
    }

    underlyingStore.get(kind, key, function (item) {
      cache.set(cacheKey(kind, key), item);
      cb(item);
    });
  };

  this.upsert = function(kind, newItem, cb, resultFn) {
    underlyingStore.upsert(kind, newItem, cb, function(err) {
      if (!err) {
        cache.set(kind, newItem.key, newItem);
      }
      resultFn(err);
    });
  };

  this.delete = function(kind, key, version, cb) {
    cache.del(cacheKey(kind, key));
    underlyingStore.delete(kind, key, version, cb);
  };

  this.close = function() {
    cache.close();
    underlyingStore.close();
  };
}

module.exports = CachingStoreWrapper;

