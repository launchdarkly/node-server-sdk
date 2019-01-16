var RedisFeatureStore = require('../redis_feature_store');
var testBase = require('./feature_store_test_base');
var dataKind = require('../versioned_data_kind');
var redis = require('redis');

describe('RedisFeatureStore', function() {
  var redisOpts = { url: 'redis://localhost:6379' };

  var extraRedisClient = redis.createClient(redisOpts);

  function makeCachedStore(options) {
    return new RedisFeatureStore(redisOpts, 30, options && options.prefix);    
  }

  function makeUncachedStore(options) {
    return new RedisFeatureStore(redisOpts, 0, options && options.prefix);
  }

  function clearExistingData(callback) {
    extraRedisClient.flushdb(callback);
  }

  testBase.baseFeatureStoreTests(makeCachedStore, clearExistingData, true);
  testBase.baseFeatureStoreTests(makeUncachedStore, clearExistingData, false);

  testBase.concurrentModificationTests(makeUncachedStore,
    function(hook) {
      var store = makeCachedStore();
      store.underlyingStore.testUpdateHook = hook;
      return store;
    });

  afterAll(function() {
    extraRedisClient.quit();
  });
});
