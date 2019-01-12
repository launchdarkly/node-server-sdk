var stubs = require('./stubs');

describe('LDClient - analytics events', () => {

  var eventProcessor;
  var defaultUser = { key: 'user' };

  beforeEach(() => {
    eventProcessor = stubs.stubEventProcessor();
  });

  describe('feature event', () => {
    it('generates event for existing feature', async () => {
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
      await client.waitForInitialization();
      await client.variation(flag.key, defaultUser, 'c');

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
    });

    it('generates event for existing feature with reason', async () => {
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
      await client.waitForInitialization();
      await client.variationDetail(flag.key, defaultUser, 'c');

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
    });

    it('generates event for unknown feature', async () => {
      var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

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
    });

    it('generates event for existing feature when user key is missing', async () => {
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
      await client.waitForInitialization();
      await client.variation(flag.key, badUser, 'c');

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
    });

    it('generates event for existing feature when user is null', async () => {
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
      await client.waitForInitialization();
      await client.variation(flag.key, null, 'c');

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
    });
  });

  it('generates an event for identify()', async () => {
    var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
    await client.waitForInitialization();
    
    client.identify(defaultUser);
    expect(eventProcessor.events).toHaveLength(1);
    var e = eventProcessor.events[0];
    expect(e).toMatchObject({
      kind: 'identify',
      key: defaultUser.key,
      user: defaultUser
    });
  });

  it('generates an event for track()', async () => {
    var data = { thing: 'stuff' };
    var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
    await client.waitForInitialization();

    client.track('eventkey', defaultUser, data);
    expect(eventProcessor.events).toHaveLength(1);
    var e = eventProcessor.events[0];
    expect(e).toMatchObject({
      kind: 'custom',
      key: 'eventkey',
      user: defaultUser,
      data: data
    });
  });
});
