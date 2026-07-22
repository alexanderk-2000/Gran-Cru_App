import Dexie, { type Table } from 'dexie';
import type {
  CellarPocket,
  Occasion,
  OccasionInstance,
  OccasionWinePoolEntry,
  Tasting,
  Wine,
} from '../../types.ts';
import type {
  FullDatasetSnapshot,
  OfflineMetaRecord,
  OfflineQueueItem,
  SyncConflictRecord,
  SyncStateSnapshot,
} from './types.ts';

interface InventoryEventRow {
  id: string;
  user_id?: string;
  [key: string]: unknown;
}

export class PwaOfflineDb extends Dexie {
  wines!: Table<Wine, string>;
  tastings!: Table<Tasting, string>;
  occasions!: Table<Occasion, string>;
  occasion_instances!: Table<OccasionInstance, string>;
  occasion_wine_pool!: Table<OccasionWinePoolEntry, string>;
  inventory_events!: Table<InventoryEventRow, string>;
  cellar_pockets!: Table<CellarPocket, string>;
  write_queue!: Table<OfflineQueueItem, string>;
  // Legacy table retained temporarily so old external-request entries can be removed.
  ai_queue!: Table<Record<string, unknown> & { id: string; user_id: string }, string>;
  conflicts!: Table<SyncConflictRecord, string>;
  meta!: Table<OfflineMetaRecord, string>;

  constructor() {
    super('grand_cru_vault_pwa');
    this.version(1).stores({
      wines: 'id, user_id, updated_at, deleted_at',
      tastings: 'id, wine_id, user_id, date',
      occasions: 'id, user_id, updated_at',
      occasion_instances: 'id, occasion_id, user_id, updated_at, instance_date',
      occasion_wine_pool: 'id, occasion_id, wine_id, user_id',
      inventory_events: 'id, wine_id, user_id, timestamp',
      cellar_pockets: 'id, user_id, updated_at, name',
      write_queue: 'id, user_id, status, client_ts, operation, dedupe_key, next_retry_at',
      ai_queue: 'id, user_id, status, client_ts, operation, dedupe_key, next_retry_at',
      conflicts: 'id, user_id, entity, entity_id, created_at',
      meta: 'key, updated_at',
    });
    this.version(2).stores({
      wines: 'id, user_id, updated_at, deleted_at, barcode',
    });
  }
}

export const offlineDb = new PwaOfflineDb();

export const createLocalId = (prefix: string): string => {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${id}`;
};

export const getMeta = async <T>(key: string): Promise<T | null> => {
  const row = await offlineDb.meta.get(key);
  return (row?.value as T | undefined) ?? null;
};

export const setMeta = async (key: string, value: unknown): Promise<void> => {
  await offlineDb.meta.put({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
};

export const clearUserData = async (userId: string): Promise<void> => {
  await offlineDb.transaction(
    'rw',
    [
      offlineDb.wines,
      offlineDb.tastings,
      offlineDb.occasions,
      offlineDb.occasion_instances,
      offlineDb.occasion_wine_pool,
      offlineDb.inventory_events,
      offlineDb.cellar_pockets,
      offlineDb.write_queue,
      offlineDb.ai_queue,
      offlineDb.conflicts,
    ],
    async () => {
      await offlineDb.wines.where('user_id').equals(userId).delete();
      await offlineDb.tastings.where('user_id').equals(userId).delete();
      await offlineDb.occasions.where('user_id').equals(userId).delete();
      await offlineDb.occasion_instances.where('user_id').equals(userId).delete();
      await offlineDb.occasion_wine_pool.where('user_id').equals(userId).delete();
      await offlineDb.inventory_events.where('user_id').equals(userId).delete();
      await offlineDb.cellar_pockets.where('user_id').equals(userId).delete();
      await offlineDb.write_queue.where('user_id').equals(userId).delete();
      await offlineDb.ai_queue.where('user_id').equals(userId).delete();
      await offlineDb.conflicts.where('user_id').equals(userId).delete();
    }
  );
};

export const persistFullDataset = async (snapshot: FullDatasetSnapshot): Promise<void> => {
  const allWines = [...snapshot.wines, ...snapshot.deleted_wines];

  await offlineDb.transaction(
    'rw',
    [
      offlineDb.wines,
      offlineDb.tastings,
      offlineDb.occasions,
      offlineDb.occasion_instances,
      offlineDb.occasion_wine_pool,
      offlineDb.inventory_events,
      offlineDb.cellar_pockets,
    ],
    async () => {
      await offlineDb.wines.bulkPut(allWines);
      await offlineDb.tastings.bulkPut(snapshot.tastings);
      await offlineDb.occasions.bulkPut(snapshot.occasions);
      await offlineDb.occasion_instances.bulkPut(snapshot.occasion_instances);
      await offlineDb.occasion_wine_pool.bulkPut(snapshot.occasion_wine_pool);
      await offlineDb.cellar_pockets.bulkPut(snapshot.cellar_pockets);
      if (snapshot.inventory_events.length > 0) {
        await offlineDb.inventory_events.bulkPut(
          snapshot.inventory_events.map((entry) => ({
            id: String(entry.id || createLocalId('evt')),
            ...entry,
          }))
        );
      }
    }
  );

  await setMeta('last_dataset_pull', {
    user_id: snapshot.user_id,
    pulled_at: snapshot.pulled_at,
    wine_count: snapshot.wines.length,
    deleted_wine_count: snapshot.deleted_wines.length,
    tasting_count: snapshot.tastings.length,
  });
};

export const findWinesByBarcodeLocal = async (userId: string, barcode: string): Promise<Wine[]> => {
  const normalized = barcode.trim();
  if (!normalized) return [];
  return offlineDb.wines
    .where('barcode')
    .equals(normalized)
    .filter((wine) => wine.user_id === userId && !wine.deleted_at)
    .toArray();
};

export const getSyncStateSnapshot = async (): Promise<SyncStateSnapshot> => {
  const [meta, writePending, writeFailed] = await Promise.all([
    getMeta<Partial<SyncStateSnapshot>>('sync_state'),
    offlineDb.write_queue.where('status').equals('queued').count(),
    offlineDb.write_queue.where('status').equals('failed').count(),
  ]);

  return {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    last_sync_started_at: meta?.last_sync_started_at || null,
    last_sync_completed_at: meta?.last_sync_completed_at || null,
    last_sync_error: meta?.last_sync_error || null,
    syncing: Boolean(meta?.syncing),
    write_queue_pending: writePending,
    write_queue_failed: writeFailed,
  };
};
