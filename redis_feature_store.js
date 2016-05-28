var redis = require('redis'),
    cache = require('memory-cache');


function RedisFeatureStore(redis_opts, cache_ttl) {
  client = redis.createClient(redis_opts);

  var features_key = ":features";

  // A helper that performs a get with either the redis client
  // itself, or a multi object from a redis transaction
  function do_get(mclient, key, cb) {
    var flag = cache.get(key);

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
    client.hgetall(features_key, function(err, obj) {
      if (err) {
        config.logger.error("[LaunchDarkly] Error fetching flag from redis", err)
        cb(null);
      } else {
        var results = {}, 
            flags = JSON.parse(obj);

        for (var key in flags) {
          if (flags.hasOwnProperty(key)) {
            var flag = flags[key];
            if (!flag.deleted) {
              results[key] = clone(flag);          
            }
          }
        }
        cb(results);
      }
    });
  }

  store.init = function(flags, cb) {
    var multi = client.multi();
    
    multi.del(features_key);
    cache.clear();

    for (var key in flags) {
      if (flags.hasOwnProperty(key)) {
        multi.hset(features_key, key, JSON.stringify(flags[key]));
      }
      if (cache_ttl) {
        cache.put(key, flags[key], cache_ttl);
      }
    }

    multi.exec(function(err, replies) {
      if (err) {
        config.logger.error("[LaunchDarkly] Error initializing redis feature store", err);
      } 
      cb();
    });
  }

  store.delete = function(key, version, cb) {
    var multi;
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
            } else {
              cache.put(key, flag, cache_ttl);
            }
            cb();
          })
        }
      } 
    });
  }

  store.upsert = function(key, flag, cb) {
    var multi;
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
              cache.put(key, flag, cache_ttl);
            }
            cb();
          })
        }
      } 
    })
  }

  store.initialized = function(cb) {
    var init = cache.get('$initialized$');

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

}

module.exports = RedisFeatureStore