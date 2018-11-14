var InMemoryFeatureStore = require('../feature_store');
var testBase = require('./feature_store_test_base');

describe('InMemoryFeatureStore', function() {
  testBase.baseFeatureStoreTests(function() {
    return new InMemoryFeatureStore();
  })
});
