var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');

function stubEventProcessor() {
  var eventProcessor = {
    events: [],
    sendEvent: function(event) {
      eventProcessor.events.push(event);
    },
    flush: function(callback) {
      if (callback) {
        setImmediate(callback);
      } else {
        return Promise.resolve(null);
      }
    },
    close: function() {}
  };
  return eventProcessor;
}

function stubLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

function stubUpdateProcessor() {
  var updateProcessor = {
    start: function(callback) {
      if (updateProcessor.shouldInitialize) {
        setImmediate(callback, updateProcessor.error);
      }
    },
    shouldInitialize: true
  };
  return updateProcessor;
}

function createClient(overrideOptions, flagsMap) {
  var store = InMemoryFeatureStore();
  if (flagsMap !== undefined) {
    var allData = {};
    allData[dataKind.features.namespace] = flagsMap;
    store.init(allData);
  }
  var defaults = {
    featureStore: store,
    eventProcessor: stubEventProcessor(),
    updateProcessor: stubUpdateProcessor(),
    logger: stubLogger()
  };
  return LDClient.init('secret', Object.assign({}, defaults, overrideOptions));
}

module.exports = {
  createClient: createClient,
  stubEventProcessor: stubEventProcessor,
  stubLogger: stubLogger,
  stubUpdateProcessor: stubUpdateProcessor
};
