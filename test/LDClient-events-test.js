var InMemoryFeatureStore = require('../feature_store');
var LDClient = require('../index.js');
var dataKind = require('../versioned_data_kind');
var messages = require('../messages');
var stubs = require('./stubs');

describe('LDClient - analytics events', () => {

  var eventProcessor;
  var defaultUser = { key: 'user' };

  beforeEach(() => {
    eventProcessor = stubs.stubEventProcessor();
  });

  describe('feature event', () => {
    it('generates event for existing feature', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({ eventProcessor: eventProcessor }, { flagkey: flag });
      client.on('ready', () => {
        client.variation(flag.key, defaultUser, 'c', (err, result) => {
          expect(eventProcessor.events).toHaveLength(1);
          var e = eventProcessor.events[0];
          expect(e).toMatchObject({
            kind: 'feature',
            key: 'flagkey',
            version: 1,
            user: defaultUser,
            variation: 1,
            value: 'b',
            default: 'c',
            trackEvents: true
          });
          done();
        });
      });
    });

    it('generates event for existing feature with reason', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({ eventProcessor: eventProcessor }, { flagkey: flag });
      client.on('ready', () => {
        client.variationDetail(flag.key, defaultUser, 'c', (err, result) => {
          expect(eventProcessor.events).toHaveLength(1);
          var e = eventProcessor.events[0];
          expect(e).toMatchObject({
            kind: 'feature',
            key: 'flagkey',
            version: 1,
            user: defaultUser,
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

    it('generates event for unknown feature', done => {
      var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
      client.on('ready', () => {
        client.variation('flagkey', defaultUser, 'c', (err, result) => {
          expect(eventProcessor.events).toHaveLength(1);
          var e = eventProcessor.events[0];
          expect(e).toMatchObject({
            kind: 'feature',
            key: 'flagkey',
            version: null,
            user: defaultUser,
            variation: null,
            value: 'c',
            default: 'c',
            trackEvents: null
          });
          done();
        });
      });
    });

    it('generates event for existing feature when user key is missing', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({ eventProcessor: eventProcessor }, { flagkey: flag });
      var badUser = { name: 'Bob' };
      client.on('ready', () => {
        client.variation(flag.key, badUser, 'c', (err, result) => {
          expect(eventProcessor.events).toHaveLength(1);
          var e = eventProcessor.events[0];
          expect(e).toMatchObject({
            kind: 'feature',
            key: 'flagkey',
            version: 1,
            user: badUser,
            variation: null,
            value: 'c',
            default: 'c',
            trackEvents: true
          });
          done();
        });
      });
    });

    it('generates event for existing feature when user is null', done => {
      var flag = {
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEvents: true
      };
      var client = stubs.createClient({ eventProcessor: eventProcessor }, { flagkey: flag });
      client.on('ready', () => {
        client.variation(flag.key, null, 'c', (err, result) => {
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
  });

  it('generates an event for identify()', done => {
    var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
    client.on('ready', () => {
      client.identify(defaultUser);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'identify',
        key: defaultUser.key,
        user: defaultUser
      });
      done();
    });
  });

  it('generates an event for track()', done => {
    var data = { thing: 'stuff' };
    var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
    client.on('ready', () => {
      client.track('eventkey', defaultUser, data);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'custom',
        key: 'eventkey',
        user: defaultUser,
        data: data
      });
      done();
    });
  });
});
