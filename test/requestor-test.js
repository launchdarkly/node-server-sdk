import Requestor from '../requestor';
import * as dataKind from '../versioned_data_kind';
import { promisify, withCloseable } from './async_utils';
import { createServer, respond, respondJson } from './http_server';

describe('Requestor', () => {
  const sdkKey = 'x';
  const badUri = 'http://bad-uri';
  const someData = { key: { version: 1 } };
  const allData = { flags: someData, segments: someData };

  describe('requestObject', () => {
    it('gets flag data', async () =>
      await withCloseable(createServer, async server => {
        server.forMethodAndPath('get', '/sdk/latest-flags/key', respondJson(someData));
        const r = Requestor(sdkKey, { baseUri: server.url });
        const result = await promisify(r.requestObject)(dataKind.features, 'key');
        expect(JSON.parse(result)).toEqual(someData);
      })
    );
  
    it('gets segment data', async () =>
      await withCloseable(createServer, async server => {
        server.forMethodAndPath('get', '/sdk/latest-segments/key', respondJson(someData));
        const r = Requestor(sdkKey, { baseUri: server.url });
        const result = await promisify(r.requestObject)(dataKind.segments, 'key');
        expect(JSON.parse(result)).toEqual(someData);
      })
    );

    it('returns error result for HTTP error', async () =>
      await withCloseable(createServer, async server => {
        server.forMethodAndPath('get', '/sdk/latest-flags/key', respond(404));
        const r = Requestor(sdkKey, { baseUri: server.url });
        const req = promisify(r.requestObject)(dataKind.features, 'key');
        await expect(req).rejects.toThrow(/404/);
      })
    );

    it('returns error result for network error', async () => {
      const r = Requestor(sdkKey, { baseUri: badUri });
      const req = promisify(r.requestObject)(dataKind.features, 'key');
      await expect(req).rejects.toThrow(/bad-uri/);
    });
  });

  describe('requestAllData', () => {
    it('gets data', async () =>
      await withCloseable(createServer, async server => {
        server.forMethodAndPath('get', '/sdk/latest-all', respondJson(allData));
        const r = Requestor(sdkKey, { baseUri: server.url });
        const result = await promisify(r.requestAllData)();
        expect(JSON.parse(result)).toEqual(allData);
      })
    );

    it('returns error result for HTTP error', async () =>
      await withCloseable(createServer, async server => {
        server.forMethodAndPath('get', '/sdk/latest-all', respond(401));
        const r = Requestor(sdkKey, { baseUri: server.url });
        const req = promisify(r.requestAllData)();
        await expect(req).rejects.toThrow(/401/);
      })
    );

    it('returns error result for network error', async () => {
      const r = Requestor(sdkKey, { baseUri: badUri });
      const req = promisify(r.requestAllData)();
      await expect(req).rejects.toThrow(/bad-uri/);
    });
  });
});
