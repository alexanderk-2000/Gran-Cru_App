export const createAiCache = ({ ttlMs, maxEntries }) => {
  const cache = new Map();

  const prune = () => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (!entry?.expiresAt || entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
    if (cache.size <= maxEntries) return;

    const sortable = [...cache.entries()].sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
    const dropCount = cache.size - maxEntries;
    for (let i = 0; i < dropCount; i += 1) {
      cache.delete(sortable[i][0]);
    }
  };

  return {
    get: (key) => {
      prune();
      const hit = cache.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
      }
      return hit.value;
    },
    set: (key, value) => {
      cache.set(key, {
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs
      });
      prune();
    },
    clear: () => cache.clear()
  };
};
