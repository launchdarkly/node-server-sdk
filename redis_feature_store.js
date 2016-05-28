var redis = require('redis'),
    cache = require('memory-cache');


function RedisFeatureStore(redis_opts, cache_ttl) {
  client = redis.createClient(redis_opts);

  var features_key = ":features";

  store.get = function(key, cb) {
    var flag = cache.get(key);

    if (flag) {
      if (flag.deleted) {
        cb(null);
      } else {
        cb(flag);
      }
    } else {
      client.hget(features_key, key, function(err, obj) {
        if (err) {
          config.logger.error("Error fetching flag from redis", err)
          cb(null);
        } else {
          flag = JSON.parse(obj);
          cb(flag.deleted ? null : flag);
        }
      });
    }
  }

  store.all = function(cb) {
    client.hgetall(features_key, function(err, obj) {
      if (err) {
        config.logger.error("Error fetching flag from redis", err)
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

  // TODO
  store.init = function(flags, cb) {

  }

  // TODO
  store.delete = function(key, version, cb) {

  }

  // TODO
  store.upsert = function(key, flag, cb) {

  }

  // TODO
  store.initialized = function(cb) {
    
  }

}

module.exports = RedisFeatureStore