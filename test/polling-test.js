const InMemoryFeatureStore = require('../feature_store');
const PollingProcessor = require('../polling');
const dataKind = require('../versioned_data_kind');
const { asyncify, asyncifyNode, sleepAsync } = require('./async_utils');

describe('PollingProcessor', () => {
  const longInterval = 100000;
  const allData = { flags: { flag: { version: 1 } }, segments: { segment: { version: 1 } } };
  const jsonData = JSON.stringify(allData);

  let store;
  let config;
  let processor;

  beforeEach(() => {
    store = InMemoryFeatureStore();
    config = { featureStore: store, pollInterval: longInterval, logger: fakeLogger() };
  });

  afterEach(() => {
    processor && processor.stop();
  });

  function fakeLogger() {
    return {
      debug: jest.fn(),
      error: jest.fn()
    };
  }

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

    await asyncifyNode(cb => processor.start(cb)); // didn't throw -> success
  });

  it('calls callback with error on failure', async () => {
    const err = new Error('sorry');
    const requestor = {
      requestAllData: cb => cb(err)
    };
    processor = PollingProcessor(config, requestor);

    await expect(asyncifyNode(cb => processor.start(cb))).rejects.toThrow(/sorry.*will retry/);
  });

  it('initializes feature store', async () => {
    const requestor = {
      requestAllData: cb => cb(null, jsonData)
    };
    processor = PollingProcessor(config, requestor);

    await asyncifyNode(cb => processor.start(cb));

    const flags = await asyncify(cb => store.all(dataKind.features, cb));
    expect(flags).toEqual(allData.flags);
    const segments = await asyncify(cb => store.all(dataKind.segments, cb));
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

  function testRecoverableHttpError(status) {
    it('continues polling after error ' + status, async () => {
      const err = new Error('sorry');
      err.status = status;
      const requestor = {
        requestAllData: jest.fn(cb => cb(err))
      };
      config.pollInterval = 0.1;
      processor = PollingProcessor(config, requestor);

      processor.start(() => {});
      await sleepAsync(300);

      expect(requestor.requestAllData.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(config.logger.error).not.toHaveBeenCalled();
    });
  }

  testRecoverableHttpError(400);
  testRecoverableHttpError(408);
  testRecoverableHttpError(429);
  testRecoverableHttpError(500);
  testRecoverableHttpError(503);

  function testUnrecoverableHttpError(status) {
    it('stops polling after error ' + status, async () => {
      const err = new Error('sorry');
      err.status = status;
      const requestor = {
        requestAllData: jest.fn(cb => cb(err))
      };
      config.pollInterval = 0.1;
      processor = PollingProcessor(config, requestor);

      processor.start(() => {});
      await sleepAsync(300);

      expect(requestor.requestAllData.mock.calls.length).toEqual(1);
      expect(config.logger.error).toHaveBeenCalledTimes(1);
    });
  }

  testUnrecoverableHttpError(401);
  testUnrecoverableHttpError(403);
});
