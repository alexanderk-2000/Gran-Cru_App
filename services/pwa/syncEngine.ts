import { offlineDb, clearUserData, createLocalId, getMeta, setMeta } from './offlineDb.ts';
import type { OfflineQueueItem, QueueOperationInput, SyncStateSnapshot } from './types.ts';
import { isOnline } from './networkState.ts';
import { resolveLastWriteWins } from './conflictResolver.ts';
import { flushAiQueueForUser } from './aiQueueProcessor.ts';
import { emitQueueSnapshot } from './aiQueue.ts';
import type { Wine } from '../../types.ts';

const WRITE_BACKOFF_MS = [2000, 5000, 15000, 60000, 300000];
let syncLoopBound = false;
let syncInFlight = false;

const toJsonSafe = (value: unknown): Record<string, unknown> => ({
  payload: value
});

const hashDedupe = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const nextRetryAt = (retryCount: number): string | null => {
  const idx = Math.min(retryCount, WRITE_BACKOFF_MS.length - 1);
  return new Date(Date.now() + WRITE_BACKOFF_MS[idx]).toISOString();
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown sync error';
};

const getCurrentUserId = async (backendService: any): Promise<string | null> => {
  try {
    const user = await backendService.getCurrentUser?.();
    return user?.id || null;
  } catch {
    return null;
  }
};

export const enqueueWriteOperation = async (params: {
  userId: string;
  operation: QueueOperationInput;
}): Promise<OfflineQueueItem> => {
  const serialized = JSON.stringify(params.operation.args || []);
  const item: OfflineQueueItem = {
    id: createLocalId('wq'),
    user_id: params.userId,
    type: 'write',
    entity: params.operation.entity,
    operation: params.operation.operation,
    payload: {
      args: params.operation.args
    },
    client_ts: new Date().toISOString(),
    status: 'queued',
    retry_count: 0,
    next_retry_at: null,
    dedupe_key: params.operation.dedupe_key || `${params.operation.operation}:${hashDedupe(serialized)}`,
    last_error: null
  };

  await offlineDb.write_queue.put(item);
  await emitQueueSnapshot();
  return item;
};

const syncCursorKey = (userId: string): string => `sync_cursor:${userId}`;

const mergeWinesWithConflictResolution = async (userId: string, remoteWines: Wine[]): Promise<Wine[]> => {
  const merged: Wine[] = [];
  for (const remoteWine of remoteWines) {
    const localWine = await offlineDb.wines.get(remoteWine.id);
    const resolution = resolveLastWriteWins<Wine>({
      userId,
      entity: 'wines',
      local: localWine || null,
      remote: remoteWine
    });

    merged.push(resolution.resolved);
    if (resolution.conflict) {
      await offlineDb.conflicts.put(resolution.conflict);
    }
  }
  return merged;
};

// A write still sitting in the queue means its entity might only exist
// locally (e.g. a wine created while offline, not yet on the server) - the
// reconciliation pass below must never delete something the queue is still
// trying to create/update, so it stays disabled until the queue is empty.
const hasPendingWrites = async (userId: string): Promise<boolean> => {
  // Not filtering by next_retry_at here (unlike processWriteQueue): even a
  // write still waiting out its backoff window is unresolved work, so
  // reconciliation must stay disabled until it either succeeds or dead-letters.
  const count = await offlineDb.write_queue
    .where('user_id')
    .equals(userId)
    .filter((item) => item.status === 'queued' || (item.status === 'failed' && item.retry_count < 7))
    .count();
  return count > 0;
};

