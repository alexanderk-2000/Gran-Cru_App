// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculatePortfolioStats, getBottleUnitValue, getWinePositionValue, hasKnownPrice } from '../../utils.ts';
import type { Wine } from '../../types.ts';

const wine = (overrides: Partial<Wine>): Wine =>
  ({
    id: overrides.id || 'w1',
    user_id: 'u1',
    name: 'Testwein',
    vintage: 2018,
    region: 'Testregion',
    category: 'Genuss',
    quantity: 1,
    purchase_price: 0,
    format: '0.75L',
    drink_start: 2020,
    drink_end: 2030,
    wishlist: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

describe('bottle value', () => {
  it('prefers the market price when one is known', () => {
    expect(getBottleUnitValue(wine({ purchase_price: 40, market_price: 120 }))).toBe(120);
  });

  it('falls back to the purchase price', () => {
    expect(getBottleUnitValue(wine({ purchase_price: 40 }))).toBe(40);
  });

  it('ignores zero and negative prices', () => {
    expect(getBottleUnitValue(wine({ purchase_price: 0, market_price: 0 }))).toBe(0);
    expect(hasKnownPrice(wine({ purchase_price: 0 }))).toBe(false);
    expect(hasKnownPrice(wine({ purchase_price: 12 }))).toBe(true);
  });

  it('multiplies by bottles on hand, never below zero', () => {
    expect(getWinePositionValue(wine({ purchase_price: 25, quantity: 4 }))).toBe(100);
    expect(getWinePositionValue(wine({ purchase_price: 25, quantity: -3 }))).toBe(0);
  });
});

describe('calculatePortfolioStats', () => {
  // The regression this guards: portfolio stats counted purchase price only,
  // while the dashboard and the "highest value" sort already used the market
  // price - the same cellar was worth different amounts per screen.
  it('values the cellar with market prices where known', () => {
    const stats = calculatePortfolioStats([
      wine({ id: 'a', purchase_price: 40, market_price: 120, quantity: 2 }),
      wine({ id: 'b', purchase_price: 30, quantity: 1 })
    ]);

    expect(stats.totalValue).toBe(270);
    expect(stats.totalBottles).toBe(3);
  });

  it('counts investment value on the same basis', () => {
    const stats = calculatePortfolioStats([
      wine({ id: 'a', category: 'Investment', purchase_price: 100, market_price: 400, quantity: 2 }),
      wine({ id: 'b', category: 'Genuss', purchase_price: 20, quantity: 1 })
    ]);

    expect(stats.investmentValue).toBe(800);
  });

  it('excludes wishlist entries from the cellar value', () => {
    const stats = calculatePortfolioStats([
      wine({ id: 'a', purchase_price: 50, quantity: 1 }),
      wine({ id: 'b', purchase_price: 999, quantity: 5, wishlist: true })
    ]);

    expect(stats.totalValue).toBe(50);
    expect(stats.totalBottles).toBe(1);
  });
});
