var NodeCache = require('node-cache');

function cacheKey(kind, key) {
  return kind.namespace + ":" + key;
}

function StoreCache(ttl, getFallback) {
  var cache = ttl ? new NodeCache({ stdTTL: ttl }) : null;

  this.get = function(kind, key, cb) {
    if (cache) {
      item = cache.get(cacheKey(kind, key));
      if (item) {
        cb(item);
        return;
      }
    }

    getFallback(kind, key, function (item) {
      if (cache) {
        cache.set(cacheKey(kind, key), item);
      }
      cb(item);
    });
  };

  this.set = function(kind, key, newItem) {
    cache.set(cacheKey(kind, key), newItem);
  };

  this.flush = function() {
    cache.flushAll();
  };

  this.close = function() {
    cache && cache.close();
  };
}

// queue
function UpdateQueue() {
  var updateQueue = [];
  this.enqueue = function(updateFn, fnArgs, cb) {
    updateQueue.push(arguments);
    if (updateQueue.length === 1) {
      // if nothing else is in progress, we can start this one right away
      executePendingUpdates();
    }
  };
  function executePendingUpdates() {
    if (updateQueue.length > 0) {
      const entry = updateQueue[0];
      console.log(entry);
      const fn = entry[0];
      const args = entry[1];
      const cb = entry[2];
      const newCb = function() {
        updateQueue.shift();
        if (updateQueue.length > 0) {
          setImmediate(executePendingUpdates);
        }
        cb && cb();
      };
      fn.apply(null, args.concat([newCb]));
    }
  }
}

module.exports = { StoreCache, UpdateQueue };
