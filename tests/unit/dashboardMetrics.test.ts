import { describe, expect, it } from 'vitest';
import { computeAlerts, computeDashboardKpis, computeFamilyDistribution, computeRecommendations } from '../../features/dashboard/dashboardMetrics.ts';
import type { Wine } from '../../types.ts';

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

describe('computeDashboardKpis', () => {
  it('sums total bottles and splits them by drinking-window status', () => {
    const inventory = [
      makeWine({ id: 'ready', quantity: 2, drink_start: currentYear - 1, drink_end: currentYear + 1 }),
      makeWine({ id: 'past', quantity: 3, drink_start: currentYear - 10, drink_end: currentYear - 5 })
    ];
    const kpis = computeDashboardKpis(inventory, currentYear);
    expect(kpis.totalBottles).toBe(5);
    expect(kpis.readyBottles).toBe(2);
    expect(kpis.pastPeakBottles).toBe(3);
    expect(kpis.holdingBottles).toBe(0);
  });

  it('flags a high overripe risk once past-peak share crosses 25%', () => {
    const inventory = [makeWine({ id: 'a', quantity: 1, drink_start: currentYear - 10, drink_end: currentYear - 5 })];
    expect(computeDashboardKpis(inventory, currentYear).overripeRiskLabel).toBe('hoch');
  });

  it('prefers market price over purchase price for market value', () => {
    const inventory = [makeWine({ quantity: 2, purchase_price: 10, market_price: 30 })];
    expect(computeDashboardKpis(inventory, currentYear).marketValue).toBe(60);
  });
});

describe('computeFamilyDistribution', () => {
  it('buckets bottle counts by wine type family', () => {
    const inventory = [
      makeWine({ id: 'a', wine_type: 'Rot', quantity: 2 }),
      makeWine({ id: 'b', name: 'Riesling Spätlese', quantity: 3 })
    ];
    const distribution = computeFamilyDistribution(inventory);
    expect(distribution.red).toBe(2);
    expect(distribution.white).toBe(3);
  });
});

describe('computeRecommendations', () => {
  it('prioritizes a wine that is already past its drinking window', () => {
    const inventory = [
      makeWine({ id: 'fresh', drink_start: currentYear, drink_end: currentYear + 10 }),
      makeWine({ id: 'stale', drink_start: currentYear - 10, drink_end: currentYear - 5 })
    ];
    const rows = computeRecommendations(inventory, currentYear);
    expect(rows[0]?.wine.id).toBe('stale');
  });

  it('excludes wines with zero bottles in stock', () => {
    const inventory = [makeWine({ id: 'empty', quantity: 0, drink_start: currentYear - 10, drink_end: currentYear - 5 })];
    expect(computeRecommendations(inventory, currentYear)).toHaveLength(0);
  });
});

describe('computeAlerts', () => {
  it('reports an all-clear alert when nothing needs attention', () => {
    const inventory = [
      makeWine({ purchase_price: 20, market_price: 25, quantity: 3, drink_start: currentYear - 2, drink_end: currentYear + 5 })
    ];
    const alerts = computeAlerts(inventory, currentYear);
    expect(alerts.map((a) => a.id)).toEqual(['all-clear']);
  });

  it('flags wines missing a price', () => {
    const inventory = [makeWine({ purchase_price: 0, market_price: undefined, quantity: 2 })];
    const alerts = computeAlerts(inventory, currentYear);
    expect(alerts.some((a) => a.id === 'missing-price')).toBe(true);
  });

  it('groups duplicate wines (same barcode) into a single duplicate alert', () => {
    const inventory = [
      makeWine({ id: 'a', barcode: '111', purchase_price: 20, quantity: 1 }),
      makeWine({ id: 'b', barcode: '111', purchase_price: 20, quantity: 1 }),
      makeWine({ id: 'c', name: 'Unrelated Wine', producer: 'Other', vintage: 2020, purchase_price: 20, quantity: 1 })
    ];
    const alerts = computeAlerts(inventory, currentYear);
    const duplicateAlert = alerts.find((a) => a.id === 'duplicate');
    expect(duplicateAlert?.detail).toContain('1 doppelte');
  });

  it('does not flag wines that only share a name but differ in format as duplicates', () => {
    const inventory = [
      makeWine({ id: 'a', format: '0.75L', purchase_price: 20, quantity: 1 }),
      makeWine({ id: 'b', format: '1.5L (Magnum)', purchase_price: 20, quantity: 1 })
    ];
    const alerts = computeAlerts(inventory, currentYear);
    expect(alerts.some((a) => a.id === 'duplicate')).toBe(false);
  });
});
