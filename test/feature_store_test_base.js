var dataKind = require('../versioned_data_kind');

// The following tests should be run on every feature store implementation. If this type of
// store supports caching, the tests should be run once with caching enabled and once with
// caching disabled.
//
// Parameters:
// - makeStore(): creates an instance of the feature store.
// - clearExistingData(callback): if specified, will be called before each test to clear any
// storage that the store instances may be sharing.
// - isCached: true if the instances returned by makeStore() have caching enabled. If
// applicable, 

function baseFeatureStoreTests(makeStore, clearExistingData, isCached) {
  var feature1 = {
    key: 'foo',
    version: 10
  };
  var feature2 = {
    key: 'bar',
    version: 10
  };

  beforeEach(function(done) {
    if (clearExistingData) {
      clearExistingData(done);
    } else {
      done();
    }
  });

  function initedStore(cb) {
    var store = makeStore();
    var initData = {};
    initData[dataKind.features.namespace] = {
      'foo': feature1,
      'bar': feature2
    };
    store.init(initData, function() {
      cb(store);
    });
  }

  it('is initialized after calling init()', function(done) {
    initedStore(function(store) {
      store.initialized(function(result) {
        expect(result).toBe(true);
        done();
      });
    });
  });

  it('init() completely replaces previous data', function(done) {
    var store = makeStore();
    var flags = {
      first: { key: 'first', version: 1 },
      second: { key: 'second', version: 1 }
    };
    var segments = { first: { key: 'first', version: 2 } };
    var initData = {};
    initData[dataKind.features.namespace] = flags;
    initData[dataKind.segments.namespace] = segments;

    store.init(initData, function() {
      store.all(dataKind.features, function(items) {
        expect(items).toEqual(flags);
        store.all(dataKind.segments, function(items) {
          expect(items).toEqual(segments);

          var newFlags = { first: { key: 'first', version: 3 } };
          var newSegments = { first: { key: 'first', version: 4 } };
          var initData = {};
          initData[dataKind.features.namespace] = newFlags;
          initData[dataKind.segments.namespace] = newSegments;

          store.init(initData, function() {
            store.all(dataKind.features, function(items) {
              expect(items).toEqual(newFlags);
              store.all(dataKind.segments, function(items) {
                expect(items).toEqual(newSegments);

                done();
              })
            })
          });
        });
      });
    });
  });

  if (!isCached && clearExistingData) {
    function testInitStateDetection(desc, initData) {
      it(desc, function(done) {
        var store1 = makeStore();
        var store2 = makeStore();

        store1.initialized(function(result) {
          expect(result).toBe(false);

          store2.init(initData, function() {
            store1.initialized(function(result) {
              expect(result).toBe(true);
              done();
            });
          });
        });
      });
    }

    testInitStateDetection('can detect if another instance has initialized the store',
      { features: { foo: feature1 } });

    testInitStateDetection('can detect if another instance has initialized the store, even with empty data',
      { features: {} });
  }

  it('gets existing feature', function(done) {
    initedStore(function(store) {
      store.get(dataKind.features, feature1.key, function(result) {
        expect(result).toEqual(feature1);
        done();
      });
    });
  });

  it('does not get nonexisting feature', function(done) {
    initedStore(function(store) {
      store.get(dataKind.features, 'biz', function(result) {
        expect(result).toBe(null);
        done();
      });
    });
  });

  it('gets all features', function(done) {
    initedStore(function(store) {
      store.all(dataKind.features, function(result) {
        expect(result).toEqual({
          'foo': feature1,
          'bar': feature2
        });
        done();
      });
    });
  });

  it('upserts with newer version', function(done) {
    var newVer = { key: feature1.key, version: feature1.version + 1 };
    initedStore(function(store) {
      store.upsert(dataKind.features, newVer, function(result) {
        store.get(dataKind.features, feature1.key, function(result) {
          expect(result).toEqual(newVer);
          done();
        });
      });
    });
  });

  it('does not upsert with older version', function(done) {
    var oldVer = { key: feature1.key, version: feature1.version - 1 };
    initedStore(function(store) {
      store.upsert(dataKind.features, oldVer, function(result) {
        store.get(dataKind.features, feature1.key, function(result) {
          expect(result).toEqual(feature1);
          done();
        });
      });
    });
  });

  it('upserts new feature', function(done) {
    var newFeature = { key: 'biz', version: 99 };
    initedStore(function(store) {
      store.upsert(dataKind.features, newFeature, function(result) {
        store.get(dataKind.features, newFeature.key, function(result) {
          expect(result).toEqual(newFeature);
          done();
        });
      });
    });
  });

  it('handles upsert race condition within same client correctly', function(done) {
    var ver1 = { key: feature1.key, version: feature1.version + 1 };
    var ver2 = { key: feature1.key, version: feature1.version + 2 };
    initedStore(function(store) {
      var counter = 0;
      var combinedCallback = function() {
        counter++;
        if (counter == 2) {
          store.get(dataKind.features, feature1.key, function(result) {
            expect(result).toEqual(ver2);
            done();
          });
        }
      };
      // Deliberately do not wait for the first upsert to complete before starting the second,
      // so their transactions will be interleaved unless we're correctly serializing updates
      store.upsert(dataKind.features, ver2, combinedCallback);
      store.upsert(dataKind.features, ver1, combinedCallback);
    });
  });

  it('deletes with newer version', function(done) {
    initedStore(function(store) {
      store.delete(dataKind.features, feature1.key, feature1.version + 1, function(result) {
        store.get(dataKind.features, feature1.key, function(result) {
          expect(result).toBe(null);
          done();
        });
      });
    });
  });

  it('does not delete with older version', function(done) {
    initedStore(function(store) {
      store.delete(dataKind.features, feature1.key, feature1.version - 1, function(result) {
        store.get(dataKind.features, feature1.key, function(result) {
          expect(result).not.toBe(null);
          done();
        });
      });
    });
  });

  it('allows deleting unknown feature', function(done) {
    initedStore(function(store) {
      store.delete(dataKind.features, 'biz', 99, function(result) {
        store.get(dataKind.features, 'biz', function(result) {
          expect(result).toBe(null);
          done();
        });
      });
    });
  });

  it('does not upsert older version after delete', function(done) {
    initedStore(function(store) {
      store.delete(dataKind.features, feature1.key, feature1.version + 1, function(result) {
        store.upsert(dataKind.features, feature1, function(result) {
          store.get(dataKind.features, feature1.key, function(result) {
            expect(result).toBe(null);
            done();
          });
        });
      });
    });
  });
}

