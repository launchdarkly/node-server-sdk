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
});
