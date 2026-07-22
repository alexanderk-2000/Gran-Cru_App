import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { offlineDb, getMeta } from '../../services/pwa/offlineDb.ts';
import { runSyncCycle } from '../../services/pwa/syncEngine.ts';

const USER_ID = 'user-1';

const resetOfflineTables = async () => {
  await Promise.all([
    offlineDb.wines.clear(),
    offlineDb.tastings.clear(),
    offlineDb.occasions.clear(),
    offlineDb.occasion_instances.clear(),
    offlineDb.occasion_wine_pool.clear(),
    offlineDb.inventory_events.clear(),
    offlineDb.cellar_pockets.clear(),
    offlineDb.write_queue.clear(),
    offlineDb.ai_queue.clear(),
    offlineDb.conflicts.clear(),
    offlineDb.meta.clear()
  ]);
};

const emptyReconciliationIds = {
  wines: [] as string[],
  occasions: [] as string[],
  occasion_instances: [] as string[],
  occasion_wine_pool: [] as string[]
};

// Every *Since()/*UpdatedSince() method the sync engine calls, defaulted to
// "nothing changed" - individual tests override only what they need.
const baseBackendService = () => ({
  getCurrentUser: async () => ({ id: USER_ID }),
  getWinesUpdatedSince: async () => [],
  getOccasionsUpdatedSince: async () => [],
  getOccasionInstancesUpdatedSince: async () => [],
  getOccasionWinePoolUpdatedSince: async () => [],
  getTastingsCreatedSince: async () => [],
  getConsumptionHistorySince: async () => [],
  getCellarPockets: async () => [],
  getSyncReconciliationIds: async () => emptyReconciliationIds
});

beforeEach(async () => {
  await resetOfflineTables();
});

afterEach(async () => {
  await resetOfflineTables();
});

describe('syncEngine delta pulls', () => {
  it('bulk-puts fetched deltas into Dexie and advances the sync cursor', async () => {
    const remoteWine = {
      id: 'wine-1',
      user_id: USER_ID,
      name: 'Delta Wine',
      vintage: 2020,
      region: 'Mosel',
      category: 'Genuss',
      quantity: 3,
      purchase_price: 25,
      format: '0.75L',
      drink_start: 2024,
      drink_end: 2032,
      wishlist: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    };

    const seenCursors: Array<string | null> = [];

    await runSyncCycle({
      ...baseBackendService(),
      getWinesUpdatedSince: async (cursor: string | null) => {
        seenCursors.push(cursor);
        return cursor === null ? [remoteWine] : [];
      },
      // Consistent with the delta fetch above: the server does have this wine.
      getSyncReconciliationIds: async () => ({ ...emptyReconciliationIds, wines: ['wine-1'] })
    });

    // pullDelta runs twice per cycle (before and after the write queue
    // flush) - the first call bootstraps with cursor=null, the second
    // already has a cursor because the first call just set one.
    expect(seenCursors[0]).toBeNull();
    expect(typeof seenCursors[1]).toBe('string');

    const stored = await offlineDb.wines.get('wine-1');
    expect(stored?.name).toBe('Delta Wine');

    const cursor = await getMeta<string>(`sync_cursor:${USER_ID}`);
    expect(typeof cursor).toBe('string');
  });

  it('removes a wine locally once it no longer exists remotely (hard-delete reconciliation)', async () => {
    await offlineDb.wines.bulkPut([
      { id: 'wine-keep', user_id: USER_ID, name: 'Keep', updated_at: '2026-01-01T00:00:00.000Z' } as any,
      { id: 'wine-purged', user_id: USER_ID, name: 'Purged', updated_at: '2026-01-01T00:00:00.000Z' } as any
    ]);

    await runSyncCycle({
      ...baseBackendService(),
      getSyncReconciliationIds: async () => ({ ...emptyReconciliationIds, wines: ['wine-keep'] })
    });

    expect(await offlineDb.wines.get('wine-keep')).toBeTruthy();
    expect(await offlineDb.wines.get('wine-purged')).toBeUndefined();
  });

  it('does not delete a locally-created wine while its write is still queued/unsynced', async () => {
    await offlineDb.wines.bulkPut([
      { id: 'wine-pending', user_id: USER_ID, name: 'Not yet synced', updated_at: '2026-01-01T00:00:00.000Z' } as any
    ]);
    await offlineDb.write_queue.put({
      id: 'wq-1',
      user_id: USER_ID,
      type: 'write',
      entity: 'wines',
      operation: 'saveWine',
      payload: { args: [{ id: 'wine-pending' }] },
      client_ts: new Date().toISOString(),
      status: 'queued',
      retry_count: 0,
      next_retry_at: null,
      dedupe_key: 'saveWine:test',
      last_error: null
    });

    await runSyncCycle({
      ...baseBackendService(),
      // The server genuinely has no wines at all yet - if the pending-write
      // guard didn't exist, reconciliation would (wrongly) delete wine-pending.
      getSyncReconciliationIds: async () => emptyReconciliationIds,
      // Still failing to reach the server, same as being offline.
      saveWine: async () => {
        throw new Error('network unavailable');
      }
    });

    expect(await offlineDb.wines.get('wine-pending')).toBeTruthy();
    const queueItem = await offlineDb.write_queue.get('wq-1');
    expect(queueItem?.status).toBe('failed');
  });
});