// Delta pulls (below) only ever see rows with a fresh updated_at/created_at -
// they can't detect a row that was actually DELETEd server-side (wines via
// permanentlyDeleteWine/emptyTrash; occasions - cascading to instances and
// pool entries - via deleteOccasion). This diffs the full remote id set
// (cheap: id column only) against the local cache and drops anything no
// longer present remotely, without needing a tombstone table.
const reconcileHardDeletes = async (backendService: any, userId: string): Promise<void> => {
  if (typeof backendService.getSyncReconciliationIds !== 'function') return;
  if (await hasPendingWrites(userId)) return;

  const remoteIds = await backendService.getSyncReconciliationIds();

  const [localWineIds, localOccasionIds, localInstanceIds, localPoolIds] = await Promise.all([
    offlineDb.wines.where('user_id').equals(userId).primaryKeys(),
    offlineDb.occasions.where('user_id').equals(userId).primaryKeys(),
    offlineDb.occasion_instances.where('user_id').equals(userId).primaryKeys(),
    offlineDb.occasion_wine_pool.where('user_id').equals(userId).primaryKeys()
  ]);

  const remoteWineSet = new Set<string>(remoteIds.wines || []);
  const remoteOccasionSet = new Set<string>(remoteIds.occasions || []);
  const remoteInstanceSet = new Set<string>(remoteIds.occasion_instances || []);
  const remotePoolSet = new Set<string>(remoteIds.occasion_wine_pool || []);

  const staleWineIds = localWineIds.filter((id) => !remoteWineSet.has(id as string));
  const staleOccasionIds = localOccasionIds.filter((id) => !remoteOccasionSet.has(id as string));
  const staleInstanceIds = localInstanceIds.filter((id) => !remoteInstanceSet.has(id as string));
  const stalePoolIds = localPoolIds.filter((id) => !remotePoolSet.has(id as string));

  if (staleWineIds.length > 0) await offlineDb.wines.bulkDelete(staleWineIds);
  if (staleOccasionIds.length > 0) await offlineDb.occasions.bulkDelete(staleOccasionIds);
  if (staleInstanceIds.length > 0) await offlineDb.occasion_instances.bulkDelete(staleInstanceIds);
  if (stalePoolIds.length > 0) await offlineDb.occasion_wine_pool.bulkDelete(stalePoolIds);
};

// Replaces the old "pull every row of every table, every cycle" approach
// (buildFullDataset/pullFullDataset) with a cursor: each table is fetched
// only for what changed since the last successful sync. A user with no
// stored cursor yet (first-ever sync) gets `cursor = null`, which each
// *Since()/*UpdatedSince() method treats as "everything" - so this doubles
// as the bootstrap path too. See docs/WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md
// (architecture finding #4 / performance finding #1-2) for the problem this
// replaces: a full re-pull plus one request per wine for tastings and one
// per occasion for the wine pool, on every single sync cycle.
const pullDelta = async (backendService: any, userId: string): Promise<void> => {
  const cursorKey = syncCursorKey(userId);
  const cursor = await getMeta<string>(cursorKey);
  const nextCursor = new Date().toISOString();

  const [wines, occasions, occasionInstances, occasionWinePool, tastings, inventoryEvents, cellarPockets] = await Promise.all([
    backendService.getWinesUpdatedSince?.(cursor) ?? [],
    backendService.getOccasionsUpdatedSince?.(cursor) ?? [],
    backendService.getOccasionInstancesUpdatedSince?.(cursor) ?? [],
    backendService.getOccasionWinePoolUpdatedSince?.(cursor) ?? [],
    backendService.getTastingsCreatedSince?.(cursor) ?? [],
    backendService.getConsumptionHistorySince?.(cursor) ?? [],
    // Cellar pockets stay a small, rarely-changing full pull each cycle -
    // not worth a dedicated delta method for what's typically a handful of
    // rows per user with no delete path.
    backendService.getCellarPockets?.() ?? []
  ]);

  const mergedWines = await mergeWinesWithConflictResolution(userId, Array.isArray(wines) ? wines : []);

  await offlineDb.transaction(
    'rw',
    [
      offlineDb.wines,
      offlineDb.occasions,
      offlineDb.occasion_instances,
      offlineDb.occasion_wine_pool,
      offlineDb.tastings,
      offlineDb.inventory_events,
      offlineDb.cellar_pockets
    ],
    async () => {
      if (mergedWines.length > 0) await offlineDb.wines.bulkPut(mergedWines);
      if (Array.isArray(occasions) && occasions.length > 0) await offlineDb.occasions.bulkPut(occasions);
      if (Array.isArray(occasionInstances) && occasionInstances.length > 0) {
        await offlineDb.occasion_instances.bulkPut(occasionInstances);
      }
      if (Array.isArray(occasionWinePool) && occasionWinePool.length > 0) {
        await offlineDb.occasion_wine_pool.bulkPut(occasionWinePool);
      }
      if (Array.isArray(tastings) && tastings.length > 0) await offlineDb.tastings.bulkPut(tastings);
      if (Array.isArray(inventoryEvents) && inventoryEvents.length > 0) {
        await offlineDb.inventory_events.bulkPut(inventoryEvents.map((entry: any) => ({
          id: String(entry.id || createLocalId('evt')),
          ...entry
        })));
      }
      if (Array.isArray(cellarPockets) && cellarPockets.length > 0) {
        await offlineDb.cellar_pockets.bulkPut(cellarPockets);
      }
    }
  );

  await reconcileHardDeletes(backendService, userId);

  await setMeta(cursorKey, nextCursor);
  await setMeta('last_synced_user', {
    user_id: userId,
    synced_at: new Date().toISOString()
  });
  localStorage.setItem('pwa_last_synced_user', userId);
};

