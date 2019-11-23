const LDClient = require('../index.js');
import { AsyncQueue, TestHttpHandlers, TestHttpServer, withCloseable } from 'launchdarkly-js-test-helpers';
import { stubLogger } from './stubs';

async function withAllServers(asyncCallback) {
  return await withCloseable(TestHttpServer.start, async pollingServer =>
    withCloseable(TestHttpServer.start, async streamingServer =>
      withCloseable(TestHttpServer.start, async eventsServer => {
        const servers = { polling: pollingServer, streaming: streamingServer, events: eventsServer };
        const baseConfig = {
          baseUri: pollingServer.url,
          streamUri: streamingServer.url,
          eventsUri: eventsServer.url,
          logger: stubLogger()
        };
        return await asyncCallback(servers, baseConfig);
      })
    )
  );
}

describe('LDClient end-to-end', () => {
  const sdkKey = 'sdkKey';
  const flagKey = 'flagKey';
  const expectedFlagValue = 'yes';
  const flag = {
    key: flagKey,
    version: 1,
    on: false,
    offVariation: 0,
    variations: [ expectedFlagValue, 'no' ]
  };
  const allData = { flags: { flagKey: flag }, segments: {} };

  const user = { key: 'userKey' };

  it('starts in polling mode', async () => {
    await withAllServers(async (servers, config) => {
      servers.polling.forMethodAndPath('get', '/sdk/latest-all', TestHttpHandlers.respondJson(allData));
      servers.events.forMethodAndPath('post', '/bulk', TestHttpHandlers.respond(200));

      config.stream = false;
      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await client.waitForInitialization();
        expect(client.initialized()).toBe(true);

        const value = await client.variation(flag.key, user);
        expect(value).toEqual(expectedFlagValue);

        await client.flush();
      });

      expect(servers.polling.requestCount()).toEqual(1);
      expect(servers.streaming.requestCount()).toEqual(0);
      expect(servers.events.requestCount()).toEqual(1);
    });
  });
  
  it('fails in polling mode with 401 error', async () => {
    await withAllServers(async (servers, config) => {
      servers.polling.forMethodAndPath('get', '/sdk/latest-all', TestHttpHandlers.respond(401));
      servers.events.forMethodAndPath('post', '/bulk', TestHttpHandlers.respond(200));

      config.stream = false;

      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await expect(client.waitForInitialization()).rejects.toThrow();
        expect(client.initialized()).toBe(false);
      });

      expect(servers.polling.requestCount()).toEqual(1);
      expect(servers.streaming.requestCount()).toEqual(0);
    });
  });

  it('starts in streaming mode', async () => {
    await withAllServers(async (servers, config) => {
      const streamEvent = { type: 'put', data: JSON.stringify({ data: allData }) };
      await withCloseable(new AsyncQueue(), async events => {
        events.add(streamEvent);
        servers.streaming.forMethodAndPath('get', '/all', TestHttpHandlers.sseStream(events));
        servers.events.forMethodAndPath('post', '/bulk', TestHttpHandlers.respond(200));

        await withCloseable(LDClient.init(sdkKey, config), async client => {
          await client.waitForInitialization();
          expect(client.initialized()).toBe(true);

          const value = await client.variation(flag.key, user);
          expect(value).toEqual(expectedFlagValue);

          await client.flush();  
        });

        expect(servers.polling.requestCount()).toEqual(0);
        expect(servers.streaming.requestCount()).toEqual(1);
        expect(servers.events.requestCount()).toEqual(1);
      });
    });
  });

  it('fails in streaming mode with 401 error', async () => {
    await withAllServers(async (servers, config) => {
      servers.streaming.forMethodAndPath('get', '/all', TestHttpHandlers.respond(401));
      servers.events.forMethodAndPath('post', '/bulk', TestHttpHandlers.respond(200));

      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await expect(client.waitForInitialization()).rejects.toThrow();
        expect(client.initialized()).toBe(false);
      });

      expect(servers.polling.requestCount()).toEqual(0);
      expect(servers.streaming.requestCount()).toEqual(1);
    });
  });
});
