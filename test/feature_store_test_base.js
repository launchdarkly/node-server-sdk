
function allFeatureStoreTests(makeStore) {
  var feature1 = {
    key: 'foo',
    version: 10
  };
  var feature2 = {
    key: 'bar',
    version: 10
  };

  function initedStore(cb) {
    var store = makeStore();
    var initData = {
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

  it('gets existing feature', function(done) {
    initedStore(function(store) {
      store.get(feature1.key, function(result) {
        expect(result).toEqual(feature1);
        done();
      });
    });
  });

  it('does not get nonexisting feature', function(done) {
    initedStore(function(store) {
      store.get('biz', function(result) {
        expect(result).toBe(null);
        done();
      });
    });
  });

  it('gets all features', function(done) {
    initedStore(function(store) {
      store.all(function(result) {
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
      store.upsert(feature1.key, newVer, function(result) {
        store.get(feature1.key, function(result) {
          expect(result).toEqual(newVer);
          done();
        });
      });
    });
  });

  it('does not upsert with older version', function(done) {
    var oldVer = { key: feature1.key, version: feature1.version - 1 };
    initedStore(function(store) {
      store.upsert(feature1.key, oldVer, function(result) {
        store.get(feature1.key, function(result) {
          expect(result).toEqual(feature1);
          done();
        });
      });
    });
  });

  it('upserts new feature', function(done) {
    var newFeature = { key: 'biz', version: 99 };
    initedStore(function(store) {
      store.upsert(newFeature.key, newFeature, function(result) {
        store.get(newFeature.key, function(result) {
          expect(result).toEqual(newFeature);
          done();
        });
      });
    });
  });

  it('deletes with newer version', function(done) {
    initedStore(function(store) {
      store.delete(feature1.key, feature1.version + 1, function(result) {
        store.get(feature1.key, function(result) {
          expect(result).toBe(null);
          done();
        });
      });
    });
  });

  it('does not delete with older version', function(done) {
    initedStore(function(store) {
      store.delete(feature1.key, feature1.version - 1, function(result) {
        store.get(feature1.key, function(result) {
          expect(result).not.toBe(null);
          done();
        });
      });
    });
  });

  it('allows deleting unknown feature', function(done) {
    initedStore(function(store) {
      store.delete('biz', 99, function(result) {
        store.get('biz', function(result) {
          expect(result).toBe(null);
          done();
        });
      });
    });
  });

  it('does not upsert older version after delete', function(done) {
    initedStore(function(store) {
      store.delete(feature1.key, feature1.version + 1, function(result) {
        store.upsert(feature1.key, feature1, function(result) {
          store.get(feature1.key, function(result) {
            expect(result).toBe(null);
            done();
          });
        });
      });
    });
  });
}

module.exports = allFeatureStoreTests;