const processWriteQueue = async (backendService: any, userId: string): Promise<void> => {
  const nowIso = new Date().toISOString();
  const queueItems = await offlineDb.write_queue
    .where('user_id')
    .equals(userId)
    .filter((item) => {
      if (item.status === 'queued') return true;
      if (item.status === 'failed' && item.retry_count < 7) {
        return !item.next_retry_at || item.next_retry_at <= nowIso;
      }
      return false;
    })
    .sortBy('client_ts');

  for (const item of queueItems) {
    const fn = backendService[item.operation];
    if (typeof fn !== 'function') {
      await offlineDb.write_queue.update(item.id, {
        status: 'dead_letter',
        last_error: `Unknown operation: ${item.operation}`
      });
      continue;
    }

    try {
      await offlineDb.write_queue.update(item.id, {
        status: 'syncing',
        last_error: null
      });

      const args = Array.isArray((item.payload as any)?.args) ? (item.payload as any).args : [];
      await fn(...args);
      await offlineDb.write_queue.delete(item.id);
    } catch (error) {
      const retryCount = item.retry_count + 1;
      const deadLetter = retryCount >= 7;
      await offlineDb.write_queue.update(item.id, {
        status: deadLetter ? 'dead_letter' : 'failed',
        retry_count: retryCount,
        next_retry_at: deadLetter ? null : nextRetryAt(retryCount),
        last_error: normalizeError(error)
      });
    }
  }
};

const saveSyncState = async (patch: Partial<SyncStateSnapshot> & Record<string, unknown>): Promise<void> => {
  const previous = (await getMeta<Record<string, unknown>>('sync_state')) || {};
  await setMeta('sync_state', {
    ...previous,
    ...patch
  });
  await emitQueueSnapshot();
};

export const runSyncCycle = async (backendService: any): Promise<void> => {
  if (!isOnline() || syncInFlight) return;

  const userId = await getCurrentUserId(backendService);
  if (!userId) return;

  syncInFlight = true;
  await saveSyncState({
    syncing: true,
    online: true,
    last_sync_started_at: new Date().toISOString(),
    last_sync_error: null
  });

  try {
    await pullDelta(backendService, userId);
    await processWriteQueue(backendService, userId);
    await pullDelta(backendService, userId);
    await flushAiQueueForUser(userId);

    await saveSyncState({
      syncing: false,
      last_sync_completed_at: new Date().toISOString(),
      last_sync_error: null
    });
  } catch (error) {
    await saveSyncState({
      syncing: false,
      last_sync_error: normalizeError(error)
    });
  } finally {
    syncInFlight = false;
  }
};

export const bindSyncLoop = (backendService: any): void => {
  if (syncLoopBound || typeof window === 'undefined') return;
  syncLoopBound = true;

  window.addEventListener('online', () => {
    void runSyncCycle(backendService);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runSyncCycle(backendService);
    }
  });

  void runSyncCycle(backendService);
};

export const getLastSyncedUserId = (): string | null => {
  try {
    return localStorage.getItem('pwa_last_synced_user');
  } catch {
    return null;
  }
};

export const clearOfflineUserAndQueues = async (userId: string): Promise<void> => {
  await clearUserData(userId);
  localStorage.removeItem('pwa_last_synced_user');
  await setMeta(syncCursorKey(userId), null);

  await saveSyncState({
    syncing: false,
    last_sync_error: null
  });
};

export const queueFromNetworkFailure = async (params: {
  backendService: any;
  userId: string;
  operation: QueueOperationInput;
  originalError: unknown;
}): Promise<OfflineQueueItem> => {
  void toJsonSafe(params.originalError);
  return enqueueWriteOperation({
    userId: params.userId,
    operation: params.operation
  });
};
