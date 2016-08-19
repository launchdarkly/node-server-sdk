var assert = require('assert');
var LDClient = require('../index.js');

describe('ldclient', function() {
  it('should trigger the ready event in offline mode', function(done) {
    this.timeout(500);
    
    var client = LDClient.init('sdk_key', {offline: true});
    client.on('ready', function() {
      done();
    });
  });

  it('should correctly compute the secure mode hash for a known message and secret', function() {
    var client = LDClient.init('secret', {offline: true});

    var hash = client.secure_mode_hash({"key": "Message"});
    assert.equal(hash, "aa747c502a898200f9e4fa21bac68136f886a0e27aec70ba06daf2e2a5cb5597");
  });
});
