var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');

describe('LDClient', function() {
  it('should trigger the ready event in offline mode', function() {
    var client = LDClient.init('sdk_key', {offline: true});
    var callback = jest.fn();
    client.on('ready', callback);
    process.nextTick(function() {
      expect(callback).toHaveBeenCalled();
    });
  });

  it('should correctly compute the secure mode hash for a known message and secret', function() {
    var client = LDClient.init('secret', {offline: true});
    var hash = client.secure_mode_hash({"key": "Message"});
    expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
  });

  it('should not overflow the call stack when evaluating a huge number of flags', function(done) {
    var flagCount = 5000;
    var dummyUri = 'bad';
    var flags = {};
    var store = InMemoryFeatureStore();
    var allData = {};
    for (var i = 0; i < flagCount; i++) {
      var key = 'feature' + i;
      var flag = {
        key: key,
        version: 1,
        on: false
      };
      flags[key] = flag;
    }
    allData[dataKind.features.namespace] = flags;
    store.init(allData);
    var client = LDClient.init('secret', {
      base_uri: dummyUri,
      stream_uri: dummyUri,
      events_uri: dummyUri,
      feature_store: store
    });
    // Deliberately not waiting for ready event; the update processor is irrelevant for this test
    client.all_flags({key: 'user'}, function(err, result) {
      expect(err).toEqual(null);
      expect(Object.keys(result).length).toEqual(flagCount);
      done();
    });
  });
});
