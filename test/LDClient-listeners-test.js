const { TestData } = require('../integrations');

const { withClient } = require('./stubs');
import { AsyncQueue } from 'launchdarkly-js-test-helpers';
import { makeFlagWithSegmentMatch } from './evaluator_helpers';

describe('LDClient event listeners', () => {
  describe('flag change events', () => {
    it('sends event when flag is added', async () => {
      const td = TestData();
      await withClient({ updateProcessor: td }, async client => {
        const changes = new AsyncQueue();
        client.on('update', params => changes.add(params));

        td.update(td.flag('new-flag'));

        const change = await changes.take();
        expect(change.key).toEqual('new-flag');
      });
    });

    it('sends event when flag is updated', async () => {
      const td = TestData();
      td.update(td.flag('flag1').on(true));
      td.update(td.flag('flag2').on(true));

      await withClient({ updateProcessor: td }, async client => {
        const changes = new AsyncQueue();
        const flag2Changes = new AsyncQueue();
        client.on('update', params => changes.add(params));
        client.on('update:flag2', params => flag2Changes.add(params));

        td.update(td.flag('flag1').on(false));
        td.update(td.flag('flag2').on(false));

        const change1 = await changes.take();
        expect(change1.key).toEqual('flag1');
        const change2 = await changes.take();
        expect(change2.key).toEqual('flag2');

        const flag2Change = await flag2Changes.take();
        expect(flag2Change.key).toEqual('flag2');
      });
    });

    it('sends an event when a segment used by a flag is updated', async () => {
      const td = TestData();
      const segment  = {
        key: 'segment1',
        includedContexts: [ {contextKind: 'org', values: ['org-key']} ],
        version: 1
      };

      td.usePreconfiguredSegment(segment);
      td.usePreconfiguredFlag(makeFlagWithSegmentMatch(segment));

      await withClient({ updateProcessor: td }, async client => {
        const flagChanges = new AsyncQueue();
        client.on('update:feature', params => flagChanges.add(params));

        td.usePreconfiguredSegment({
          key: 'segment1',
          includedContexts: [ {contextKind: 'org', values: ['org-key', 'second-key']} ],
          version: 2
        });

        const flagChange = await flagChanges.take();
        expect(flagChange.key).toEqual('feature');
      });
    });
  });

  it('sends an event for a nested segment update', async () => {
    const td = TestData();
    const segment1 = {
      key: 'segment1',
      includedContexts: [ {contextKind: 'org', values: ['org-key']} ],
      version: 1
    };
    const segment2 = {
      key: 'segment2',
      rules: [
        {
          clauses: [ { attribute: '', op: 'segmentMatch', values: [segment1.key] } ],
          weight: 100000
        }
      ],
      version: 1
    };
    td.usePreconfiguredSegment(segment1);
    td.usePreconfiguredSegment(segment2);
    td.usePreconfiguredFlag(makeFlagWithSegmentMatch(segment2));

    await withClient({ updateProcessor: td }, async client => {
      const flagChanges = new AsyncQueue();
      client.on('update:feature', params => flagChanges.add(params));

      td.usePreconfiguredSegment({
        key: 'segment1',
        includedContexts: [ {contextKind: 'org', values: ['org-key', 'second-key']} ],
        version: 2
      });

      const flagChange = await flagChanges.take();
      expect(flagChange.key).toEqual('feature');
    });
  });

  it('does not hang on circular segment dependencies', async () => {
    const td = TestData();
    const segment1 = {
      key: 'segment1',
      clauses: [ { attribute: '', op: 'segmentMatch', values: ['segment2'] } ],
      version: 1
    };
    const segment2 = {
      key: 'segment2',
      rules: [
        {
          clauses: [ { attribute: '', op: 'segmentMatch', values: [segment1.key] } ],
          weight: 100000
        }
      ],
      version: 1
    };
    
    td.usePreconfiguredSegment(segment1);
    td.usePreconfiguredSegment(segment2);
    td.usePreconfiguredFlag(makeFlagWithSegmentMatch(segment2));

    // The implementation happens to produce the event anyway,
    // but what we really care  about is that it doesn't hang.
    // So, if in the future, it didn't produce an event for this malformed flag,
    // then that would likely be ok. The malformed nature of a circular
    // dependency should be transient.
    await withClient({ updateProcessor: td }, async client => {
      const flagChanges = new AsyncQueue();
      client.on('update:feature', params => flagChanges.add(params));

      td.usePreconfiguredSegment({
        key: 'segment1',
        includedContexts: [ {contextKind: 'org', values: ['org-key', 'second-key']} ],
        version: 2
      });

      const flagChange = await flagChanges.take();
      expect(flagChange.key).toEqual('feature');
    });
  });

  describe('bigSegmentStoreStatusProvider', () => {
    it('returns unavailable status when not configured', async () => {
      await withClient({}, async client => {
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
      await withClient(config, async client => {
        const status1 = await client.bigSegmentStoreStatusProvider.requireStatus();
        expect(status1.available).toBe(true);

        const statuses = new AsyncQueue();
        client.bigSegmentStoreStatusProvider.on('change', s => statuses.add(s));

        store.getMetadata = async () => { throw new Exception('sorry'); };

        const status2 = await statuses.take();
        expect(status2.available).toBe(false);
      });
    });
  });
});
