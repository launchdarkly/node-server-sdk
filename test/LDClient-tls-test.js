import * as selfsigned from 'selfsigned';

import * as LDClient from '../index';
import { AsyncQueue, sleepAsync, withCloseable } from './async_utils';
import { createServer, respond, respondJson, respondSSE } from './http_server';
import * as stubs from './stubs';

describe('LDClient TLS configuration', () => {
  const sdkKey = 'secret';
  let logger = stubs.stubLogger();
  let certData;

  beforeAll(async () => {
    certData = await makeSelfSignedPems();
  });

  async function createSecureServer() {
    const serverOptions = { key: certData.private, cert: certData.cert, ca: certData.public };
    return await createServer(true, serverOptions);
  }

  async function makeSelfSignedPems() {
    const certAttrs = [{ name: 'commonName', value: 'localhost' }];
    const certOptions = {
      // This part is based on code within the selfsigned package
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [{ type: 6, value: 'https://localhost' }],
        },
      ],
    };
    return await selfsigned.generate(certAttrs, certOptions);
  }

  it('can connect via HTTPS to a server with a self-signed certificate, if CA is specified', async () => {
    await withCloseable(createSecureServer, async server => {
      server.forMethodAndPath('get', '/sdk/latest-all', respondJson({}));

      const config = {
        baseUri: server.url,
        sendEvents: false,
        stream: false,
        logger: stubs.stubLogger(),
        tlsParams: { ca: certData.cert },
      };
      
      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await client.waitForInitialization();
      });
    });
  });

  it('cannot connect via HTTPS to a server with a self-signed certificate, using default config', async () => {
    await withCloseable(createSecureServer, async server => {
      server.forMethodAndPath('get', '/sdk/latest-all', respondJson({}));

      const config = {
        baseUri: server.url,
        sendEvents: false,
        stream: false,
        logger: stubs.stubLogger(),
      };

      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await sleepAsync(300); // the client won't signal an unrecoverable error, but it should log a message
        expect(config.logger.warn.mock.calls.length).toEqual(2);
        expect(config.logger.warn.mock.calls[1][0]).toMatch(/self signed/);
      });
    });
  });

  it('can use custom TLS options for streaming as well as polling', async () => {
    await withCloseable(createSecureServer, async server => {
      const eventData = { data: { flags: { flag: { version: 1 } }, segments: {} } };
      await withCloseable(AsyncQueue(), async events => {
        events.add({ type: 'put', data: eventData });
        server.forMethodAndPath('get', '/stream/all', respondSSE(events));

        const config = {
          baseUri: server.url,
          streamUri: server.url + '/stream',
          sendEvents: false,
          logger: logger,
          tlsParams: { ca: certData.cert },
        };

        await withCloseable(LDClient.init(sdkKey, config), async client => {
          await client.waitForInitialization(); // this won't return until the stream receives the "put" event
        });
      });
    });
  });

  it('can use custom TLS options for posting events', async () => {
    await withCloseable(createSecureServer, async server => {
      server.forMethodAndPath('post', '/events/bulk', respond(200));
      server.forMethodAndPath('get', '/sdk/latest-all', respondJson({}));

      const config = {
        baseUri: server.url,
        eventsUri: server.url + '/events',
        stream: false,
        logger: stubs.stubLogger(),
        tlsParams: { ca: certData.cert },
      };

      await withCloseable(LDClient.init(sdkKey, config), async client => {
        await client.waitForInitialization();
        client.identify({ key: 'user' });
        await client.flush();

        const flagsRequest = await server.nextRequest();
        expect(flagsRequest.path).toEqual('/sdk/latest-all');
        
        const eventsRequest = await server.nextRequest();
        expect(eventsRequest.path).toEqual('/events/bulk');
        const eventData = JSON.parse(eventsRequest.body);
        expect(eventData.length).toEqual(1);
        expect(eventData[0].kind).toEqual('identify');
      });
    });
  });
});
