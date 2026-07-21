import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS, getDaysRemaining, isExpired } from '../../domain/wine/trashRetention.ts';

describe('trashRetention', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('reports the full retention window right after deletion', () => {
    const now = Date.now();
    expect(getDaysRemaining(new Date(now).toISOString(), now)).toBe(TRASH_RETENTION_DAYS);
    expect(isExpired(new Date(now).toISOString(), now)).toBe(false);
  });

  it('is not expired the day before the retention window ends', () => {
    const now = Date.now();
    const deletedAt = new Date(now - (TRASH_RETENTION_DAYS - 1) * DAY_MS).toISOString();
    expect(isExpired(deletedAt, now)).toBe(false);
  });

  it('is expired once the retention window has passed', () => {
    const now = Date.now();
    const deletedAt = new Date(now - (TRASH_RETENTION_DAYS + 1) * DAY_MS).toISOString();
    expect(isExpired(deletedAt, now)).toBe(true);
    expect(getDaysRemaining(deletedAt, now)).toBeLessThanOrEqual(0);
  });
});
