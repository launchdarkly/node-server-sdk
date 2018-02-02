var InMemoryFeatureStore = require('../feature_store');
var allFeatureStoreTests = require('./feature_store_test_base');

describe('InMemoryFeatureStore', function() {
  allFeatureStoreTests(function() {
    return new InMemoryFeatureStore();
  })
});