// The following tests require that the feature store can be instrumented in such a way as to run
// some test code in the middle of an upsert operation.
//
// Parameters:
// - makeStore(): creates a normal feature store.
// - makeStoreWithHook(hook): creates a feature store that operates on the same underlying data as
// the first store. This store will call the hook function (passing a callback) immediately before
// it attempts to make any update.

function concurrentModificationTests(makeStore, makeStoreWithHook) {

  var flagKey = 'flag';
  var initialVersion = 1;

  var competingStore = makeStore();

  function makeFlagWithVersion(v) {
    return { key: flagKey, version: v };
  }

  function withInitedStore(store, cb) {
    var allData = { features: {} };
    allData['features'][flagKey] = makeFlagWithVersion(initialVersion);
    store.init(allData, cb);
  }

  function writeCompetingVersions(flagVersionsToWrite) {
    var i = 0;
    return function(callback) {
      if (i < flagVersionsToWrite.length) {
        var newFlag = makeFlagWithVersion(flagVersionsToWrite[i]);
        i++;
        competingStore.upsert(dataKind.features, newFlag, callback);
      } else {
        callback();
      }
    };
  }

  it('handles upsert race condition against other client with lower version', function(done) {
    var myDesiredVersion = 10;
    var competingStoreVersions = [ 2, 3, 4 ]; // proves that we can retry multiple times if necessary

    var myStore = makeStoreWithHook(writeCompetingVersions(competingStoreVersions));

    withInitedStore(myStore, function() {
      myStore.upsert(dataKind.features, makeFlagWithVersion(myDesiredVersion), function() {
        myStore.get(dataKind.features, flagKey, function(result) {
          expect(result.version).toEqual(myDesiredVersion);
          done();
        });
      });
    });
  });

  it('handles upsert race condition against other client with higher version', function(done) {
    var myDesiredVersion = 2;
    var competingStoreVersion = 3;

    var myStore = makeStoreWithHook(writeCompetingVersions([ competingStoreVersion ]));

    withInitedStore(myStore, function() {
      myStore.upsert(dataKind.features, makeFlagWithVersion(myDesiredVersion), function() {
        myStore.get(dataKind.features, flagKey, function(result) {
          expect(result.version).toEqual(competingStoreVersion);
          done();
        });
      });
    });
  });
}

module.exports = {
  baseFeatureStoreTests: baseFeatureStoreTests,
  concurrentModificationTests: concurrentModificationTests
};

