import * as selfsigned from 'selfsigned';

import * as LDClient from '../index';
import * as httpServer from './http_server';
import * as stubs from './stubs';

describe('LDClient TLS configuration', () => {
  const sdkKey = 'secret';
  let logger = stubs.stubLogger();
  let server;
  let certData;

  beforeEach(async () => {
    certData = await makeSelfSignedPems();
    const serverOptions = { key: certData.private, cert: certData.cert, ca: certData.public };
    server = await httpServer.createServer(true, serverOptions);
  });

  afterEach(() => {
    httpServer.closeServers();
  });

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
    httpServer.autoRespond(server, res => httpServer.respondJson(res, {}));
    const config = {
      baseUri: server.url,
      sendEvents: false,
      stream: false,
      logger: stubs.stubLogger(),
      tlsParams: { ca: certData.cert },
    };
    const client = LDClient.init(sdkKey, config);
    await client.waitForInitialization();
    client.close();
  });

  it('cannot connect via HTTPS to a server with a self-signed certificate, using default config', async () => {
    httpServer.autoRespond(server, res => httpServer.respondJson(res, {}));
    const config = {
      baseUri: server.url,
      sendEvents: false,
      stream: false,
      logger: stubs.stubLogger(),
    };
    const client = LDClient.init(sdkKey, config);
    await expect(client.waitForInitialization()).rejects.toThrow(/self signed/);
  });

  it('can use custom TLS options for streaming as well as polling', async () => {
    const eventData = { data: { flags: { flag: { version: 1 } }, segments: {} } };
    server.on('request', (req, res) => {
      if (req.url.match(/\/stream/)) {
        httpServer.respondSSEEvent(res, 'put', eventData);
      } else {
        httpServer.respondJson(res, {});
      }
    });

    const config = {
      baseUri: server.url,
      streamUri: server.url + '/stream',
      sendEvents: false,
      logger: logger,
      tlsParams: { ca: certData.cert },
    };

    const client = LDClient.init(sdkKey, config);
    await client.waitForInitialization(); // this won't return until the stream receives the "put" event
    client.close();
  });

  it('can use custom TLS options for posting events', async () => {
    let receivedEventFn;
    const receivedEvent = new Promise(resolve => {
      receivedEventFn = resolve;
    });

    server.on('request', (req, res) => {
      if (req.url.match(/\/events/)) {
        httpServer.readAll(req).then(body => {
          receivedEventFn(body);
          httpServer.respond(res, 200);
        });
      } else {
        httpServer.respondJson(res, {});
      }
    });

    const config = {
      baseUri: server.url,
      eventsUri: server.url + '/events',
      stream: false,
      logger: stubs.stubLogger(),
      tlsParams: { ca: certData.cert },
    };

    const client = LDClient.init(sdkKey, config);
    await client.waitForInitialization();
    client.identify({ key: 'user' });
    await client.flush();

    const receivedEventBody = await receivedEvent;
    const eventData = JSON.parse(receivedEventBody);
    expect(eventData.length).toEqual(1);
    expect(eventData[0].kind).toEqual('identify');
    client.close();
  });
});
