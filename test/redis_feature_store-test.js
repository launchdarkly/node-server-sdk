var RedisFeatureStore = require('../redis_feature_store');
var testBase = require('./feature_store_test_base');
var dataKind = require('../versioned_data_kind');
var redis = require('redis');


const shouldSkip = (process.env.LD_SKIP_DATABASE_TESTS === '1');

(shouldSkip ? describe.skip : describe)('RedisFeatureStore', function() {
  var redisOpts = { url: 'redis://localhost:6379' };

  var extraRedisClient = redis.createClient(redisOpts);

  function makeCachedStore() {
    return new RedisFeatureStore(redisOpts, 30);
  }

  function makeUncachedStore() {
    return new RedisFeatureStore(redisOpts, 0);
  }

  function makeStoreWithPrefix(prefix) {
    return new RedisFeatureStore(redisOpts, 0, prefix);
  }

  function clearExistingData(callback) {
    extraRedisClient.flushdb(callback);
  }

  testBase.baseFeatureStoreTests(makeCachedStore, clearExistingData, true);
  testBase.baseFeatureStoreTests(makeUncachedStore, clearExistingData, false, makeStoreWithPrefix);

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
