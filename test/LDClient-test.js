var LDClient = require('../index.js');

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
});
