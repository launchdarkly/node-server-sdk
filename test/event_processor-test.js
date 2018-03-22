var EventProcessor = require('../event_processor');
var EventEmitter = require('events').EventEmitter;

describe('EventProcessor', function() {

  var ep;
  var mockRequest;
  var mockServerTime;
  var requestParams;
  var sdkKey = 'SDK_KEY';
  var defaultConfig = { capacity: 100, flush_interval: 30, user_keys_capacity: 1000, user_keys_flush_interval: 300 };
  var user = { key: 'userKey', name: 'Red' };
  var filteredUser = { key: 'userKey', privateAttrs: [ 'name' ] };

  beforeEach(function() {
    requestParams = null;
    mockServerTime = null;
    var requestEvent = new EventEmitter();
    mockRequest = function(params) {
      requestParams = params;
      var resp = { statusCode: 200, headers: {} };
      if (mockServerTime) {
        resp.headers['Date'] = new Date(mockServerTime).toUTCString();
      }
      setTimeout(function() {
          requestEvent.emit('response', resp, null);
        }, 0);
      return requestEvent;
    };
  });

  afterEach(function() {
    if (ep) {
      ep.close();
    }
  });

  function flush_and_get_events(cb) {
    ep.flush(function() {
      cb(requestParams.body);
    });
  }

  function check_index_event(e, source) {
    expect(e.kind).toEqual('index');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.user).toEqual(source.user);
  }

  function check_feature_event(e, source, debug, inlineUser) {
    expect(e.kind).toEqual(debug ? 'debug' : 'feature');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.version).toEqual(source.version);
    expect(e.value).toEqual(source.value);
    expect(e.default).toEqual(source.default);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(source.user.key);
    }
  }

  function check_custom_event(e, source, inlineUser) {
    expect(e.kind).toEqual('custom');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.data).toEqual(source.data);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(source.user.key);
    }
  }

  function check_summary_event(e) {
    expect(e.kind).toEqual('summary');
  }

  it('queues identify event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        user: user
      }]);
      done();
    });
  });

  it('filters user in identify event', function(done) {
    var config = Object.assign({}, defaultConfig, { all_attributes_private: true });
    ep = EventProcessor(sdkKey, config, mockRequest);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        user: filteredUser
      }]);
      done();
    });
  });

  it('queues individual feature event with index event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(3);
      check_index_event(output[0], e);
      check_feature_event(output[1], e, false);
      check_summary_event(output[2]);
      done();
    });
  });

  it('can include inline user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config, mockRequest);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(2);
      check_feature_event(output[0], e, false, user);
      check_summary_event(output[1]);
      done();
    });
  });

  it('filters user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { all_attributes_private: true,
      inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config, mockRequest);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(2);
      check_feature_event(output[0], e, false, filteredUser);
      check_summary_event(output[1]);
      done();
    });
  });

  it('sets event kind to debug if event is temporarily in debug mode', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    var futureTime = new Date().getTime() + 1000000;
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: futureTime };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(3);
      check_index_event(output[0], e);
      check_feature_event(output[1], e, true);
      check_summary_event(output[2]);
      done();
    });
  });

  it('expires debug mode based on client time if client time is later than server time', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);

    // Pick a server time that is somewhat behind the client time
    var serverTime = new Date().getTime() - 20000;

    // Send and flush an event we don't care about, just to set the last server time
    mockServerTime = serverTime;
    ep.send_event({ kind: 'identify', user: { key: 'otherUser' } });
    flush_and_get_events(function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the server time, but in the past compared to the client.
      var debugUntil = serverTime + 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.send_event(e);

      // Should get a summary event only, not a full feature event
      flush_and_get_events(function(output) {
        expect(output.length).toEqual(2);
        check_index_event(output[0], e);
        check_summary_event(output[1]);
        done();
      });
    });
  });

  it('expires debug mode based on server time if server time is later than client time', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);

    // Pick a server time that is somewhat ahead of the client time
    var serverTime = new Date().getTime() + 20000;

    // Send and flush an event we don't care about, just to set the last server time
    mockServerTime = serverTime;
    ep.send_event({ kind: 'identify', user: { key: 'otherUser' } });
    flush_and_get_events(function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the client time, but in the past compared to the server.
      var debugUntil = serverTime - 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.send_event(e);

      // Should get a summary event only, not a full feature event
      flush_and_get_events(function(output) {
        expect(output.length).toEqual(2);
        check_index_event(output[0], e);
        check_summary_event(output[1]);
        done();
      });
    });
  });

  it('generates only one index event from two feature events for same user', function(done) {
    done();
  });

  it('summarizes nontracked events', function(done) {
    done();
  });

  it('queues custom event with user', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(2);
      check_index_event(output[0], e);
      check_custom_event(output[1], e);
      done();
    });
  });

  it('can include inline user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config, mockRequest);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(1);
      check_custom_event(output[0], e, user);
      done();
    });
  });

  it('filters user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { all_attributes_private: true,
      inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config, mockRequest);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.send_event(e);

    flush_and_get_events(function(output) {
      expect(output.length).toEqual(1);
      check_custom_event(output[0], e, filteredUser);
      done();
    });
  });

  it('sends nothing if there are no events', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    ep.flush(function() {
      expect(requestParams).toEqual(null);
      done();
    });
  });

  it('sends SDK key', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig, mockRequest);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.send_event(e);

    ep.flush(function() {
      expect(requestParams.headers['Authorization']).toEqual(sdkKey);
      done();
    });
  });
});
