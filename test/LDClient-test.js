var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');
var messages = require('../messages');

describe('LDClient', function() {

  var logger = {};

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

  var updateProcessor = {
    start: function(callback) {
      setImmediate(callback, updateProcessor.error);
    }
  };

  beforeEach(function() {
    logger.debug = jest.fn();
    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
    eventProcessor.events = [];
    updateProcessor.error = null;
  });

  it('should trigger the ready event in offline mode', function(done) {
    var client = LDClient.init('sdk_key', {offline: true});
    client.on('ready', function() {
      done();
    });
  });

  it('returns true for isOffline in offline mode', function(done) {
    var client = LDClient.init('sdk_key', {offline: true});
    client.on('ready', function() {
      expect(client.isOffline()).toEqual(true);
      done();
    });
  });

  it('allows deprecated method is_offline', function(done) {
    var client = LDClient.init('sdk_key', {offline: true, logger: logger});
    client.on('ready', function() {
      expect(client.is_offline()).toEqual(true);
      expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('is_offline', 'isOffline'));
      done();
    });
  });

  it('should correctly compute the secure mode hash for a known message and secret', function() {
    var client = LDClient.init('secret', {offline: true});
    var hash = client.secureModeHash({"key": "Message"});
    expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
  });

  it('allows deprecated method secure_mode_hash', function() {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    var hash = client.secure_mode_hash({"key": "Message"});
    expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
    expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('secure_mode_hash', 'secureModeHash'));
  });

  it('returns empty map for allFlags in offline mode and logs a message', function(done) {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    client.on('ready', function() {
      client.allFlags({key: 'user'}, function(err, result) {
        expect(result).toEqual({});
        expect(logger.info).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('returns empty state for allFlagsState in offline mode and logs a message', function(done) {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    client.on('ready', function() {
      client.allFlagsState({key: 'user'}, {}, function(err, state) {
        expect(state.valid).toEqual(false);
        expect(state.allValues()).toEqual({});
        expect(logger.info).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('allows deprecated method all_flags', function(done) {
    var client = LDClient.init('secret', {offline: true, logger: logger});
    client.on('ready', function() {
      client.all_flags({key: 'user'}, function(err, result) {
        expect(result).toEqual({});
        expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('all_flags', 'allFlags'));
        done();
      });
    });
  });

  function createOnlineClientWithFlags(flagsMap) {
    var store = InMemoryFeatureStore();
    var allData = {};
    allData[dataKind.features.namespace] = flagsMap;
    store.init(allData);
    return LDClient.init('secret', {
      featureStore: store,
      eventProcessor: eventProcessor,
      updateProcessor: updateProcessor,
      logger: logger
    });
  }

  function createOnlineClientWithFlagsInUninitializedStore(flagsMap) {
    var store = InMemoryFeatureStore();
    for (var key in flagsMap) {
      store.upsert(dataKind.features, flagsMap[key]);
    }
    return LDClient.init('secret', {
      featureStore: store,
      eventProcessor: eventProcessor,
      updateProcessor: updateProcessor,
      logger: logger
    });
  }

  it('evaluates a flag with variation()', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation(flag.key, user, 'c', function(err, result) {
        expect(err).toBeNull();
        expect(result).toEqual('b');
        done();
      });
    });
  });

  it('returns default from variation() for unknown flag', function(done) {
    var client = createOnlineClientWithFlags({ });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation('flagkey', user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toEqual('default');
        done();
      });
    });
  });

  it('returns default from variation() if client and store are not initialized', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: false,
      offVariation: 0,
      variations: ['value']
    };
    client = createOnlineClientWithFlagsInUninitializedStore({ flagkey: flag });
    var user = { key: 'user' };
    client.variation('flagkey', user, 'default', function(err, result) {
      expect(err).toBeNull();
      expect(result).toEqual('default');
      done();
    });
  });

  it('returns default from variation() if flag key is not specified', function(done) {
    var client = createOnlineClientWithFlags({ });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation(null, user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toEqual('default');
        done();
      });
    });
  });

  it('returns default from variation() for flag that evaluates to null', function(done) {
    var flag = {
      key: 'flagkey',
      on: false,
      offVariation: null
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation(flag.key, user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toEqual('default');
        done();
      });
    });
  });

  it('evaluates a flag with variationDetail()', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variationDetail(flag.key, user, 'c', function(err, result) {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'b', variationIndex: 1, reason: { kind: 'FALLTHROUGH' } });
        done();
      });
    });
  });

  it('returns default from variationDetail() for unknown flag', function(done) {
    var client = createOnlineClientWithFlags({ });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variationDetail('flagkey', user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'default', variationIndex: null,
          reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
        done();
      });
    });
  });

  it('returns default from variationDetail() if client and store are not initialized', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: false,
      offVariation: 0,
      variations: ['value']
    };
    client = createOnlineClientWithFlagsInUninitializedStore({ flagkey: flag });
    var user = { key: 'user' };
    client.variationDetail('flagkey', user, 'default', function(err, result) {
      expect(err).toBeNull();
      expect(result).toMatchObject({ value: 'default', variationIndex: null,
        reason: { kind: 'ERROR', errorKind: 'CLIENT_NOT_READY' } });
      done();
    });
  });

  it('returns default from variation() if flag key is not specified', function(done) {
    var client = createOnlineClientWithFlags({ });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variationDetail(null, user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'default', variationIndex: null,
          reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' } });
        done();
      });
    });
  });

  it('returns default from variationDetail() for flag that evaluates to null', function(done) {
    var flag = {
      key: 'flagkey',
      on: false,
      offVariation: null
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variationDetail(flag.key, user, 'default', function(err, result) {
        expect(err).toBeNull();
        expect(result).toMatchObject({ value: 'default', variationIndex: null, reason: { kind: 'OFF' } });
        done();
      });
    });
  });

  it('generates an event for an existing feature', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation(flag.key, user, 'c', function(err, result) {
        expect(eventProcessor.events).toHaveLength(1);
        var e = eventProcessor.events[0];
        expect(e).toMatchObject({
          kind: 'feature',
          key: 'flagkey',
          version: 1,
          user: user,
          variation: 1,
          value: 'b',
          default: 'c',
          trackEvents: true
        });
        done();
      });
    });
  });

  it('generates an event for an existing feature with reason', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variationDetail(flag.key, user, 'c', function(err, result) {
        expect(eventProcessor.events).toHaveLength(1);
        var e = eventProcessor.events[0];
        expect(e).toMatchObject({
          kind: 'feature',
          key: 'flagkey',
          version: 1,
          user: user,
          variation: 1,
          value: 'b',
          default: 'c',
          reason: { kind: 'FALLTHROUGH' },
          trackEvents: true
        });
        done();
      });
    });
  });

  it('generates an event for an unknown feature', function(done) {
    var client = createOnlineClientWithFlags({});
    var user = { key: 'user' };
    client.on('ready', function() {
      client.variation('flagkey', user, 'c', function(err, result) {
        expect(eventProcessor.events).toHaveLength(1);
        var e = eventProcessor.events[0];
        expect(e).toMatchObject({
          kind: 'feature',
          key: 'flagkey',
          version: null,
          user: user,
          variation: null,
          value: 'c',
          default: 'c',
          trackEvents: null
        });
        done();
      });
    });
  });

  it('generates an event for an existing feature even if user key is missing', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    var user = { name: 'Bob' };
    client.on('ready', function() {
      client.variation(flag.key, user, 'c', function(err, result) {
        expect(eventProcessor.events).toHaveLength(1);
        var e = eventProcessor.events[0];
        expect(e).toMatchObject({
          kind: 'feature',
          key: 'flagkey',
          version: 1,
          user: user,
          variation: null,
          value: 'c',
          default: 'c',
          trackEvents: true
        });
        done();
      });
    });
  });

  it('generates an event for an existing feature even if user is null', function(done) {
    var flag = {
      key: 'flagkey',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true
    };
    var client = createOnlineClientWithFlags({ flagkey: flag });
    client.on('ready', function() {
      client.variation(flag.key, null, 'c', function(err, result) {
        expect(eventProcessor.events).toHaveLength(1);
        var e = eventProcessor.events[0];
        expect(e).toMatchObject({
          kind: 'feature',
          key: 'flagkey',
          version: 1,
          user: null,
          variation: null,
          value: 'c',
          default: 'c',
          trackEvents: true
        });
        done();
      });
    });
  });

  it('evaluates a flag with allFlags()', function(done) {
    var flag = {
      key: 'feature',
      version: 1,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b']
    };
    var client = createOnlineClientWithFlags({ feature: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.allFlags(user, function(err, results) {
        expect(err).toBeNull();
        expect(results).toEqual({feature: 'b'});
        expect(logger.warn).toHaveBeenCalledTimes(1); // deprecation warning
        done();
      });
    });
  });

  it('captures flag state with allFlagsState()', function(done) {
    var flag = {
      key: 'feature',
      version: 100,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true,
      debugEventsUntilDate: 1000
    };
    var client = createOnlineClientWithFlags({ feature: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.allFlagsState(user, {}, function(err, state) {
        expect(err).toBeNull();
        expect(state.valid).toEqual(true);
        expect(state.allValues()).toEqual({feature: 'b'});
        expect(state.getFlagValue('feature')).toEqual('b');
        expect(state.toJSON()).toEqual({
          feature: 'b',
          $flagsState: {
            feature: {
              version: 100,
              variation: 1,
              trackEvents: true,
              debugEventsUntilDate: 1000
            }
          },
          $valid: true
        });
        done();
      });
    });
  });

  it('can filter for only client-side flags with allFlagsState()', function(done) {
    var flag1 = { key: 'server-side-1', on: false, offVariation: 0, variations: ['a'], clientSide: false };
    var flag2 = { key: 'server-side-2', on: false, offVariation: 0, variations: ['b'], clientSide: false };
    var flag3 = { key: 'client-side-1', on: false, offVariation: 0, variations: ['value1'], clientSide: true };
    var flag4 = { key: 'client-side-2', on: false, offVariation: 0, variations: ['value2'], clientSide: true };
    var client = createOnlineClientWithFlags({
      'server-side-1': flag1, 'server-side-2': flag2, 'client-side-1': flag3, 'client-side-2': flag4
    });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.allFlagsState(user, { clientSideOnly: true }, function(err, state) {
        expect(err).toBeNull();
        expect(state.valid).toEqual(true);
        expect(state.allValues()).toEqual({ 'client-side-1': 'value1', 'client-side-2': 'value2' });
        done();
      });
    });
  });

  it('can omit options parameter for allFlagsState()', function(done) {
    var flag = { key: 'key', on: false, offVariation: 0, variations: ['value'] };
    var client = createOnlineClientWithFlags({ 'key': flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.allFlagsState(user, function(err, state) {
        expect(err).toBeNull();
        expect(state.valid).toEqual(true);
        expect(state.allValues()).toEqual({ 'key': 'value' });
        done();
      });
    });
  });

  it('can include reasons in allFlagsState()', function(done) {
    var flag = {
      key: 'feature',
      version: 100,
      on: true,
      targets: [],
      fallthrough: { variation: 1 },
      variations: ['a', 'b'],
      trackEvents: true,
      debugEventsUntilDate: 1000
    };
    var client = createOnlineClientWithFlags({ feature: flag });
    var user = { key: 'user' };
    client.on('ready', function() {
      client.allFlagsState(user, { withReasons: true }, function(err, state) {
        expect(err).toBeNull();
        expect(state.valid).toEqual(true);
        expect(state.allValues()).toEqual({feature: 'b'});
        expect(state.getFlagValue('feature')).toEqual('b');
        expect(state.toJSON()).toEqual({
          feature: 'b',
          $flagsState: {
            feature: {
              version: 100,
              variation: 1,
              reason: { kind: 'FALLTHROUGH' },
              trackEvents: true,
              debugEventsUntilDate: 1000
            }
          },
          $valid: true
        });
        done();
      });
    });
  });

  it('should not overflow the call stack when evaluating a huge number of flags', function(done) {
    var flagCount = 5000;
    var flags = {};
    for (var i = 0; i < flagCount; i++) {
      var key = 'feature' + i;
      var flag = {
        key: key,
        version: 1,
        on: false
      };
      flags[key] = flag;
    }
    var client = createOnlineClientWithFlags(flags);
    client.on('ready', function() {
      client.allFlags({key: 'user'}, function(err, result) {
        expect(err).toEqual(null);
        expect(Object.keys(result).length).toEqual(flagCount);
        done();
      });
    });
  });

  it('should not crash when closing an offline client', function(done) {
    var client = LDClient.init('sdk_key', {offline: true});
    expect(() => client.close()).not.toThrow();
    done();
  });

  describe('waitUntilReady()', function () {
    it('should resolve waitUntilReady() when ready', function(done) {
      var client = LDClient.init('secret', {offline: true});
      var callback = jest.fn();

      client.waitUntilReady().then(callback)
        .then(() => {
          expect(callback).toHaveBeenCalled();
          done();
        }).catch(done.error)
    });

    it('should resolve waitUntilReady() even if the client is already ready', function(done) {
      var client = LDClient.init('secret', {offline: true});
      var callback = jest.fn();

      client.waitUntilReady()
        .then(() => {
          client.waitUntilReady().then(callback)
            .then(() => {
              expect(callback).toHaveBeenCalled();
              done();
            }).catch(done.error)
        }).catch(done.error)
    });
  });

  describe('waitForInitialization()', function () {
    it('should resolve when ready', function(done) {
      var callback = jest.fn();
      var client = createOnlineClientWithFlags({});

      client.waitForInitialization().then(callback)
        .then(() => {
          expect(callback).toHaveBeenCalled();
          expect(callback.mock.calls[0][0]).toBe(client);
          done();
        }).catch(done.error)
    });

    it('should resolve even if the client is already ready', function(done) {
      var callback = jest.fn();
      var client = createOnlineClientWithFlags({});

      client.waitForInitialization()
        .then(() => {
          client.waitForInitialization().then(callback)
            .then(() => {
              expect(callback).toHaveBeenCalled();
              expect(callback.mock.calls[0][0]).toBe(client);
              done();
            }).catch(done.error)
        }).catch(done.error)
    });

    it('should be rejected if initialization fails', function(done) {
      updateProcessor.error = { status: 403 };
      var client = createOnlineClientWithFlags({});

      client.waitForInitialization()
        .catch(err => {
          expect(err).toEqual(updateProcessor.error);
          done();
        });
    });
  });

  describe('failed event', function() {
    it('should be fired if initialization fails', function(done) {
      updateProcessor.error = { status: 403 };
      var client = createOnlineClientWithFlags({});

      client.on('failed', err => {
        expect(err).toEqual(updateProcessor.error);
        done();
      });
    });
  })
});
