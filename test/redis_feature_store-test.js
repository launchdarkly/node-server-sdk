var RedisFeatureStore = require('../redis_feature_store');
var allFeatureStoreTests = require('./feature_store_test_base');
var dataKind = require('../versioned_data_kind');
var redis = require('redis');

describe('RedisFeatureStore', function() {
  var redisOpts = { url: 'redis://localhost:6379' };

  function makeStore() {
    return new RedisFeatureStore(redisOpts, 30000);    
  }

  allFeatureStoreTests(makeStore);

  it('handles upsert race condition against external client correctly', function(done) {
    var store = makeStore();
    var otherClient = redis.createClient(redisOpts);

    var feature1 = {
      key: 'foo',
      version: 1
    };
    var intermediateVer = { key: feature1.key, version: feature1.version };
    var finalVer = { key: feature1.key, version: 10 };
    
    var initData = {};
    initData[dataKind.features.namespace] = {
      'foo': feature1
    };
    
    store.init(initData, function() {
      var tries = 0;
      // This function will be called in between the WATCH and the update transaction.
      // We're testing that the store will detect this concurrent modification and will
      // transparently retry the update.
      store.test_transaction_hook = function(cb) {
        if (tries < 3) {
          tries++;
          intermediateVer.version++;
          otherClient.hset("launchdarkly:features", "foo", JSON.stringify(intermediateVer), cb);
        } else {
          cb();
        }
      };
      // Deliberately do not wait for the first action (ver3) to complete before starting the
      // second (ver2), so the WATCH on the first will be triggered by the concurrent modification.
      // The result should be that the ver3 update is transparently retried and succeeds.
      store.upsert(dataKind.features, finalVer, function() {
        store.get(dataKind.features, feature1.key, function(result) {
          otherClient.quit();
          expect(result).toEqual(finalVer);
          done();
        });
      });      
    });
  });
});
