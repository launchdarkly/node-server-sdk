const RedisFeatureStore = require('../redis_feature_store');
const testBase = require('./feature_store_test_base');
const { stubLogger } = require('./stubs');
const redis = require('redis');


const shouldSkip = (process.env.LD_SKIP_DATABASE_TESTS === '1');

(shouldSkip ? describe.skip : describe)('RedisFeatureStore', () => {
  const redisOpts = { url: 'redis://localhost:6379' };

  const extraRedisClient = redis.createClient(redisOpts);

  function makeCachedStore() {
    return new RedisFeatureStore(redisOpts, 30, null, stubLogger());
  }

  function makeUncachedStore() {
    return new RedisFeatureStore(redisOpts, 0, null, stubLogger());
  }

  function makeStoreWithPrefix(prefix) {
    return new RedisFeatureStore(redisOpts, 0, prefix, stubLogger());
  }

  function clearExistingData(callback) {
    extraRedisClient.flushdb(callback);
  }

  testBase.baseFeatureStoreTests(makeCachedStore, clearExistingData, true);
  testBase.baseFeatureStoreTests(makeUncachedStore, clearExistingData, false, makeStoreWithPrefix);

  testBase.concurrentModificationTests(makeUncachedStore,
    hook => {
      const store = makeCachedStore();
      store.underlyingStore.testUpdateHook = hook;
      return store;
    });

  afterAll(() => {
    extraRedisClient.quit();
  });
});
