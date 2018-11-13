var CachingStoreWrapper = require('../caching_store_wrapper');
var features = require('../versioned_data_kind').features;

function MockCore() {
  const c = {
    data: { features: {} },
    inited: false,
    initQueriedCount: 0,

    initInternal: function(newData, cb) { 
      c.data = newData;
      cb();
    },

    getInternal: function(kind, key, cb)  {
      cb(c.data[kind.namespace][key]);
    },

    getAllInternal: function(kind, cb) {
      cb(c.data[kind.namespace]);
    },

    upsertInternal: function(kind, item, cb) {
      const oldItem = c.data[kind.namespace][item.key];
      if (oldItem && oldItem.version >= item.version) {
        cb(null, oldItem);
      } else {
        c.data[kind.namespace][item.key] = item;
        cb(null, item);
      }
    },

    initializedInternal: function(cb) {
      c.initQueriedCount++;
      cb(c.inited);
    },

    forceSet: function(kind, item) {
      c.data[kind.namespace][item.key] =  item;
    },

    forceRemove: function(kind, key) {
      delete c.data[kind.namespace][key];
    }
  };
  return c;
}

const cacheSeconds = 15;

function runCachedAndUncachedTests(name, testFn) {
  describe(name, function() {
    const core1 = MockCore();
    const wrapper1 = new CachingStoreWrapper(core1, cacheSeconds);
    it('cached', function(done) { testFn(done, wrapper1, core1, true); });

    const core2 = MockCore();
    const wrapper2 = new CachingStoreWrapper(core2, 0);
    it('uncached', function(done) { testFn(done, wrapper2, core2, false); });
  });
}

function runCachedTestOnly(name, testFn) { 
  it(name, function(done) {
    const core = MockCore();
    const wrapper = new CachingStoreWrapper(core, cacheSeconds);
    testFn(done, wrapper, core);
  });
}

