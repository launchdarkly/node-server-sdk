const InMemoryFeatureStore = require('../feature_store');
const testBase = require('./feature_store_test_base');

describe('InMemoryFeatureStore', () => {
  testBase.baseFeatureStoreTests(() => {
    return new InMemoryFeatureStore();
  });
});
