// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getWineMaturity, getWineStatus } from '../../utils.ts';
import { WineStatus } from '../../types.ts';
import type { Wine } from '../../types.ts';

const currentYear = new Date().getFullYear();

const wine = (overrides: Partial<Wine> = {}): Wine =>
  ({
    id: 'w1',
    user_id: 'u1',
    name: 'Testwein',
    vintage: currentYear - 6,
    region: 'Testregion',
    category: 'Genuss',
    quantity: 1,
    purchase_price: 20,
    format: '0.75L',
    drink_start: currentYear - 2,
    drink_end: currentYear + 6,
    wishlist: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

describe('getWineStatus', () => {
  it('holds a wine whose window has not started', () => {
    expect(getWineStatus(wine({ drink_start: currentYear + 4, drink_end: currentYear + 15 }))).toBe(
      WineStatus.HOLD
    );
  });

  it('marks a wine inside its window as ready', () => {
    expect(getWineStatus(wine())).toBe(WineStatus.READY);
  });

  it('marks a wine past its window as past peak', () => {
    expect(getWineStatus(wine({ drink_start: currentYear - 12, drink_end: currentYear - 3 }))).toBe(
      WineStatus.PAST_PEAK
    );
  });

  // The regression this guards: the old year-comparison compared against
  // undefined, every comparison was false, and a wine with no window at all
  // silently counted as "Trinkreif" in the list, the filters and the KPIs.
  it('does not claim readiness for a wine without a drinking window', () => {
    const noWindow = wine({ drink_start: undefined, drink_end: undefined } as Partial<Wine>);

    expect(getWineStatus(noWindow)).toBe(WineStatus.UNKNOWN);
    expect(getWineMaturity(noWindow).label).toBe('Unklar');
  });

  it('treats a reversed window as unknown rather than past peak', () => {
    expect(getWineStatus(wine({ drink_start: currentYear + 5, drink_end: currentYear - 5 }))).toBe(
      WineStatus.UNKNOWN
    );
  });
});

describe('getWineMaturity', () => {
  // The regression this guards: list and detail ran different models, so the
  // same bottle could read "Trinkreif" on its card and "zu früh" on its page.
  it('reports the finer verdict behind the coarse bucket', () => {
    const atPeak = getWineMaturity(
      wine({
        drink_start: currentYear - 5,
        peak_year: currentYear,
        drink_end: currentYear + 5,
        wine_type: 'Rot',
        structure: { acidity: 3, tannin: 3, body: 3, sweetness: 1, oak: 3 }
      })
    );

    expect(atPeak.status).toBe(WineStatus.READY);
    expect(atPeak.detail).toBe('peak');
    expect(atPeak.index).toBeGreaterThan(80);
  });

  it('flags thin data as uncertain', () => {
    const sparse = getWineMaturity(wine({ peak_year: undefined, structure: undefined }));
    const complete = getWineMaturity(
      wine({
        peak_year: currentYear + 1,
        structure: { acidity: 3, tannin: 4, body: 3, sweetness: 1, oak: 2 }
      })
    );

    expect(sparse.uncertainty).not.toBe('low');
    expect(complete.uncertainty).toBe('low');
  });

  it('explains itself in plain language', () => {
    expect(getWineMaturity(wine()).explanation.length).toBeGreaterThan(20);
  });
});