describe('CachingStoreWrapper', function() {

  runCachedAndUncachedTests('get()', function(done, wrapper, core, isCached) {
    const flagv1 = { key: 'flag', version: 1 };
    const flagv2 = { key: 'flag', version: 2 };

    core.forceSet(features, flagv1);

    wrapper.get(features, flagv1.key, function(item) {
      expect(item).toEqual(flagv1);

      core.forceSet(features, flagv2); // Make a change that bypasses the cache

      wrapper.get(features, flagv1.key, function(item) {
        // If cached, it should return the cached value rather than calling the underlying getter
        expect(item).toEqual(isCached ? flagv1 : flagv2);

        done();
      });
    });
  });

  runCachedAndUncachedTests('get() with deleted item', function(done, wrapper, core, isCached) {
    const flagv1 = { key: 'flag', version: 1, deleted: true };
    const flagv2 = { key: 'flag', version: 2, deleted: false };

    core.forceSet(features, flagv1);

    wrapper.get(features, flagv1.key, function(item) {
      expect(item).toBe(null);

      core.forceSet(features, flagv2); // Make a change that bypasses the cache

      wrapper.get(features, flagv2.key, function(item) {
        // If cached, the deleted state should persist in the cache
        expect(item).toEqual(isCached ? null : flagv2);

        done();
      });
    });
  });

  runCachedAndUncachedTests('get() with missing item', function(done, wrapper, core, isCached) {
    const flag = { key: 'flag', version: 1 };

    wrapper.get(features, flag.key, function(item) {
      expect(item).toBe(null);

      core.forceSet(features, flag);

      wrapper.get(features, flag.key, function(item) {
        // If cached, the previous null result should persist in the cache
        expect(item).toEqual(isCached ? null  : flag);

        done();
      });
    });
  });

  runCachedTestOnly('cached get() uses values from init()', function(done, wrapper, core) {
    const flagv1 = { key: 'flag', version: 1 };
    const flagv2 = { key: 'flag', version: 2 };

    const allData = { features: { 'flag': flagv1 } };

    wrapper.init(allData, function() {
      expect(core.data).toEqual(allData);

      core.forceSet(features, flagv2);

      wrapper.get(features, flagv1.key, function(item) {
        expect(item).toEqual(flagv1);

        done();
      });
    });
  });

  runCachedAndUncachedTests('all()', function(done, wrapper, core, isCached) {
    const flag1 = { key: 'flag1', version: 1 };
    const flag2 = { key: 'flag2', version: 1 };

    core.forceSet(features, flag1);
    core.forceSet(features, flag2);

    wrapper.all(features, function(items) {
      expect(items).toEqual({ 'flag1': flag1, 'flag2': flag2 });

      core.forceRemove(features, flag2.key);

      wrapper.all(features, function(items) {
        if (isCached) {
          expect(items).toEqual({ 'flag1': flag1, 'flag2': flag2 });
        } else {
          expect(items).toEqual({ 'flag1': flag1 });
        }

        done();
      });
    });
  });

  runCachedAndUncachedTests('all() with deleted item', function(done, wrapper, core, isCached) {
    const flag1 = { key: 'flag1', version: 1 };
    const flag2 = { key: 'flag2', version: 1, deleted: true };

    core.forceSet(features, flag1);
    core.forceSet(features, flag2);

    wrapper.all(features, function(items) {
      expect(items).toEqual({ 'flag1': flag1 });

      core.forceRemove(features, flag1.key);

      wrapper.all(features, function(items) {
        if (isCached) {
          expect(items).toEqual({ 'flag1': flag1 });
        } else {
          expect(items).toEqual({ });
        }

        done();
      });
    });
  });

  runCachedTestOnly('cached all() uses values from init()', function(done, wrapper, core) {
    const flag1 = { key: 'flag1', version: 1 };
    const flag2 = { key: 'flag2', version: 1 };

    const allData = { features: { flag1: flag1, flag2: flag2 } };

    wrapper.init(allData, function() {
      core.forceRemove(features, flag2.key);

      wrapper.all(features, function(items) {
        expect(items).toEqual({ flag1: flag1, flag2: flag2 });

        done();
      });
    });
  });

  runCachedTestOnly('cached all() uses fresh values if there has been an update', function(done, wrapper, core) {
    const flag1v1 = { key: 'flag1', version: 1 };
    const flag1v2 = { key: 'flag1', version: 2 };
    const flag2v1 = { key: 'flag2', version: 1 };
    const flag2v2 = { key: 'flag2', version: 2 };

    const allData = { features: { flag1: flag1v1, flag2: flag2v2 } };

    wrapper.init(allData, function() {
      expect(core.data).toEqual(allData);

      // make a change to flag1 using the wrapper - this should flush the cache
      wrapper.upsert(features, flag1v2, function() {
        // make a change to flag2 that bypasses the cache
        core.forceSet(features, flag2v2);

        // we should now see both changes since the cache was flushed
        wrapper.all(features, function(items) { 
          expect(items).toEqual({ flag1: flag1v2, flag2: flag2v2 });

          done();
        });
      });
    });
  });

  runCachedAndUncachedTests('upsert() - successful', function(done, wrapper, core, isCached) {
    const flagv1 = { key: 'flag', version: 1 };
    const flagv2 = { key: 'flag', version: 2 };

    wrapper.upsert(features, flagv1, function() {
      expect(core.data[features.namespace][flagv1.key]).toEqual(flagv1);

      wrapper.upsert(features, flagv2, function() {
        expect(core.data[features.namespace][flagv1.key]).toEqual(flagv2);

        // if we have a cache, verify that the new item is now cached by writing a different value
        // to the underlying data - get() should still return the cached item
        if (isCached) {
          const flagv3 = { key: 'flag', version: 3 };
          core.forceSet(features, flagv3);
        }

        wrapper.get(features, flagv1.key, function(item) {
          expect(item).toEqual(flagv2);

          done();
        });
      });
    });
  });

  runCachedTestOnly('cached upsert() - unsuccessful', function(done, wrapper, core) {
    const flagv1 = { key: 'flag', version: 1 };
    const flagv2 = { key: 'flag', version: 2 };

    core.forceSet(features, flagv2); // this is now in the underlying data, but not in the cache

    wrapper.upsert(features, flagv1, function() {
      expect(core.data[features.namespace][flagv1.key]).toEqual(flagv2); // value in store remains the same

      // the cache should now contain flagv2 - check this by making another change that bypasses
      // the cache, and verifying that get() uses the cached value instead
      const flagv3 = { key: 'flag', version: 3 };
      core.forceSet(features, flagv3);

      wrapper.get(features, flagv1.key, function(item)  {
        expect(item).toEqual(flagv2);

        done();
      });
    });
  });

  runCachedAndUncachedTests('delete()', function(done, wrapper, core, isCached) {
    const flagv1 = { key: 'flag', version: 1 };
    const flagv2 = { key: 'flag', version: 2, deleted: true };
    const flagv3 = { key: 'flag', version: 3 };

    core.forceSet(features, flagv1);

    wrapper.get(features, flagv1.key, function(item) {
      expect(item).toEqual(flagv1);

      wrapper.delete(features, flagv1.key, flagv2.version);

      expect(core.data[features.namespace][flagv1.key]).toEqual(flagv2);

      // make a change to the flag that bypasses the cache
      core.forceSet(features, flagv3);

      wrapper.get(features, flagv1.key, function(item) {
        expect(item).toEqual(isCached ? null : flagv3);

        done();
      });
    });
  });

  describe('initialized()', function() {
    it('calls underlying initialized() only if not already inited', function(done) {
      const core = MockCore();
      const wrapper = new CachingStoreWrapper(core, 0);

      wrapper.initialized(function(value) {
        expect(value).toEqual(false);
        expect(core.initQueriedCount).toEqual(1);

        core.inited = true;

        wrapper.initialized(function(value) {
          expect(value).toEqual(true);
          expect(core.initQueriedCount).toEqual(2);

          core.inited = false; // this should have no effect since we already returned true

          wrapper.initialized(function(value) {
            expect(value).toEqual(true);
            expect(core.initQueriedCount).toEqual(2);

            done();
          });
        });
      });
    });

    it('will not call initialized() if init() has been called', function(done) {
      const core = MockCore();
      const wrapper = new CachingStoreWrapper(core, 0);

      wrapper.initialized(function(value) {
        expect(value).toEqual(false);
        expect(core.initQueriedCount).toEqual(1);

        const allData = { features: {} };
        wrapper.init(allData, function() {
          wrapper.initialized(function(value) {
            expect(value).toEqual(true);
            expect(core.initQueriedCount).toEqual(1);

            done();
          });
        });
      });
    });

    it('can cache false result', function(done) {
      const core = MockCore();
      const wrapper = new CachingStoreWrapper(core, 1); // cache TTL = 1 second

      wrapper.initialized(function(value) {
        expect(value).toEqual(false);
        expect(core.initQueriedCount).toEqual(1);

        core.inited = true;

        wrapper.initialized(function(value) {
          expect(value).toEqual(false);
          expect(core.initQueriedCount).toEqual(1);

          setTimeout(function() {
            wrapper.initialized(function(value) {
              expect(value).toEqual(true);
              expect(core.initQueriedCount).toEqual(2);

              done();
            });
          }, 1100);
        });
      });
    });
  });
});
