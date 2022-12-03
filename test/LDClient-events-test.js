const { TestData } = require('../integrations');

const stubs = require('./stubs');

describe('LDClient - analytics events', () => {

  var eventProcessor;
  var defaultUser = { key: 'user' };  
  var anonymousUser = { key: 'anon-user', anonymous: true };  
  var userWithNoKey = { name: 'Keyless Joe' };
  var userWithEmptyKey = { key: '' };

  beforeEach(() => {
    eventProcessor = stubs.stubEventProcessor();
  });

  describe('feature event', () => {
    it('generates event for existing feature', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c'
      });
    });

    it('generates event for existing feature when user is anonymous', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', anonymousUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        context: anonymousUser,
        variation: 1,
        value: 'b',
        default: 'c'
      });
    });

    it('generates event for existing feature with reason', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variationDetail('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c',
        reason: { kind: 'FALLTHROUGH' }
      });
    });

    it('forces tracking when a matched rule has trackEvents set', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({ // TestData doesn't normally set trackEvents
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        rules: [
          {
            clauses: [ { attribute: 'key', op: 'in', values: [ defaultUser.key ] } ],
            variation: 0,
            id: 'rule-id',
            trackEvents: true
          }
        ],
        fallthrough: { variation: 1 },
        variations: ['a', 'b']
      });
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 0,
        value: 'a',
        default: 'c',
        trackEvents: true,
        reason: { kind: 'RULE_MATCH', ruleIndex: 0, ruleId: 'rule-id' }
      });
    });

    it('does not force tracking when a matched rule does not have trackEvents set', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        rules: [
          {
            clauses: [ { attribute: 'key', op: 'in', values: [ defaultUser.key ] } ],
            variation: 0,
            id: 'rule-id'
          }
        ],
        fallthrough: { variation: 1 },
        variations: ['a', 'b']
      });
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 0,
        value: 'a',
        default: 'c'
      });
    });

    it('forces tracking for fallthrough result when trackEventsFallthrough is set', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        rules: [],
        fallthrough: { variation: 1 },
        variations: ['a', 'b'],
        trackEventsFallthrough: true
      });
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c',
        trackEvents: true,
        reason: { kind: 'FALLTHROUGH' },
      });
    });

    it('forces tracking when an evaluation is in the tracked portion of an experiment rollout', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        rules: [],
        fallthrough: {
          rollout: {
            kind: 'experiment',
            variations: [
              {
                weight: 100000,
                variation: 1,
              },
            ],
          },
        },
        variations: ['a', 'b'],
      });
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c',
        trackEvents: true,
        reason: { kind: 'FALLTHROUGH', inExperiment: true },
      });
    });

    it('does not force tracking when an evaluation is in the untracked portion of an experiment rollout', async () => {
      const td = TestData();
      td.usePreconfiguredFlag({
        key: 'flagkey',
        version: 1,
        on: true,
        targets: [],
        rules: [],
        fallthrough: {
          rollout: {
            kind: 'experiment',
            variations: [
              {
                weight: 100000,
                variation: 1,
                untracked: true,
              },
            ],
          },
        },
        variations: ['a', 'b'],
      });
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c',
      });
    });

    it('does not force tracking for fallthrough result when trackEventsFallthrough is not set', async () => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      var client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', defaultUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toEqual({
        kind: 'feature',
        creationDate: e.creationDate,
        key: 'flagkey',
        version: 1,
        context: defaultUser,
        variation: 1,
        value: 'b',
        default: 'c'
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
        context: defaultUser,
        value: 'c',
        default: 'c'
      });
    });

    it('generates event for unknown feature when user is anonymous', async () => {
      var client = stubs.createClient({ eventProcessor: eventProcessor }, {});
      await client.waitForInitialization();
      await client.variation('flagkey', anonymousUser, 'c');

      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'feature',
        key: 'flagkey',
        context: anonymousUser,
        value: 'c',
        default: 'c'
      });
    });

    it.each([
      { name: 'Bob' },
      undefined,
      null,
      {
        kind: "multi",
        org: {
          // Missing key
          name: "bad org"
        },
        user: {
          key: "user-key"
        }
      },
      {
        kind: 'potato'
      },
      {
        kind: 'kind',
        key: 'bad'
      },
    ])('does not generate events for bad contexts', async (badContext) => {
      const td = TestData();
      td.update(td.flag('flagkey').on(true).variations('a', 'b').fallthroughVariation(1));
      const client = stubs.createClient({ eventProcessor, updateProcessor: td });
      await client.waitForInitialization();
      await client.variation('flagkey', badContext, 'c');

      expect(eventProcessor.events).toHaveLength(0);
    });

  });

  describe('identify', () => {
    it('generates an event', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();
      
      client.identify(defaultUser);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'identify',
        context: defaultUser
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not generate an event, and logs a warning, if user is missing', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();
      
      client.identify();
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('does not generate an event, and logs a warning, if user has no key', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();
      
      client.identify(userWithNoKey);
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('does not generate an event, and logs a warning, if user has empty key', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();
      
      client.identify(userWithEmptyKey);
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('track', () => {
    it('generates an event with data', async () => {
      var data = { thing: 'stuff' };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', defaultUser, data);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'custom',
        key: 'eventkey',
        context: defaultUser,
        data: data
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('generates an event without data', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', defaultUser);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'custom',
        key: 'eventkey',
        context: defaultUser
      });
      expect(e.metricValue).not.toBe(expect.anything());
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('generates an event with a metric value', async () => {
      var data = { thing: 'stuff' };
      var metricValue = 1.5;
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', defaultUser, data, metricValue);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'custom',
        key: 'eventkey',
        context: defaultUser,
        data: data,
        metricValue: metricValue
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('generates an event for an anonymous user', async () => {
      var data = { thing: 'stuff' };
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', anonymousUser, data);
      expect(eventProcessor.events).toHaveLength(1);
      var e = eventProcessor.events[0];
      expect(e).toMatchObject({
        kind: 'custom',
        key: 'eventkey',
        context: anonymousUser,
        data: data
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not generate an event, and logs a warning, if user is missing', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey');
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('does not generate an event, and logs a warning, if user has no key', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', userWithNoKey);
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('does not generate an event, and logs a warning, if user has empty key', async () => {
      var logger = stubs.stubLogger();
      var client = stubs.createClient({ eventProcessor: eventProcessor, logger: logger }, {});
      await client.waitForInitialization();

      client.track('eventkey', userWithEmptyKey);
      expect(eventProcessor.events).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
