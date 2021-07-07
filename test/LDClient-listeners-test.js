var LDClient = require('../index.js');
var messages = require('../messages');
var stubs = require('./stubs');
import { exception } from 'console';
import { AsyncQueue, withCloseable } from 'launchdarkly-js-test-helpers';

describe('LDClient event listeners', () => {
  describe('bigSegmentStoreStatusProvider', () => {
    it('returns unavailable status when not configured', async () => {
      await withCloseable(stubs.createClient(), async client => {
        expect(client.bigSegmentStoreStatusProvider.getStatus()).toBeUndefined();
        const status = await client.bigSegmentStoreStatusProvider.requireStatus();
        expect(status.available).toBe(false);
        expect(status.stale).toBe(false);
      });
    });

    it('sends status updates', async () => {
      const store = {
        getMetadata: async () => { return { lastUpToDate: new Date().getTime() }; },
      };
      const config = { bigSegments: { store: () => store, statusPollInterval: 0.01 } };
      await withCloseable(stubs.createClient(config), async client => {
        const status1 = await client.bigSegmentStoreStatusProvider.requireStatus();
        expect(status1.available).toBe(true);

        const statuses = new AsyncQueue();
        client.bigSegmentStoreStatusProvider.on('change', s => statuses.add(s));

        store.getMetadata = async () => { throw new exception('sorry'); };

        const status2 = await statuses.take();
        expect(status2.available).toBe(false);
      });
    });
  });
});

