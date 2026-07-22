import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiService } from '../../services/ai.ts';
import { storageService } from '../../services/storage.ts';

afterEach(() => vi.restoreAllMocks());

describe('local research service', () => {
  it('enriches wine data from the local catalog without calling fetch', async () => {
    vi.spyOn(storageService, 'findWineInCatalog').mockResolvedValue({
      name: 'Château Local',
      vintage: 2020,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await aiService.generateWineInfo('Château Local', '', 2020);

    expect(result).toMatchObject({ success: true, data: { name: 'Château Local' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('assigns wines deterministically and respects reserved bottle counts', async () => {
    const result = await aiService.planAssignments({
      instances: [
        { id: 'dinner-2', date: '2026-08-02' },
        { id: 'dinner-1', date: '2026-08-01' },
      ],
      winePool: [
        { wine_id: 'wine-a', name: 'A', bottles_reserved: 1, priority: 'high' },
        { wine_id: 'wine-b', name: 'B', bottles_reserved: 1, priority: 'medium' },
      ],
      candidateScores: [
        { instance_id: 'dinner-1', wine_id: 'wine-a', score: 90 },
        { instance_id: 'dinner-1', wine_id: 'wine-b', score: 80 },
        { instance_id: 'dinner-2', wine_id: 'wine-a', score: 95 },
        { instance_id: 'dinner-2', wine_id: 'wine-b', score: 70 },
      ],
    });

    expect(result.data).toEqual({
      source: 'local-rule-engine',
      assignments: [
        { instance_id: 'dinner-1', wine_id: 'wine-a', score: 90 },
        { instance_id: 'dinner-2', wine_id: 'wine-b', score: 70 },
      ],
    });
  });
});
