import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { enqueueAiQueueItem, getPendingAiQueueItems, markAiQueueStatus } from '../../services/pwa/aiQueue.ts';
import { offlineDb } from '../../services/pwa/offlineDb.ts';

beforeEach(async () => {
  await Promise.all([offlineDb.ai_queue.clear(), offlineDb.write_queue.clear(), offlineDb.meta.clear()]);
});

describe('pwa ai queue', () => {
  it('enqueues AI requests and returns pending items', async () => {
    const queued = await enqueueAiQueueItem({
      userId: 'user-1',
      operation: 'search',
      endpoint: '/api/ai/search',
      payload: { prompt: 'test' }
    });

    const pending = await getPendingAiQueueItems('user-1');
    expect(queued.status).toBe('queued');
    expect(pending).toHaveLength(1);
    expect(pending[0].endpoint).toBe('/api/ai/search');
  });

  it('marks entries as dead_letter after repeated failures', async () => {
    const queued = await enqueueAiQueueItem({
      userId: 'user-1',
      operation: 'assignment',
      endpoint: '/api/ai/assignment',
      payload: { value: 1 }
    });

    let current = queued;
    for (let i = 0; i < 7; i += 1) {
      await markAiQueueStatus(current, 'failed', 'network');
      const updated = await offlineDb.ai_queue.get(current.id);
      if (!updated) break;
      current = updated;
    }

    const finalState = await offlineDb.ai_queue.get(queued.id);
    expect(finalState?.status).toBe('dead_letter');
  });
});
