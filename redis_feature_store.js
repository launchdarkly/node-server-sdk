var redis = require('redis'),
    NodeCache = require( "node-cache" ),
    winston = require('winston'),
    dataKind = require('./versioned_data_kind');


var noop = function(){};


function RedisFeatureStore(redis_opts, cache_ttl, prefix, logger) {

  var client = redis.createClient(redis_opts),
      store = {},
      items_prefix = (prefix || "launchdarkly") + ":",
      cache = cache_ttl ? new NodeCache({ stdTTL: cache_ttl}) : null,
      updateQueue = [],
      inited = false,
      checked_init = false;

  logger = (logger ||
    new winston.Logger({
      level: 'info',
      transports: [
        new (winston.transports.Console)(),
      ]
    })
  );

  connected = false;
  initialConnect = true;
  client.on('error', function(err) {
    // Note that we *must* have an error listener or else any connection error will trigger an
    // uncaught exception.
    logger.error('Redis error - ' + err);
  });
  client.on('reconnecting', function(info) {
    logger.info('Attempting to reconnect to Redis (attempt #' + info.attempt +
      ', delay: ' + info.delay + 'ms)');
  });
  client.on('connect', function() {
    if (!initialConnect) {
      logger.warn('Reconnected to Redis');
    }
    initialConnect = false;
    connected = true;
  })
  client.on('end', function() {
    connected = false;
  })

  // Allow driver programs to exit, even if the Redis socket is active
  client.unref();

  function items_key(kind) {
    return items_prefix + kind.namespace;
  }

  function cache_key(kind, key) {
    return kind.namespace + ":" + key;
  }

  // A helper that performs a get with the redis client
  function do_get(kind, key, cb) {
    var item;
    cb = cb || noop;

    if (cache_ttl) {
      item = cache.get(cache_key(kind, key));
      if (item) {
        cb(item);
        return;
      }
    }

    if (!connected) {
      logger.warn('Attempted to fetch key ' + key + ' while Redis connection is down');
      cb(null);
      return;
    }

    client.hget(items_key(kind), key, function(err, obj) {
      if (err) {
        logger.error("Error fetching key " + key + " from Redis in '" + kind.namespace + "'", err);
        cb(null);
      } else {
        item = JSON.parse(obj);
        cb(item);
      }
    });
  }

  function queueUpdate(updateFn) {
    updateQueue.push(updateFn);
    if (updateQueue.length == 1) {
      executePendingUpdates();
    }
  }

  function executePendingUpdates() {
    if (updateQueue.length > 0) {
      updateQueue[0]();
    }
  }

  function completedUpdate(cb) {
    updateQueue.shift();
    if (updateQueue.length > 0) {
      setImmediate(executePendingUpdates);
    }
    cb && cb();
  }

  store.get = function(kind, key, cb) {
    cb = cb || noop;
    do_get(kind, key, function(item) {
      if (item && !item.deleted) {
        cb(item);
      } else {
        cb(null);
      }
    });
  };

  store.all = function(kind, cb) {
    cb = cb || noop;
    if (!connected) {
      logger.warn('Attempted to fetch all keys while Redis connection is down');
      cb(null);
      return;
    }

    client.hgetall(items_key(kind), function(err, obj) {
      if (err) {
        logger.error("Error fetching '" + kind.namespace + "'' from Redis", err);
        cb(null);
      } else {
        var results = {},
            items = obj;

        for (var key in items) {
          if (Object.hasOwnProperty.call(items,key)) {
            var item = JSON.parse(items[key]);
            if (!item.deleted) {
              results[key] = item;
            }
          }
        }
        cb(results);
      }
    });
  };

  store.init = function(allData, cb) {
    queueUpdate(function() {
      var multi = client.multi();

      if (cache_ttl) {
        cache.flushAll();
      }

      for (var kindNamespace in allData) {
        if (Object.hasOwnProperty.call(allData, kindNamespace)) {
          var kind = dataKind[kindNamespace];
          var baseKey = items_key(kind);
          var items = allData[kindNamespace];
          var stringified = {};
          multi.del(baseKey);
          for (var key in items) {
            if (Object.hasOwnProperty.call(items, key)) {
              stringified[key] = JSON.stringify(items[key]);
            }
            if (cache_ttl) {
              cache.set(cache_key(kind, key), items[key]);
            }
          }
          // Redis does not allow hmset() with an empty object
          if (Object.keys(stringified).length > 0) {
            multi.hmset(baseKey, stringified);
          }
        }
      }

      multi.exec(function(err, replies) {
        if (err) {
          logger.error("Error initializing Redis store", err);
        } else {
          inited = true;
        }
        completedUpdate(cb);
      });
    });
  };

  store.delete = function(kind, key, version, cb) {
    queueUpdate(function() {
      var multi;
      var baseKey = items_key(kind);
      client.watch(baseKey);
      multi = client.multi();

      do_get(kind, key, function(item) {
        if (item && item.version >= version) {
          multi.discard();
          completedUpdate(cb);
        } else {
          deletedItem = { version: version, deleted: true };
          multi.hset(baseKey, key, JSON.stringify(deletedItem));
          multi.exec(function(err, replies) {
            if (err) {
              logger.error("Error deleting key " + key + " in '" + kind.namespace + "'", err);
            } else if (cache_ttl) {            
              cache.set(cache_key(kind, key), deletedItem);
            }
            completedUpdate(cb);
          });
        }
      });
    });
  };

  store.upsert = function(kind, item, cb) {
    queueUpdate(function() {
      var multi;
      var baseKey = items_key(kind);
      var key = item.key;
      client.watch(baseKey);
      multi = client.multi();

      do_get(kind, key, function(original) {
        if (original && original.version >= item.version) {
          multi.discard();
          completedUpdate(cb);
        } else {
          multi.hset(baseKey, key, JSON.stringify(item));
          multi.exec(function(err, replies) {
            if (err) {
              logger.error("Error upserting key " + key + " in '" + kind.namespace + "'", err);
            } else {
              if (cache_ttl) {
                cache.set(cache_key(kind, key), item);
              }
            }
            completedUpdate(cb);
          });
        }
      });
    });
  };

  store.initialized = function(cb) {
    cb = cb || noop;
    if (inited) {
      // Once we've determined that we're initialized, we can never become uninitialized again
      cb(true);
    }
    else if (checked_init) {
      // We don't want to hit Redis for this question more than once; if we've already checked there
      // and it wasn't populated, we'll continue to say we're uninited until init() has been called
      cb(false);
    }
    else {
      var inited = false;
      client.exists(items_key(dataKind.features), function(err, obj) {
        if (!err && obj) {
          inited = true;
        } 
        checked_init = true;
        cb(inited);
      });
    }
  };

  store.close = function() {
    client.quit();
    if (cache_ttl) {
      cache.close();
    }
  };

  return store;
}

module.exports = RedisFeatureStore;