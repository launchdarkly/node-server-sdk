var redis = require('redis'),
    winston = require('winston'),
    dataKind = require('./versioned_data_kind'),
    CachingStoreWrapper = require('./caching_store_wrapper');
    UpdateQueue = require('./update_queue');


var noop = function(){};


function RedisFeatureStore(redisOpts, cacheTTL, prefix, logger) {
  return new CachingStoreWrapper(cacheTTL, new RedisFeatureStoreNoCache(redisOpts, prefix, logger));
}

// TODO better name?
function RedisFeatureStoreNoCache(redisOpts, prefix, logger) {

  var client = redis.createClient(redisOpts),
      store = {},
      itemsPrefix = (prefix || "launchdarkly") + ":",
      updateQueue = new UpdateQueue(),
      inited = false,
      checkedInit = false;

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

  // Places an update operation on the queue.
  var serializeFn = function(updateFn, fnArgs, cb) {
    updateQueue.enqueue(updateFn.bind(store), fnArgs, cb);
  };

  store.get = function(kind, key, cb) {
    cb = cb || noop;
    doGet(kind, key, function(item) {
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

    client.hgetall(itemsKey(kind), function(err, obj) {
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
    serializeFn(store._init, [allData], cb);
  };

  store._init = function(allData, cb) {
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

    multi.exec(function(err, replies) {
      if (err) {
        logger.error("Error initializing Redis store", err);
      } else {
        inited = true;
      }
      cb();
    });
  };

  store.delete = function(kind, key, version, cb) {
    serializeFn(store._delete, [kind, key, version], cb);
  };

  store._delete = function(kind, key, version, cb) {
    var deletedItem = { key: key, version: version, deleted: true };
    updateItemWithVersioning(kind, deletedItem, cb,
      function(err) {
        if (err) {
          logger.error("Error deleting key " + key + " in '" + kind.namespace + "'", err);
        }
      });
  }

  store.upsert = function(kind, item, cb) {
    serializeFn(store._upsert, [kind, item], cb);
  };

  store._upsert = function(kind, item, cb) {
    updateItemWithVersioning(kind, item, cb,
      function(err) {
        if (err) {
          logger.error("Error upserting key " + key + " in '" + kind.namespace + "'", err);
        }
      });
  }

  function updateItemWithVersioning(kind, newItem, cb, resultFn) {
    client.watch(itemsKey(kind));
    var multi = client.multi();
    // test_transaction_hook is instrumentation, set only by the unit tests
    var prepare = store.test_transaction_hook || function(prepareCb) { prepareCb(); };
    prepare(function() {
      doGet(kind, newItem.key, function(oldItem) {
        if (oldItem && oldItem.version >= newItem.version) {
          multi.discard();
          cb();
        } else {
          multi.hset(itemsKey(kind), newItem.key, JSON.stringify(newItem));
          multi.exec(function(err, replies) {
            if (!err && replies === null) {
              // This means the EXEC failed because someone modified the watched key
              logger.debug("Concurrent modification detected, retrying");
              updateItemWithVersioning(kind, newItem, cb, resultFn);
            } else {
              resultFn(err);
              cb();
            }
          });
        }
      });
    });
  }

  store.initialized = function(cb) {
    cb = cb || noop;
    if (inited) {
      // Once we've determined that we're initialized, we can never become uninitialized again
      cb(true);
    }
    else if (checkedInit) {
      // We don't want to hit Redis for this question more than once; if we've already checked there
      // and it wasn't populated, we'll continue to say we're uninited until init() has been called
      cb(false);
    }
    else {
      var inited = false;
      client.exists(itemsKey(dataKind.features), function(err, obj) {
        if (!err && obj) {
          inited = true;
        }
        checkedInit = true;
        cb(inited);
      });
    }
  };

  store.close = function() {
    client.quit();
  };

  return store;
}

module.exports = RedisFeatureStore;
