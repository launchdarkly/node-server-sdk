const InMemoryFeatureStore = require('../feature_store');
const LDClient = require('../index.js');
const dataKind = require('../versioned_data_kind');
const testBase = require('./feature_store_test_base');
const stubs = require('./stubs');
const { promisifySingle, withCloseable } = require('launchdarkly-js-test-helpers');

describe('InMemoryFeatureStore', () => {
  testBase.baseFeatureStoreTests(() => {
    return new InMemoryFeatureStore();
  });
});

describe('custom feature store', () => {
  const defaultUser = { key: 'user' };

  async function makeStoreWithFlag() {
    const store = new InMemoryFeatureStore();
    const flag = { key: 'flagkey', on: false, offVariation: 0, variations: [ true ] };
    const data = {};
    data[dataKind.features.namespace] = { 'flagkey': flag };
    await promisifySingle(store.init)(data);
    return store;
  }

  it('can be specified as an instance', async () => {
    const store = await makeStoreWithFlag();
    const config = { featureStore: store };
    const client = stubs.createClient(config);
    await client.waitForInitialization();
    const result = await client.variation('flagkey', defaultUser, false);
    expect(result).toEqual(true);
  });

  it('can be specified as a factory function', async () => {
    const store = await makeStoreWithFlag();
    const config = { featureStore: () => store };
    const client = stubs.createClient(config);
    await client.waitForInitialization();
    const result = await client.variation('flagkey', defaultUser, false);
    expect(result).toEqual(true);
  });
})