var redis = require('redis'),
    NodeCache = require( "node-cache" );


function RedisFeatureStore(redis_opts, cache_ttl) {
  var client = redis.createClient(redis_opts),
      store = {},
      features_key = ":features",
      cache = new NodeCache({ stdTTL: cache_ttl});

  // Allow driver programs to exit, even if the Redis
  // socket is active
  client.unref();

  // A helper that performs a get with either the redis client
  // itself, or a multi object from a redis transaction
  function do_get(mclient, key, cb) {
    var flag = cache.get(key);
    cb = cb || noop;    

    if (flag) {
      if (flag.deleted) {
        cb(null);
      } else {
        cb(flag);
      }
    } else {
      mclient.hget(features_key, key, function(err, obj) {
        if (err) {
          config.logger.error("[LaunchDarkly] Error fetching flag from redis", err)
          cb(null);
        } else {
          flag = JSON.parse(obj);
          cb(flag.deleted ? null : flag);
        }
      });
    }    
  }

  store.get = function(key, cb) {
    do_get(client, key, cb);
  }

  store.all = function(cb) {
    cb = cb || noop;    
    client.hgetall(features_key, function(err, obj) {
      if (err) {
        config.logger.error("[LaunchDarkly] Error fetching flag from redis", err)
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
  }

  store.init = function(flags, cb) {
    var stringified = {};
    var multi = client.multi();
    cb = cb || noop;    
    
    multi.del(features_key);
    cache.flushAll();

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
        config.logger.error("[LaunchDarkly] Error initializing redis feature store", err);
      } 
      cb();
    });
  }

  store.delete = function(key, version, cb) {
    var multi;
    cb = cb || noop;        
    client.watch(features_key);
    multi = client.multi();

    // We need to run the get() code in a multi txn
    do_get(multi, key, function(flag) {
      if (flag) {
        if (flag.version >= version) {
          cb();
          return;          
        } else {
          flag.deleted = true;
          flag.version = version;
          multi.hset(features_key, key, JSON.stringify(flag));
          multi.exec(function(err, replies) {
            if (err) {
              config.logger.error("[LaunchDarkly] Error deleting feature flag", err);
            } else if (cache_ttl) {            
              cache.set(key, flag);
            }
            cb();
          })
        }
      } 
    });
  }

  store.upsert = function(key, flag, cb) {    
    var multi;
    cb = cb || noop;        
    client.watch(features_key);
    multi = client.multi();

    do_get(multi, key, function(original) {
      if (original) {
        if (original.version >= version) {
          cb();
          return;          
        } else {
          multi.hset(features_key, key, JSON.stringify(flag));
          multi.exec(function(err, replies) {
            if (err) {
              config.logger.error("[LaunchDarkly] Error upserting feature flag", err);
            } else {
              if (cache_ttl) {
                cache.put(key, flag);
              }
            }
            cb();
          })
        }
      } 
    })
  }

  store.initialized = function(cb) {
    var init = cache.get('$initialized$');
    cb = cb || noop;        

    if (init) {
      return true;
    }    

    client.exists('$initialized$', function(err, obj) {
      if (!err && obj) {
        cache.set('$initialized$', true);
      } 
      cb(!err && obj);
    });
  }

  store.close = function() {
    client.quit();
    cache.close();
  }

  return store;
}

module.exports = RedisFeatureStore