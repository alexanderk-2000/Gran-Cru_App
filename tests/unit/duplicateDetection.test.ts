import { describe, expect, it } from 'vitest';
import { findLikelyDuplicates } from '../../domain/wine/duplicateDetection.ts';
import { Wine } from '../../types.ts';

const baseWine: Wine = {
  id: 'existing-1',
  user_id: 'user-1',
  name: 'Chateau Test',
  producer: 'Domaine Example',
  vintage: 2019,
  region: 'Bordeaux',
  category: 'Genuss',
  quantity: 2,
  purchase_price: 40,
  format: '0.75L',
  drink_start: 2024,
  drink_end: 2032,
  wishlist: false,
  barcode: '4006381333931',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('findLikelyDuplicates', () => {
  it('matches on exact barcode regardless of other fields', () => {
    const candidate = { barcode: '4006381333931', name: 'Different Name', vintage: 2099, format: '1.5L (Magnum)' as const };
    const matches = findLikelyDuplicates(candidate, [baseWine]);
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('existing-1');
  });

  it('matches on producer + name + vintage + format when no barcode is given', () => {
    const candidate = { name: 'chateau test', producer: 'domaine example', vintage: 2019, format: '0.75L' as const };
    const matches = findLikelyDuplicates(candidate, [baseWine]);
    expect(matches).toHaveLength(1);
  });

  it('does not match when vintage differs', () => {
    const candidate = { name: 'Chateau Test', producer: 'Domaine Example', vintage: 2020, format: '0.75L' as const };
    expect(findLikelyDuplicates(candidate, [baseWine])).toHaveLength(0);
  });

  it('does not match when format differs', () => {
    const candidate = { name: 'Chateau Test', producer: 'Domaine Example', vintage: 2019, format: '1.5L (Magnum)' as const };
    expect(findLikelyDuplicates(candidate, [baseWine])).toHaveLength(0);
  });

  it('ignores soft-deleted wines', () => {
    const deleted = { ...baseWine, deleted_at: '2026-01-02T00:00:00Z' };
    const candidate = { barcode: '4006381333931' };
    expect(findLikelyDuplicates(candidate, [deleted])).toHaveLength(0);
  });

  it('excludes the wine being edited via excludeId', () => {
    const candidate = { barcode: '4006381333931' };
    const matches = findLikelyDuplicates(candidate, [baseWine], { excludeId: 'existing-1' });
    expect(matches).toHaveLength(0);
  });
});
