var nock = require('nock');
var EventProcessor = require('../event_processor');

describe('EventProcessor', function() {

  var ep;
  var eventsUri = 'http://example.com';
  var sdkKey = 'SDK_KEY';
  var defaultConfig = {
    eventsUri: eventsUri,
    capacity: 100,
    flushInterval: 30,
    userKeysCapacity: 1000,
    userKeysFlushInterval: 300,
    logger: {
      debug: jest.fn(),
      warn: jest.fn()
    }
  };
  var user = { key: 'userKey', name: 'Red' };
  var filteredUser = { key: 'userKey', privateAttrs: [ 'name' ] };
  var numericUser = { key: 1, secondary: 2, ip: 3, country: 4, email: 5, firstName: 6, lastName: 7,
    avatar: 8, name: 9, anonymous: false, custom: { age: 99 } };
  var stringifiedNumericUser = { key: '1', secondary: '2', ip: '3', country: '4', email: '5', firstName: '6',
    lastName: '7', avatar: '8', name: '9', anonymous: false, custom: { age: 99 } };

  afterEach(function() {
    if (ep) {
      ep.close();
    }
    nock.cleanAll();
  });

  function flushAndGetRequest(options, cb) {
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

  function headersWithDate(timestamp) {
    return { date: new Date(timestamp).toUTCString() };
  }

  function checkIndexEvent(e, source, user) {
    expect(e.kind).toEqual('index');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.user).toEqual(user);
  }

  function checkFeatureEvent(e, source, debug, inlineUser) {
    expect(e.kind).toEqual(debug ? 'debug' : 'feature');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.version).toEqual(source.version);
    expect(e.variation).toEqual(source.variation);
    expect(e.value).toEqual(source.value);
    expect(e.default).toEqual(source.default);
    expect(e.reason).toEqual(source.reason);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(String(source.user.key));
    }
  }

  function checkCustomEvent(e, source, inlineUser) {
    expect(e.kind).toEqual('custom');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.data).toEqual(source.data);
    expect(e.metricValue).toBe(source.metricValue);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(source.user.key);
    }
  }

  function checkSummaryEvent(e) {
    expect(e.kind).toEqual('summary');
  }

  it('queues identify event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        key: user.key,
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

    flushAndGetRequest(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        key: user.key,
        user: filteredUser
      }]);
      done();
    });
  });

  it('stringifies user attributes in identify event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: numericUser };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output).toEqual([{
        kind: 'identify',
        creationDate: 1000,
        key: stringifiedNumericUser.key,
        user: stringifiedNumericUser
      }]);
      done();
    });
  });

  it('queues individual feature event with index event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(3);
      checkIndexEvent(output[0], e, user);
      checkFeatureEvent(output[1], e, false);
      checkSummaryEvent(output[2]);
      done();
    });
  });

  it('filters user in index event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(3);
      checkIndexEvent(output[0], e, filteredUser);
      checkFeatureEvent(output[1], e, false);
      checkSummaryEvent(output[2]);
      done();
    });
  });

  it('stringifies user attributes in index event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'feature', creationDate: 1000, user: numericUser, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(3);
      checkIndexEvent(output[0], e, stringifiedNumericUser);
      checkFeatureEvent(output[1], e, false);
      checkSummaryEvent(output[2]);
      done();
    });
  });

  it('can include inline user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], e, false, user);
      checkSummaryEvent(output[1]);
      done();
    });
  });

  it('filters user in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true,
      inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], e, false, filteredUser);
      checkSummaryEvent(output[1]);
      done();
    });
  });

  it('stringifies user attributes in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: numericUser, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], e, false, stringifiedNumericUser);
      checkSummaryEvent(output[1]);
      done();
    });
  });

  it('can include reason in feature event', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true,
      reason: { kind: 'FALLTHROUGH' } };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], e, false, user);
      checkSummaryEvent(output[1]);
      done();
    });
  });

  it('still generates index event if inlineUsers is true but feature event is not tracked', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: false };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkIndexEvent(output[0], e, user);
      checkSummaryEvent(output[1]);
      done();
    });
  });

  it('sets event kind to debug if event is temporarily in debug mode', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var futureTime = new Date().getTime() + 1000000;
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: futureTime };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(3);
      checkIndexEvent(output[0], e, user);
      checkFeatureEvent(output[1], e, true, user);
      checkSummaryEvent(output[2]);
      done();
    });
  });

  it('can both track and debug an event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var futureTime = new Date().getTime() + 1000000;
    var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
      version: 11, variation: 1, value: 'value', trackEvents: true, debugEventsUntilDate: futureTime };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(4);
      checkIndexEvent(output[0], e, user);
      checkFeatureEvent(output[1], e, false);
      checkFeatureEvent(output[2], e, true, user);
      checkSummaryEvent(output[3]);
      done();
    });
  });

  it('expires debug mode based on client time if client time is later than server time', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);

    // Pick a server time that is somewhat behind the client time
    var serverTime = new Date().getTime() - 20000;

    // Send and flush an event we don't care about, just to set the last server time
    ep.sendEvent({ kind: 'identify', user: { key: 'otherUser' } });
    flushAndGetRequest({ status: 200, headers: headersWithDate(serverTime) }, function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the server time, but in the past compared to the client.
      var debugUntil = serverTime + 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.sendEvent(e);

      // Should get a summary event only, not a full feature event
      flushAndGetRequest(function(output) {
        expect(output.length).toEqual(2);
        checkIndexEvent(output[0], e, user);
        checkSummaryEvent(output[1]);
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
    flushAndGetRequest({ status: 200, headers: headersWithDate(serverTime) }, function() {
      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the client time, but in the past compared to the server.
      var debugUntil = serverTime - 1000;
      var e = { kind: 'feature', creationDate: 1000, user: user, key: 'flagkey',
        version: 11, variation: 1, value: 'value', trackEvents: false, debugEventsUntilDate: debugUntil };
      ep.sendEvent(e);

      // Should get a summary event only, not a full feature event
      flushAndGetRequest(function(output) {
        expect(output.length).toEqual(2);
        checkIndexEvent(output[0], e, user);
        checkSummaryEvent(output[1]);
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

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(4);
      checkIndexEvent(output[0], e1, user);
      checkFeatureEvent(output[1], e1, false);
      checkFeatureEvent(output[2], e2, false);
      checkSummaryEvent(output[3]);
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

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkIndexEvent(output[0], e1, user);
      var se = output[1];
      checkSummaryEvent(se);
      expect(se.startDate).toEqual(1000);
      expect(se.endDate).toEqual(2000);
      expect(se.features).toEqual({
        flagkey1: {
          default: 'default1',
          counters: [ { version: 11, variation: 1, value: 'value1', count: 1 } ]
        },
        flagkey2: {
          default: 'default2',
          counters: [ { version: 22, variation: 1, value: 'value2', count: 1 } ]
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

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkIndexEvent(output[0], e, user);
      checkCustomEvent(output[1], e);
      done();
    });
  });

  it('can include metric value in custom event', function(done) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' }, metricValue: 1.5 };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(2);
      checkIndexEvent(output[0], e, user);
      checkCustomEvent(output[1], e);
      done();
    });
  });

  it('can include inline user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e, user);
      done();
    });
  });

  it('stringifies user attributes in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'custom', creationDate: 1000, user: numericUser, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e, stringifiedNumericUser);
      done();
    });
  });

  it('filters user in custom event', function(done) {
    var config = Object.assign({}, defaultConfig, { allAttributesPrivate: true,
      inlineUsersInEvents: true });
    ep = EventProcessor(sdkKey, config);
    var e = { kind: 'custom', creationDate: 1000, user: user, key: 'eventkey',
      data: { thing: 'stuff' } };
    ep.sendEvent(e);

    flushAndGetRequest(function(output) {
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e, filteredUser);
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

    flushAndGetRequest(function(requestBody, requestHeaders) {
      expect(requestHeaders['authorization']).toEqual(sdkKey);
      done();
    });
  });

  function verifyUnrecoverableHttpError(done, status) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e);

    flushAndGetRequest({ status: status }, function(body, headers, error) {
      expect(error.message).toContain("error " + status);

      ep.sendEvent(e);

      ep.flush().then(
        // no HTTP request should have been done here - Nock will error out if there was one
        function() { },
        function(err) {
          expect(err.message).toContain("SDK key is invalid");
          done();
        });
    });
  }

  function verifyRecoverableHttpError(done, status) {
    ep = EventProcessor(sdkKey, defaultConfig);
    var e0 = { kind: 'identify', creationDate: 1000, user: user };
    ep.sendEvent(e0);

    nock(eventsUri).post('/bulk').reply(status);
    nock(eventsUri).post('/bulk').reply(status);
    // since we only queued two responses, Nock will throw an error if it gets a third.
    ep.flush().then(
      function() {},
      function(err) {
        expect(err.message).toContain('error ' + status);

        var e1 = { kind: 'identify', creationDate: 1001, user: user };
        ep.sendEvent(e1);

        // this second event should go through
        flushAndGetRequest(function(output) {
          expect(output.length).toEqual(1);
          expect(output[0].creationDate).toEqual(1001);
      
          done();
        });
      });
  }

  it('retries after a 400 error', function(done) {
    verifyRecoverableHttpError(done, 400);
  });

  it('stops sending events after a 401 error', function(done) {
    verifyUnrecoverableHttpError(done, 401);
  });

  it('stops sending events after a 403 error', function(done) {
    verifyUnrecoverableHttpError(done, 403);
  });

  it('retries after a 408 error', function(done) {
    verifyRecoverableHttpError(done, 408);
  });

  it('retries after a 429 error', function(done) {
    verifyRecoverableHttpError(done, 429);
  });

  it('retries after a 503 error', function(done) {
    verifyRecoverableHttpError(done, 503);
  });

  it('swallows errors from failed background flush', function(done) {
    // This test verifies that when a background flush fails, we don't emit an unhandled
    // promise rejection. Jest will fail the test if we do that.

    var config = Object.assign({}, defaultConfig, { flushInterval: 0.25 });
    ep = EventProcessor(sdkKey, config);
    ep.sendEvent({ kind: 'identify', creationDate: 1000, user: user });

    var req1 = nock(eventsUri).post('/bulk').reply(500);
    var req2 = nock(eventsUri).post('/bulk').reply(500);

    // unfortunately we must wait for both the flush interval and the 1-second retry interval
    var delay = 1500;
    setTimeout(function() {
        expect(req1.isDone()).toEqual(true);
        expect(req2.isDone()).toEqual(true);
        done();
      }, delay);
  });
});
