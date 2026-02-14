import { offlineDb, createLocalId, getMeta, persistFullDataset, setMeta } from './offlineDb.ts';
import type { FullDatasetSnapshot, OfflineQueueItem, QueueOperationInput, SyncStateSnapshot } from './types.ts';
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

const buildFullDataset = async (backendService: any, userId: string): Promise<FullDatasetSnapshot> => {
  const [wines, deletedWines, occasions, instances, pockets, inventoryEvents] = await Promise.all([
    backendService.getWines?.() || [],
    backendService.getDeletedWines?.() || [],
    backendService.getOccasions?.() || [],
    backendService.getOccasionInstances?.() || [],
    backendService.getCellarPockets?.() || [],
    backendService.getConsumptionHistory?.() || []
  ]);

  const tastingsChunks = await Promise.all(
    (Array.isArray(wines) ? wines : []).map(async (wine: any) => {
      if (!wine?.id || typeof backendService.getTastings !== 'function') return [];
      try {
        return await backendService.getTastings(wine.id);
      } catch {
        return [];
      }
    })
  );

  const poolChunks = await Promise.all(
    (Array.isArray(occasions) ? occasions : []).map(async (occasion: any) => {
      if (!occasion?.id || typeof backendService.getOccasionWinePool !== 'function') return [];
      try {
        return await backendService.getOccasionWinePool(occasion.id);
      } catch {
        return [];
      }
    })
  );

  return {
    user_id: userId,
    wines: Array.isArray(wines) ? wines : [],
    deleted_wines: Array.isArray(deletedWines) ? deletedWines : [],
    tastings: tastingsChunks.flat(),
    occasions: Array.isArray(occasions) ? occasions : [],
    occasion_instances: Array.isArray(instances) ? instances : [],
    occasion_wine_pool: poolChunks.flat(),
    cellar_pockets: Array.isArray(pockets) ? pockets : [],
    inventory_events: Array.isArray(inventoryEvents) ? inventoryEvents : [],
    pulled_at: new Date().toISOString()
  };
};

const mergeWinesWithConflictResolution = async (snapshot: FullDatasetSnapshot): Promise<FullDatasetSnapshot> => {
  const mergedWines: Wine[] = [];
  for (const remoteWine of snapshot.wines) {
    const localWine = await offlineDb.wines.get(remoteWine.id);
    const resolution = resolveLastWriteWins<Wine>({
      userId: snapshot.user_id,
      entity: 'wines',
      local: localWine || null,
      remote: remoteWine
    });

    mergedWines.push(resolution.resolved);
    if (resolution.conflict) {
      await offlineDb.conflicts.put(resolution.conflict);
    }
  }

  return {
    ...snapshot,
    wines: mergedWines
  };
};

const pullFullDataset = async (backendService: any, userId: string): Promise<void> => {
  const snapshot = await buildFullDataset(backendService, userId);
  const merged = await mergeWinesWithConflictResolution(snapshot);
  await persistFullDataset(merged);
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
    await pullFullDataset(backendService, userId);
    await processWriteQueue(backendService, userId);
    await pullFullDataset(backendService, userId);
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
  await offlineDb.write_queue.where('user_id').equals(userId).delete();
  await offlineDb.ai_queue.where('user_id').equals(userId).delete();
  await offlineDb.wines.where('user_id').equals(userId).delete();
  await offlineDb.tastings.where('user_id').equals(userId).delete();
  await offlineDb.occasions.where('user_id').equals(userId).delete();
  await offlineDb.occasion_instances.where('user_id').equals(userId).delete();
  await offlineDb.occasion_wine_pool.where('user_id').equals(userId).delete();
  await offlineDb.cellar_pockets.where('user_id').equals(userId).delete();
  await offlineDb.conflicts.where('user_id').equals(userId).delete();
  localStorage.removeItem('pwa_last_synced_user');

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
