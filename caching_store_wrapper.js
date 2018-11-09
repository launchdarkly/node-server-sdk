var NodeCache = require('node-cache'),
    dataKind = require('./versioned_data_kind'),
    UpdateQueue = require('./update_queue');

function cacheKey(kind, key) {
  return kind.namespace + ":" + key;
}

function CachingStoreWrapper(underlyingStore, ttl) {
  var cache = ttl ? new NodeCache({ stdTTL: ttl }) : null;
  var queue = new UpdateQueue();
  var initialized;

  this.init = function(allData, cb) {
    initialized = undefined;
    queue.enqueue(function(cb) {
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
    }, [], cb);
  };

  this.initialized = function(cb) {
    if (initialized === undefined) {
      underlyingStore.initialized(function(inited) {
        initialized = inited;
        cb(initialized);
      });
    } else {
      // if we already have a cached value for initialized, don't bother trying
      // to call the underlying store until someone calls init, since it won't
      // change.
      cb(initialized);
    }
  };

  this.all = function(kind, cb) {
    underlyingStore.all(kind, cb);
  };

  this.get = function(kind, key, cb) {
    item = cache && cache.get(cacheKey(kind, key));
    if (item && !item.deleted) {
      cb(item);
      return;
    }

    underlyingStore.get(kind, key, function (item) {
      cache && cache.set(cacheKey(kind, key), item);
      cb(item);
    });
  };

  this.upsert = function(kind, newItem, cb) {
    queue.enqueue(function (cb) {
      underlyingStore.upsertInternal(kind, newItem, function(err, attemptedWrite) {
        if (attemptedWrite && !err) {
          var red = cache && cache.set(cacheKey(kind, newItem.key), newItem);
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
}

module.exports = CachingStoreWrapper;

