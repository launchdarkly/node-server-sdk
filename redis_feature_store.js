var redis = require('redis'),
    NodeCache = require( "node-cache" ),
    winston = require('winston');


var noop = function(){};


function RedisFeatureStore(redis_opts, cache_ttl, prefix, logger) {
  var client = redis.createClient(redis_opts),
      store = {},
      features_key = prefix ? prefix + ":features" : "launchdarkly:features",
      cache = cache_ttl ? new NodeCache({ stdTTL: cache_ttl}) : null,
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

  // Allow driver programs to exit, even if the Redis
  // socket is active
  client.unref();

  // A helper that performs a get with the redis client
  function do_get(key, cb) {
    var flag;
    cb = cb || noop;

    if (cache_ttl) {
      flag = cache.get(key);
      if (flag) {
        cb(flag);
        return;
      }
    }

    client.hget(features_key, key, function(err, obj) {
      if (err) {
        logger.error("Error fetching flag from redis", err);
        cb(null);
      } else {
        flag = JSON.parse(obj);
        cb( (!flag || flag.deleted) ? null : flag);
      }
    });
  }

  store.get = function(key, cb) {
    do_get(key, function(flag) {
      if (flag && !flag.deleted) {
        cb(flag);
      } else {
        cb(null);
      }
    });
  };

  store.all = function(cb) {
    cb = cb || noop;
    client.hgetall(features_key, function(err, obj) {
      if (err) {
        logger.error("Error fetching flag from redis", err);
        cb(null);
      } else {
        var results = {},
            flags = obj;

        for (var key in flags) {
          if (Object.hasOwnProperty.call(flags,key)) {
            var flag = JSON.parse(flags[key]);
            if (!flag.deleted) {
              results[key] = flag;
            }
          }
        }
        cb(results);
      }
    });
  };

  store.init = function(flags, cb) {
    var stringified = {};
    var multi = client.multi();
    cb = cb || noop;

    multi.del(features_key);
    if (cache_ttl) {
      cache.flushAll();
    }


    for (var key in flags) {
      if (Object.hasOwnProperty.call(flags,key)) {
        stringified[key] = JSON.stringify(flags[key]);
      }
      if (cache_ttl) {
        cache.set(key, flags[key]);
      }
    }

    multi.hmset(features_key, stringified);

    multi.exec(function(err, replies) {
      if (err) {
        logger.error("Error initializing redis feature store", err);
      } else {
        inited = true;
      }
      cb();
    });
  };

  store.delete = function(key, version, cb) {
    var multi;
    cb = cb || noop;
    client.watch(features_key);
    multi = client.multi();

    do_get(key, function(flag) {
      if (flag && flag.version >= version) {
        multi.discard();
        cb();
        return;
      } else {
        var deletedItem = { version: version, deleted: true };
        multi.hset(features_key, key, JSON.stringify(deletedItem));
        multi.exec(function(err, replies) {
          if (err) {
            logger.error("Error deleting feature flag", err);
          } else if (cache_ttl) {            
            cache.set(key, deletedItem);
          }
          cb();
        });
      }
    });
  };

  store.upsert = function(key, flag, cb) {
    var multi;
    cb = cb || noop;
    client.watch(features_key);
    multi = client.multi();

    do_get(key, function(original) {
      if (original && original.version >= flag.version) {
        cb();
        return;
      }

      multi.hset(features_key, key, JSON.stringify(flag));
      multi.exec(function(err, replies) {
        if (err) {
          logger.error("Error upserting feature flag", err);
        } else {
          if (cache_ttl) {
            cache.set(key, flag);
          }
        }
        cb();
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
      client.exists(features_key, function(err, obj) {
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