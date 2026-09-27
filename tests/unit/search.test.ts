import { describe, expect, it } from 'vitest';
import { matchesSearchTerm } from '../../domain/wine/search.ts';
import { Wine } from '../../types.ts';

const wine: Wine = {
  id: 'w1',
  user_id: 'u1',
  name: 'Chateau Test',
  producer: 'Domaine Example',
  vintage: 2019,
  region: 'Bordeaux',
  country: 'Frankreich',
  appellation: 'Saint-Julien',
  category: 'Genuss',
  quantity: 2,
  purchase_price: 40,
  format: '0.75L',
  drink_start: 2024,
  drink_end: 2032,
  wishlist: false,
  subcellar: 'Regal A',
  grapes: [{ name: 'Cabernet Sauvignon', percentage: 70 }, { name: 'Merlot', percentage: 30 }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('matchesSearchTerm', () => {
  it('matches an empty term unconditionally', () => {
    expect(matchesSearchTerm(wine, '')).toBe(true);
    expect(matchesSearchTerm(wine, '   ')).toBe(true);
  });

  it('still matches name, region, producer and pocket', () => {
    expect(matchesSearchTerm(wine, 'chateau')).toBe(true);
    expect(matchesSearchTerm(wine, 'bordeaux')).toBe(true);
    expect(matchesSearchTerm(wine, 'domaine')).toBe(true);
    expect(matchesSearchTerm(wine, 'regal a')).toBe(true);
  });

  // The regression this guards (4.5): none of these fields were searchable
  // before, even though every one is already on the wine record.
  it('matches a grape variety', () => {
    expect(matchesSearchTerm(wine, 'cabernet')).toBe(true);
    expect(matchesSearchTerm(wine, 'merlot')).toBe(true);
  });

  it('matches the country', () => {
    expect(matchesSearchTerm(wine, 'frankreich')).toBe(true);
  });

  it('matches the appellation', () => {
    expect(matchesSearchTerm(wine, 'saint-julien')).toBe(true);
  });

  it('matches the vintage as a number substring', () => {
    expect(matchesSearchTerm(wine, '2019')).toBe(true);
    expect(matchesSearchTerm(wine, '201')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesSearchTerm(wine, 'riesling')).toBe(false);
  });

  it('tolerates a wine with no grapes, country or appellation set', () => {
    const sparse: Wine = { ...wine, grapes: undefined, country: undefined, appellation: undefined };
    expect(matchesSearchTerm(sparse, 'chateau')).toBe(true);
    expect(matchesSearchTerm(sparse, 'cabernet')).toBe(false);
  });
});
