import { describe, expect, it, vi } from 'vitest';
import { createAiCache } from '../../server/src/cache/aiCache.js';

describe('createAiCache', () => {
  it('returns null on miss and value on hit', () => {
    const cache = createAiCache({ ttlMs: 10_000, maxEntries: 10 });

    expect(cache.get('missing')).toBeNull();

    cache.set('k1', { ok: true });
    expect(cache.get('k1')).toEqual({ ok: true });
  });

  it('expires entries after ttl', () => {
    vi.useFakeTimers();

    const cache = createAiCache({ ttlMs: 1000, maxEntries: 10 });
    cache.set('k1', { value: 1 });

    vi.advanceTimersByTime(1001);

    expect(cache.get('k1')).toBeNull();
    vi.useRealTimers();
  });
});
