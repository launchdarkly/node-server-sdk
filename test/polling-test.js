const InMemoryFeatureStore = require('../feature_store');
const PollingProcessor = require('../polling');
const dataKind = require('../versioned_data_kind');
const { promisify, promisifySingle, sleepAsync } = require('launchdarkly-js-test-helpers');
const stubs = require('./stubs');

describe('PollingProcessor', () => {
  const longInterval = 100000;
  const allData = { flags: { flag: { version: 1 } }, segments: { segment: { version: 1 } } };
  const jsonData = JSON.stringify(allData);

  let store;
  let config;
  let processor;

  beforeEach(() => {
    store = InMemoryFeatureStore();
    config = { featureStore: store, pollInterval: longInterval, logger: stubs.stubLogger() };
  });

  afterEach(() => {
    processor && processor.stop();
  });

  it('makes no request before start', () => {
    const requestor = {
      requestAllData: jest.fn()
    };
    processor = PollingProcessor(config, requestor);

    expect(requestor.requestAllData).not.toHaveBeenCalled();
  });

  it('polls immediately on start', () => {
    const requestor = {
      requestAllData: jest.fn()
    };
    processor = PollingProcessor(config, requestor);

    processor.start(() => {});

    expect(requestor.requestAllData).toHaveBeenCalledTimes(1);
  });

  it('calls callback on success', async () => {
    const requestor = {
      requestAllData: cb => cb(null, jsonData)
    };
    processor = PollingProcessor(config, requestor);

    await promisify(processor.start)(); // didn't throw -> success
  });

  it('initializes feature store', async () => {
    const requestor = {
      requestAllData: cb => cb(null, jsonData)
    };
    processor = PollingProcessor(config, requestor);

    await promisify(processor.start)();

    const flags = await promisifySingle(store.all)(dataKind.features);
    expect(flags).toEqual(allData.flags);
    const segments = await promisifySingle(store.all)(dataKind.segments);
    expect(segments).toEqual(allData.segments);
  });

  it('polls repeatedly', async() => {
    const requestor = {
      requestAllData: jest.fn(cb => cb(null, jsonData))
    };
    config.pollInterval = 0.1;  // note, pollInterval is in seconds
    processor = PollingProcessor(config, requestor);

    processor.start(() => {});
    await sleepAsync(500);

    expect(requestor.requestAllData.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  async function testRecoverableError(err) {
    const requestor = {
      requestAllData: jest.fn(cb => cb(err))
    };
    config.pollInterval = 0.1;
    processor = PollingProcessor(config, requestor);

    let errReceived;
    processor.start(e => { errReceived = e; });
    await sleepAsync(300);

    expect(requestor.requestAllData.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(config.logger.error).not.toHaveBeenCalled();
    expect(errReceived).toBeUndefined();
  }
  
  function testRecoverableHttpError(status) {
    const err = new Error('sorry');
    err.status = status;
    it('continues polling after error ' + status, async () => await testRecoverableError(err));
  }

  testRecoverableHttpError(400);
  testRecoverableHttpError(408);
  testRecoverableHttpError(429);
  testRecoverableHttpError(500);
  testRecoverableHttpError(503);

  it('continues polling after I/O error', async () => await testRecoverableError(new Error('sorry')));

  function testUnrecoverableHttpError(status) {
    it('stops polling after error ' + status, async () => {
      const err = new Error('sorry');
      err.status = status;
      const requestor = {
        requestAllData: jest.fn(cb => cb(err))
      };
      config.pollInterval = 0.1;
      processor = PollingProcessor(config, requestor);

      let errReceived;
      processor.start(e => { errReceived = e; });
      await sleepAsync(300);

      expect(requestor.requestAllData.mock.calls.length).toEqual(1);
      expect(config.logger.error).toHaveBeenCalledTimes(1);
      expect(errReceived).not.toBeUndefined();
    });
  }

  testUnrecoverableHttpError(401);
  testUnrecoverableHttpError(403);
});
