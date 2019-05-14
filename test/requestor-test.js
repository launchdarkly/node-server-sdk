import Requestor from '../requestor';
import * as dataKind from '../versioned_data_kind';
import { asyncifyNode } from './async_utils';
import * as httpServer from './http_server';

describe('Requestor', () => {
  const sdkKey = 'x';
  const badUri = 'http://bad-uri';
  const someData = { key: { version: 1 } };
  const allData = { flags: someData, segments: someData };

  let server;
  let config;

  beforeEach(async () => {
    server = await httpServer.createServer();
    config = { baseUri: server.url };
  });

  afterEach(() => {
    httpServer.closeServers();
  });

  describe('requestObject', () => {
    it('uses correct flag URL', async () => {
      httpServer.autoRespond(server, res => httpServer.respondJson(res, {}));
      const r = Requestor(sdkKey, config);
      await asyncifyNode(cb => r.requestObject(dataKind.features, 'key', cb));
      expect(server.requests.length).toEqual(1);
      expect(server.requests[0].url).toEqual('/sdk/latest-flags/key');
    });
  
    it('uses correct segment URL', async () => {
      httpServer.autoRespond(server, res => httpServer.respondJson(res, {}));
      const r = Requestor(sdkKey, config);
      await asyncifyNode(cb => r.requestObject(dataKind.segments, 'key', cb));
      expect(server.requests.length).toEqual(1);
      expect(server.requests[0].url).toEqual('/sdk/latest-segments/key');
    });

    it('returns successful result', async () => {
      httpServer.autoRespond(server, res => httpServer.respondJson(res, someData));
      const r = Requestor(sdkKey, config);
      const result = await asyncifyNode(cb => r.requestObject(dataKind.features, 'key', cb));
      expect(JSON.parse(result)).toEqual(someData);
    });

    it('returns error result for HTTP error', async () => {
      httpServer.autoRespond(server, res => httpServer.respond(res, 404));
      const r = Requestor(sdkKey, config);
      const req = asyncifyNode(cb => r.requestObject(dataKind.features, 'key', cb));
      await expect(req).rejects.toThrow(/404/);
    });

    it('returns error result for network error', async () => {
      config.baseUri = badUri;
      const r = Requestor(sdkKey, config);
      const req = asyncifyNode(cb => r.requestObject(dataKind.features, 'key', cb));
      await expect(req).rejects.toThrow(/bad-uri/);
    });
  });

  describe('requestAllData', () => {
    it('uses correct URL', async () => {
      httpServer.autoRespond(server, res => httpServer.respondJson(res, {}));
      const r = Requestor(sdkKey, config);
      await asyncifyNode(cb => r.requestAllData(cb));
      expect(server.requests.length).toEqual(1);
      expect(server.requests[0].url).toEqual('/sdk/latest-all');
    });

    it('returns successful result', async () => {
      httpServer.autoRespond(server, res => httpServer.respondJson(res, allData));
      const r = Requestor(sdkKey, config);
      const result = await asyncifyNode(cb => r.requestAllData(cb));
      expect(JSON.parse(result)).toEqual(allData);
    });

    it('returns error result for HTTP error', async () => {
      httpServer.autoRespond(server, res => httpServer.respond(res, 404));
      const r = Requestor(sdkKey, config);
      const req = asyncifyNode(cb => r.requestAllData(cb));
      await expect(req).rejects.toThrow(/404/);
    });

    it('returns error result for network error', async () => {
      config.baseUri = badUri;
      const r = Requestor(sdkKey, config);
      const req = asyncifyNode(cb => r.requestAllData(cb));
      await expect(req).rejects.toThrow(/bad-uri/);
    });
  });
});
