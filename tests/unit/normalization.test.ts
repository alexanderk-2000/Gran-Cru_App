import { describe, expect, it } from 'vitest';
import {
  getImportCandidates,
  normalizeImportedWine,
  normalizeSubcellar,
} from '../../domain/wine/normalization.ts';

describe('wine normalization', () => {
  it('normalizes subcellar values', () => {
    expect(normalizeSubcellar('  Main  ')).toBe('Main');
    expect(normalizeSubcellar(null)).toBe('');
  });

  it('extracts import candidates from data wrapper', () => {
    const payload = { data: { name: 'Wine A' } };
    const candidates = getImportCandidates(payload);
    expect(candidates).toHaveLength(1);
  });

  it('normalizes imported wine object', () => {
    const candidate = {
      name: 'Chateau Test',
      vintage: 2019,
      region: 'Bordeaux',
      quantity: 2,
      purchase_price: 40,
      market_price: 60,
      drink_start: 2025,
      drink_end: 2032,
      sources: [{ title: 'Source', url: 'https://example.com' }],
    };

    const normalized = normalizeImportedWine(candidate, { wishlistOnly: false });
    expect(normalized?.name).toBe('Chateau Test');
    expect(normalized?.wishlist).toBe(false);
    expect(normalized?.format).toBe('0.75L');
  });
});
