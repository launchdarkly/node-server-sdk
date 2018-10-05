var LDClient = require('../index.js');
var messages = require('../messages');
var stubs = require('./stubs');

describe('LDClient', () => {

  describe('ready event', () => {
    it('is fired in offline mode', done => {
      var client = LDClient.init('sdk_key', { offline: true });
      client.on('ready', () => {
        done();
      });
    });
  });

  describe('failed event', () => {
    it('is fired if initialization fails', done => {
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.error = { status: 403 };
      var client = stubs.createClient({ updateProcessor: updateProcessor }, {});

      client.on('failed', err => {
        expect(err).toEqual(updateProcessor.error);
        done();
      });
    });
  });

  describe('isOffline()', () => {
    it('returns true in offline mode', done => {
      var client = LDClient.init('sdk_key', {offline: true});
      client.on('ready', () => {
        expect(client.isOffline()).toEqual(true);
        done();
      });
    });

    it('allows deprecated method is_offline', done => {
      var logger = stubs.stubLogger();
      var client = LDClient.init('sdk_key', {offline: true, logger: logger});
      client.on('ready', () => {
        expect(client.is_offline()).toEqual(true);
        expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('is_offline', 'isOffline'));
        done();
      });
    });
  });

  describe('secureModeHash()', () => {
    it('correctly computes hash for a known message and secret', () => {
      var client = LDClient.init('secret', {offline: true});
      var hash = client.secureModeHash({"key": "Message"});
      expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
    });

    it('allows deprecated method secure_mode_hash', () => {
      var logger = stubs.stubLogger();
      var client = LDClient.init('secret', {offline: true, logger: logger});
      var hash = client.secure_mode_hash({"key": "Message"});
      expect(hash).toEqual("aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
      expect(logger.warn).toHaveBeenCalledWith(messages.deprecated('secure_mode_hash', 'secureModeHash'));
    });
  });

  describe('waitUntilReady()', () => {
    it('resolves when ready', done => {
      var client = stubs.createClient({}, {});
      client.waitUntilReady().then(done)
        .catch(done.error)
    });

    it('resolves immediately if the client is already ready', done => {
      var client = stubs.createClient({}, {});
      client.waitUntilReady().then(() => {
        client.waitUntilReady().then(done)
          .catch(done.error)
      }).catch(done.error);
    });
  });

  describe('waitForInitialization()', () => {
    it('resolves when ready', done => {
      var callback = jest.fn();
      var client = stubs.createClient({}, {});

      client.waitForInitialization().then(callback)
        .then(() => {
          expect(callback).toHaveBeenCalled();
          expect(callback.mock.calls[0][0]).toBe(client);
          done();
        }).catch(done.error)
    });

    it('resolves immediately if the client is already ready', done => {
      var callback = jest.fn();
      var client = stubs.createClient({}, {});

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

    it('is rejected if initialization fails', done => {
      var updateProcessor = stubs.stubUpdateProcessor();
      updateProcessor.error = { status: 403 };
      var client = stubs.createClient({ updateProcessor: updateProcessor }, {});

      client.waitForInitialization()
        .catch(err => {
          expect(err).toEqual(updateProcessor.error);
          done();
        });
    });
  });

  describe('close()', () => {
    it('does not crash when closing an offline client', done => {
      var client = LDClient.init('sdk_key', {offline: true});
      expect(() => client.close()).not.toThrow();
      done();
    });
  });
});
