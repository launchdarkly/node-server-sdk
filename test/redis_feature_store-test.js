var RedisFeatureStore = require('../redis_feature_store');
var allFeatureStoreTests = require('./feature_store_test_base');

describe('RedisFeatureStore', function() {
  allFeatureStoreTests(function() {
    redisOpts = { url: 'redis://localhost:6379' };
    return new RedisFeatureStore(redisOpts, 30000);
  })
});
