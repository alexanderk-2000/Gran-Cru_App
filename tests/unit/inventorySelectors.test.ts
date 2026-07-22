import { describe, expect, it } from 'vitest';
import { buildPocketSummaries, filterAndSortWines, groupWinesBySubcellar } from '../../features/inventory/inventorySelectors.ts';
import { WineStatus, type Wine } from '../../types.ts';

const currentYear = new Date().getFullYear();

const makeWine = (overrides: Partial<Wine>): Wine => ({
  id: overrides.id ?? 'wine-1',
  user_id: 'user-1',
  name: 'Chateau Test',
  vintage: 2018,
  region: 'Bordeaux',
  category: 'Genuss',
  quantity: 2,
  purchase_price: 20,
  format: '0.75L',
  drink_start: currentYear - 1,
  drink_end: currentYear + 1,
  wishlist: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides
});

const baseFilters = {
  wishlistOnly: false,
  presetView: null,
  search: '',
  categoryFilter: 'All' as const,
  statusFilter: 'All' as const,
  subcellarFilter: 'All',
  sort: 'name-asc' as const
};

describe('filterAndSortWines', () => {
  it('excludes wines whose wishlist flag does not match', () => {
    const wines = [makeWine({ id: 'a', wishlist: false }), makeWine({ id: 'b', wishlist: true })];
    expect(filterAndSortWines(wines, baseFilters).map((w) => w.id)).toEqual(['a']);
  });

  it('filters by search across name/region/producer/subcellar', () => {
    const wines = [makeWine({ id: 'a', name: 'Barolo' }), makeWine({ id: 'b', name: 'Chablis' })];
    expect(filterAndSortWines(wines, { ...baseFilters, search: 'baro' }).map((w) => w.id)).toEqual(['a']);
  });

  it('filters by subcellar, treating no subcellar as the main cellar', () => {
    const wines = [makeWine({ id: 'a', subcellar: undefined }), makeWine({ id: 'b', subcellar: 'Keller A' })];
    expect(filterAndSortWines(wines, { ...baseFilters, subcellarFilter: '__main_cellar__' }).map((w) => w.id)).toEqual(['a']);
    expect(filterAndSortWines(wines, { ...baseFilters, subcellarFilter: 'Keller A' }).map((w) => w.id)).toEqual(['b']);
  });

  it('filters by status', () => {
    const wines = [
      makeWine({ id: 'ready', drink_start: currentYear - 1, drink_end: currentYear + 1 }),
      makeWine({ id: 'past', drink_start: currentYear - 10, drink_end: currentYear - 5 })
    ];
    const result = filterAndSortWines(wines, { ...baseFilters, statusFilter: WineStatus.PAST_PEAK });
    expect(result.map((w) => w.id)).toEqual(['past']);
  });

  it('sorts by vintage descending', () => {
    const wines = [makeWine({ id: 'old', vintage: 2010 }), makeWine({ id: 'new', vintage: 2020 })];
    expect(filterAndSortWines(wines, { ...baseFilters, sort: 'vintage-desc' }).map((w) => w.id)).toEqual(['new', 'old']);
  });
});

describe('groupWinesBySubcellar', () => {
  it('groups by normalized subcellar, main cellar first', () => {
    const wines = [makeWine({ id: 'a', subcellar: 'Keller B' }), makeWine({ id: 'b', subcellar: undefined })];
    const groups = groupWinesBySubcellar(wines);
    expect(groups[0].label).toBe('Hauptkeller');
    expect(groups[0].wines.map((w) => w.id)).toEqual(['b']);
    expect(groups[1].label).toBe('Keller B');
  });

  it('sums bottle counts per group', () => {
    const wines = [makeWine({ id: 'a', quantity: 2 }), makeWine({ id: 'b', quantity: 3 })];
    const groups = groupWinesBySubcellar(wines);
    expect(groups[0].bottleCount).toBe(5);
  });
});

describe('buildPocketSummaries', () => {
  it('includes an "All" summary and a main-cellar summary', () => {
    const wines = [makeWine({ id: 'a', subcellar: undefined, quantity: 2 }), makeWine({ id: 'b', subcellar: 'Keller A', quantity: 3 })];
    const summaries = buildPocketSummaries(wines, false, ['Keller A']);
    expect(summaries.map((s) => s.id)).toEqual(['All', '__main_cellar__', 'Keller A']);
    expect(summaries[0].bottleCount).toBe(5);
    expect(summaries[1].bottleCount).toBe(2);
    expect(summaries[2].bottleCount).toBe(3);
  });

  it('only counts wines matching the wishlist flag', () => {
    const wines = [makeWine({ id: 'a', wishlist: false }), makeWine({ id: 'b', wishlist: true })];
    const summaries = buildPocketSummaries(wines, true, []);
    expect(summaries[0].wineCount).toBe(1);
  });
});
