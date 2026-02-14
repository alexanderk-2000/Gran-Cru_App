import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getMeta, offlineDb, persistFullDataset, setMeta } from '../../services/pwa/offlineDb.ts';

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

beforeEach(async () => {
  await resetOfflineTables();
});

describe('offlineDb', () => {
  it('stores and reads meta values', async () => {
    await setMeta('sync_state', { syncing: false, last_sync_error: null });
    const meta = await getMeta<{ syncing: boolean; last_sync_error: string | null }>('sync_state');

    expect(meta).toEqual({ syncing: false, last_sync_error: null });
  });

  it('persists full dataset snapshot', async () => {
    await persistFullDataset({
      user_id: 'user-1',
      pulled_at: new Date().toISOString(),
      wines: [
        {
          id: 'wine-1',
          user_id: 'user-1',
          name: 'Test Wine',
          vintage: 2019,
          region: 'Burgundy',
          category: 'Genuss',
          quantity: 2,
          purchase_price: 30,
          format: '0.75L',
          drink_start: 2024,
          drink_end: 2034,
          wishlist: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      deleted_wines: [],
      tastings: [],
      occasions: [],
      occasion_instances: [],
      occasion_wine_pool: [],
      cellar_pockets: [],
      inventory_events: []
    });

    const wines = await offlineDb.wines.toArray();
    const datasetMeta = await getMeta<Record<string, unknown>>('last_dataset_pull');

    expect(wines).toHaveLength(1);
    expect(wines[0].name).toBe('Test Wine');
    expect(datasetMeta?.user_id).toBe('user-1');
  });
});
