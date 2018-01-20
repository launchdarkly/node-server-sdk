var redis = require('redis'),
    NodeCache = require( "node-cache" ),
    winston = require('winston');


var noop = function(){};


function RedisStore(itemName, baseKey) {
  return function(redis_opts, cache_ttl, prefix, logger) {

    var client = redis.createClient(redis_opts),
        store = {},
        items_key = (prefix || "launchdarkly") + baseKey,
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
      var item;
      cb = cb || noop;

      if (cache_ttl) {
        item = cache.get(key);
        if (item) {
          cb(item);
          return;
        }
      }

      client.hget(items_key, key, function(err, obj) {
        if (err) {
          logger.error("Error fetching " + itemName + " from redis", err);
          cb(null);
        } else {
          item = JSON.parse(obj);
          cb( (!item || item.deleted) ? null : item);
        }
      });
    }

    store.get = function(key, cb) {
      do_get(key, function(item) {
        if (item && !item.deleted) {
          cb(item);
        } else {
          cb(null);
        }
      });
    };

    store.all = function(cb) {
      cb = cb || noop;
      client.hgetall(items_key, function(err, obj) {
        if (err) {
          logger.error("Error fetching " + itemName + " from redis", err);
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

    store.init = function(items, cb) {
      var stringified = {};
      var multi = client.multi();
      cb = cb || noop;

      multi.del(items_key);
      if (cache_ttl) {
        cache.flushAll();
      }


      for (var key in items) {
        if (Object.hasOwnProperty.call(items,key)) {
          stringified[key] = JSON.stringify(items[key]);
        }
        if (cache_ttl) {
          cache.set(key, items[key]);
        }
      }

      multi.hmset(items_key, stringified);

      multi.exec(function(err, replies) {
        if (err) {
          logger.error("Error initializing redis " + itemName + " store", err);
        } else {
          inited = true;
        }
        cb();
      });
    };

    store.delete = function(key, version, cb) {
      var multi;
      cb = cb || noop;
      client.watch(items_key);
      multi = client.multi();


      do_get(key, function(item) {
        if (item) {
          if (item.version >= version) {
            cb();
            return;
          } else {
            item.deleted = true;
            item.version = version;
            multi.hset(items_key, key, JSON.stringify(item));
            multi.exec(function(err, replies) {
              if (err) {
                logger.error("Error deleting " + itemName, err);
              } else if (cache_ttl) {            
                cache.set(key, item);
              }
              cb();
            });
          }
        }
      });
    };

    store.upsert = function(key, item, cb) {
      var multi;
      cb = cb || noop;
      client.watch(items_key);
      multi = client.multi();

      do_get(key, function(original) {
        if (original && original.version >= item.version) {
          cb();
          return;
        }

        multi.hset(items_key, key, JSON.stringify(item));
        multi.exec(function(err, replies) {
          if (err) {
            logger.error("Error upserting " + itemName, err);
          } else {
            if (cache_ttl) {
              cache.set(key, item);
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
        client.exists(items_key, function(err, obj) {
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
  };
}

module.exports = RedisStore;