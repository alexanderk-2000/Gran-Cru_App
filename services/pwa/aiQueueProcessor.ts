import { isOnline } from './networkState.ts';
import {
  getPendingAiQueueItems,
  markAiQueueStatus,
  removeAiQueueItem
} from './aiQueue.ts';

interface ProcessResult {
  processed: number;
  failed: number;
}

export const flushAiQueueForUser = async (userId: string): Promise<ProcessResult> => {
  if (!userId || !isOnline()) {
    return { processed: 0, failed: 0 };
  }

  const items = await getPendingAiQueueItems(userId, 50);
  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await markAiQueueStatus(item, 'syncing');

      const response = await fetch(item.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(item.payload)
      });

      if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${details || 'AI queue request failed'}`);
      }

      await markAiQueueStatus(item, 'synced');
      await removeAiQueueItem(item.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markAiQueueStatus(item, 'failed', error instanceof Error ? error.message : 'Unknown AI queue error');
    }
  }

  return { processed, failed };
};
