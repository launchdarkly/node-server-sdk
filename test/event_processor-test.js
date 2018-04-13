var nock = require('nock');
var EventProcessor = require('../event_processor');
var EventEmitter = require('events').EventEmitter;

describe('EventProcessor', function() {

  var ep;
  var eventsUri = 'http://example.com';
  var sdkKey = 'SDK_KEY';
  var defaultConfig = {
    eventsUri: eventsUri,
    capacity: 100,
    flushInterval: 30,
    userKeysCapacity: 1000,
    userKeysFlushInterval: 300
  };
  var user = { key: 'userKey', name: 'Red' };
  var filteredUser = { key: 'userKey', privateAttrs: [ 'name' ] };

  afterEach(function() {
    if (ep) {
      ep.close();
    }
  });

  function flush_and_get_request(options, cb) {
    var callback = cb || options;
    options = cb ? options : {};
    var requestBody;
    var requestHeaders;
    nock(eventsUri).post('/bulk')
      .reply(function(uri, body) {
        requestBody = body;
        requestHeaders = this.req.headers;
        return [ options.status || 200, '', options.headers || {} ];
      });
    ep.flush().then(
      function() {
        callback(requestBody, requestHeaders);
      },
      function(error) {
        callback(requestBody, requestHeaders, error);
      });
  }

  function headers_with_date(timestamp) {
    return { date: new Date(timestamp).toUTCString() };
  }

  function check_index_event(e, source, user) {
    expect(e.kind).toEqual('index');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.user).toEqual(user);
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
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        user: user
      }]);
      done();
    });
  });

  it('filters user in identify event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        user: filteredUser
      }]);
      done();
    });
  });

  it('queues individual feature event with index event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(3);
      check_index_event(output[0], e, user);
      check_feature_event(output[1], e, false);
      check_summary_event(output[2]);
      done();
    });
  });

  it('filters user in index event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(3);
      check_index_event(output[0], e, filteredUser);
      check_feature_event(output[1], e, false);
      check_summary_event(output[2]);
      done();
    });
  });

  it('can include inline user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(2);
      check_feature_event(output[0], e, false, user);
      check_summary_event(output[1]);
      done();
    });
  });

  it('filters user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true,
      inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(2);
      check_feature_event(output[0], e, false, filteredUser);
      check_summary_event(output[1]);
      done();
    });
  });

  it('still generates index event if inline_users is true but feature event is not tracked', function(done) {
    var config = Object.assign({}, defaultConfig, { inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: false };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(2);
      check_index_event(output[0], e, user);
      check_summary_event(output[1]);
      done();
    });
  });

  it('sets event kind to debug if event is temporarily in debug mode', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var futureTime = new Date().getTime() + 1000000;
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: futureTime };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(3);
      check_index_event(output[0], e, user);
      check_feature_event(output[1], e, true, user);
      check_summary_event(output[2]);
      done();
    });
  });

  it('can both track and debug an event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var futureTime = new Date().getTime() + 1000000;
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true, debugEventsUntilDate: futureTime };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(4);
      check_index_event(output[0], e, user);
      check_feature_event(output[1], e, false);
      check_feature_event(output[2], e, true, user);
      check_summary_event(output[3]);
      done();
    });
  });

  it('expires debug mode based on client time if client time is later than server time', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);

    // Pick a server time that is somewhat behind the client time
    var serverTime = new Date().getTime() - 20000;

    // Send and flush an event we don't care about, just to set the last server time
    ep.sendEvent({ kind: 'identify', user: { key: 'otherUser' } });
    flush_and_get_request({ status: 200, headers: headers_with_date(serverTime) }, function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the server time, but in the past compared to the client.
      var debugUntil = serverTime + 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.sendEvent(e);

      // Should get a summary event only, not a full feature event
      flush_and_get_request(function(output) {
        expect(output.length).toEqual(2);
        check_index_event(output[0], e, user);
        check_summary_event(output[1]);
        done();
      });
    });
  });

  it('expires debug mode based on server time if server time is later than client time', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);

    // Pick a server time that is somewhat ahead of the client time
    var serverTime = new Date().getTime() + 20000;

    // Send and flush an event we don't care about, just to set the last server time
    ep.sendEvent({ kind: 'identify', user: { key: 'otherUser' } });
    flush_and_get_request({ status: 200, headers: headers_with_date(serverTime) }, function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the client time, but in the past compared to the server.
      var debugUntil = serverTime - 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.sendEvent(e);

      // Should get a summary event only, not a full feature event
      flush_and_get_request(function(output) {
        expect(output.length).toEqual(2);
        check_index_event(output[0], e, user);
        check_summary_event(output[1]);
        done();
      });
    });
  });

  it('generates only one index event from two feature events for same user', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e1 = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey1',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    var e2 = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey2',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e1);
    ep.sendEvent(e2);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(4);
      check_index_event(output[0], e1, user);
      check_feature_event(output[1], e1, false);
      check_feature_event(output[2], e2, false);
      check_summary_event(output[3]);
      done();
    });
  });

  it('summarizes nontracked events', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e1 = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey1',
      version: 11, variation: 1, value: 'value1', default: 'default1', trackEvents: false };
    var e2 = { kind: 'feature', creationDate: 2000, user: user, key: 'flagkey2',
      version: 22, variation: 1, value: 'value2', default: 'default2', trackEvents: false };
    ep.sendEvent(e1);
    ep.sendEvent(e2);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(2);
      check_index_event(output[0], e1, user);
      var se = output[1];
      check_summary_event(se);
      expect(se.startDate).toEqual(1000);
      expect(se.endDate).toEqual(2000);
      expect(se.features).toEqual({
        flagkey1: {
          default: 'default1',
          counters: [ { version: 11, value: 'value1', count: 1 } ]
        },
        flagkey2: {
          default: 'default2',
          counters: [ { version: 22, value: 'value2', count: 1 } ]
        }
      });
      done();
    });
  });

  it('queues custom event with user', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(2);
      check_index_event(output[0], e, user);
      check_custom_event(output[1], e);
      done();
    });
  });

  it('can include inline user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(1);
      check_custom_event(output[0], e, user);
      done();
    });
  });

  it('filters user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true,
      inline_users_in_events: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flush_and_get_request(function(output) {
      expect(output.length).toEqual(1);
      check_custom_event(output[0], e, filteredUser);
      done();
    });
  });

  it('sends nothing if there are no events', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    ep.flush(function() {
      // Nock will generate an error if we sent a request we didn't explicitly listen for.
      done();
    });
  });

  it('sends SDK key', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flush_and_get_request(function(requestBody, requestHeaders) {
      expect(requestHeaders['authorization']).toEqual(sdkKey);
      done();
    });
  });

  it('stops sending events after a 401 error', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flush_and_get_request({ status: 401 }, function(body, headers, error) {
      expect(error.message).toContain("status code 401");

      ep.sendEvent(e);

      ep.flush().then(
        // no HTTP request should have been done here - Nock will error out if there was one
        function() { },
        function(err) {
          expect(err.message).toContain("SDK key is invalid");
          done();
        });
    });
  });
});
