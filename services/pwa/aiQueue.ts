import { offlineDb, createLocalId } from './offlineDb.ts';
import type { AiQueueItem, QueueState, SyncStateSnapshot } from './types.ts';

const AI_QUEUE_LIMIT = 50;
const VISION_MAX_BYTES = 1.5 * 1024 * 1024;
const queueListeners = new Set<(snapshot: SyncStateSnapshot) => void>();

const stringifyPayload = (payload: unknown): string => {
  try {
    return JSON.stringify(payload) || '{}';
  } catch {
    return '{}';
  }
};

const makeDedupeHash = (input: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const nextRetryAt = (retryCount: number): string | null => {
  const backoff = [2000, 5000, 15000, 60000, 300000];
  const index = Math.min(retryCount, backoff.length - 1);
  return new Date(Date.now() + backoff[index]).toISOString();
};

const notifyQueueListeners = async () => {
  const [aiPending, aiFailed, writePending, writeFailed, stateMeta] = await Promise.all([
    offlineDb.ai_queue.where('status').equals('queued').count(),
    offlineDb.ai_queue.where('status').equals('failed').count(),
    offlineDb.write_queue.where('status').equals('queued').count(),
    offlineDb.write_queue.where('status').equals('failed').count(),
    offlineDb.meta.get('sync_state')
  ]);

  const snapshot: SyncStateSnapshot = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    last_sync_started_at: (stateMeta?.value as any)?.last_sync_started_at || null,
    last_sync_completed_at: (stateMeta?.value as any)?.last_sync_completed_at || null,
    last_sync_error: (stateMeta?.value as any)?.last_sync_error || null,
    syncing: Boolean((stateMeta?.value as any)?.syncing),
    write_queue_pending: writePending,
    write_queue_failed: writeFailed,
    ai_queue_pending: aiPending,
    ai_queue_failed: aiFailed
  };

  for (const listener of queueListeners) {
    listener(snapshot);
  }
};

export const subscribeQueueSnapshot = (listener: (snapshot: SyncStateSnapshot) => void): (() => void) => {
  queueListeners.add(listener);
  void notifyQueueListeners();

  return () => {
    queueListeners.delete(listener);
  };
};

export const enqueueAiQueueItem = async (params: {
  userId: string;
  operation: AiQueueItem['operation'];
  endpoint: AiQueueItem['endpoint'];
  payload: Record<string, unknown>;
}): Promise<AiQueueItem> => {
  const payloadStr = stringifyPayload(params.payload);
  const payloadBytes = new TextEncoder().encode(payloadStr).byteLength;

  if (params.operation === 'vision' && payloadBytes > VISION_MAX_BYTES) {
    throw new Error('Bild zu groß für Offline-Queue (max 1.5MB).');
  }

  const existingCount = await offlineDb.ai_queue.where('user_id').equals(params.userId).count();
  if (existingCount >= AI_QUEUE_LIMIT) {
    throw new Error('AI-Queue ist voll (max 50 Einträge).');
  }

  const item: AiQueueItem = {
    id: createLocalId('aiq'),
    user_id: params.userId,
    type: 'ai',
    operation: params.operation,
    endpoint: params.endpoint,
    payload: params.payload,
    client_ts: new Date().toISOString(),
    status: 'queued',
    retry_count: 0,
    next_retry_at: null,
    dedupe_key: `${params.operation}:${makeDedupeHash(payloadStr)}`,
    last_error: null
  };

  await offlineDb.ai_queue.put(item);
  await notifyQueueListeners();
  return item;
};

export const getPendingAiQueueItems = async (userId: string, limit = 10): Promise<AiQueueItem[]> => {
  const nowIso = new Date().toISOString();
  const queued = await offlineDb.ai_queue
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

  return queued.slice(0, limit);
};

export const markAiQueueStatus = async (item: AiQueueItem, status: QueueState, errorMessage?: string): Promise<void> => {
  const retryCount = status === 'failed' ? item.retry_count + 1 : item.retry_count;
  const deadLetter = retryCount >= 7 && status === 'failed';

  await offlineDb.ai_queue.update(item.id, {
    status: deadLetter ? 'dead_letter' : status,
    retry_count: retryCount,
    next_retry_at: status === 'failed' ? nextRetryAt(retryCount) : null,
    last_error: errorMessage || null
  });

  await notifyQueueListeners();
};

export const removeAiQueueItem = async (id: string): Promise<void> => {
  await offlineDb.ai_queue.delete(id);
  await notifyQueueListeners();
};

export const clearAiQueueForUser = async (userId: string): Promise<void> => {
  await offlineDb.ai_queue.where('user_id').equals(userId).delete();
  await notifyQueueListeners();
};

export const emitQueueSnapshot = async (): Promise<void> => {
  await notifyQueueListeners();
};
