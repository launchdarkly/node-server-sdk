var redis = require('redis'),
    winston = require('winston'),
    dataKind = require('./versioned_data_kind'),
    CachingStoreWrapper = require('./caching_store_wrapper');


var noop = function(){};


function RedisFeatureStore(redisOpts, cacheTTL, prefix, logger) {
  return new CachingStoreWrapper(new redisFeatureStoreInternal(redisOpts, prefix, logger), cacheTTL);
}

function redisFeatureStoreInternal(redisOpts, prefix, logger) {

  var client = redis.createClient(redisOpts),
      store = {},
      itemsPrefix = (prefix || "launchdarkly") + ":",
      initedKey = itemsPrefix + "$inited";

  logger = (logger ||
    new winston.Logger({
      level: 'info',
      transports: [
        new (winston.transports.Console)(),
      ]
    })
  );

  var connected = false;
  var initialConnect = true;
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
  });
  client.on('end', function() {
    connected = false;
  });

  // Allow driver programs to exit, even if the Redis socket is active
  client.unref();

  function itemsKey(kind) {
    return itemsPrefix + kind.namespace;
  }

  // A helper that performs a get with the redis client
  function doGet(kind, key, cb) {
    var item;
    cb = cb || noop;

    if (!connected) {
      logger.warn('Attempted to fetch key ' + key + ' while Redis connection is down');
      cb(null);
      return;
    }

    client.hget(itemsKey(kind), key, function(err, obj) {
      if (err) {
        logger.error("Error fetching key " + key + " from Redis in '" + kind.namespace + "'", err);
        cb(null);
      } else {
        item = JSON.parse(obj);
        cb(item);
      }
    });
  }

  store.getInternal = function(kind, key, cb) {
    cb = cb || noop;
    doGet(kind, key, function(item) {
      if (item && !item.deleted) {
        cb(item);
      } else {
        cb(null);
      }
    });
  };

  store.getAllInternal = function(kind, cb) {
    cb = cb || noop;
    if (!connected) {
      logger.warn('Attempted to fetch all keys while Redis connection is down');
      cb(null);
      return;
    }

    client.hgetall(itemsKey(kind), function(err, obj) {
      if (err) {
        logger.error("Error fetching '" + kind.namespace + "'' from Redis", err);
        cb(null);
      } else {
        var results = {},
            items = obj;

        for (var key in items) {
          if (Object.hasOwnProperty.call(items, key)) {
            results[key] = JSON.parse(items[key]);
          }
        }
        cb(results);
      }
    });
  };

  store.initInternal = function(allData, cb) {
    var multi = client.multi();

    for (var kindNamespace in allData) {
      if (Object.hasOwnProperty.call(allData, kindNamespace)) {
        var kind = dataKind[kindNamespace];
        var baseKey = itemsKey(kind);
        var items = allData[kindNamespace];
        var stringified = {};
        multi.del(baseKey);
        for (var key in items) {
          if (Object.hasOwnProperty.call(items, key)) {
            stringified[key] = JSON.stringify(items[key]);
          }
        }
        // Redis does not allow hmset() with an empty object
        if (Object.keys(stringified).length > 0) {
          multi.hmset(baseKey, stringified);
        }
      }
    }

    multi.set(initedKey, "");
    
    multi.exec(function(err, replies) {
      if (err) {
        logger.error("Error initializing Redis store", err);
      }
      cb();
    });
  };

  store.upsertInternal = function(kind, item, cb) {
    updateItemWithVersioning(kind, item, function(err, attemptedWrite) {
      if (err) {
        logger.error("Error upserting key " + key + " in '" + kind.namespace + "'", err);
      }
      cb(err, attemptedWrite);
    });
  }

  function updateItemWithVersioning(kind, newItem, cb) {
    client.watch(itemsKey(kind));
    var multi = client.multi();
    // testUpdateHook is instrumentation, used only by the unit tests
    var prepare = store.testUpdateHook || function(prepareCb) { prepareCb(); };
    prepare(function() {
      doGet(kind, newItem.key, function(oldItem) {
        if (oldItem && oldItem.version >= newItem.version) {
          multi.discard();
          cb(null, oldItem);
        } else {
          multi.hset(itemsKey(kind), newItem.key, JSON.stringify(newItem));
          multi.exec(function(err, replies) {
            if (!err && replies === null) {
              // This means the EXEC failed because someone modified the watched key
              logger.debug("Concurrent modification detected, retrying");
              updateItemWithVersioning(kind, newItem, cb);
            } else {
              cb(err, newItem);
            }
          });
        }
      });
    });
  }

  store.initializedInternal = function(cb) {
    cb = cb || noop;
    client.exists(initedKey, function(err, obj) {
      cb(Boolean(!err && obj));
    });
  };

  store.close = function() {
    client.quit();
  };

  return store;
}

module.exports = RedisFeatureStore;
