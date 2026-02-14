import { describe, expect, it } from 'vitest';
import { calculateDrinkability, evaluateWineDrinkability } from '../../domain/wine/drinkability.ts';
import type { Wine } from '../../types.ts';

describe('drinkability domain', () => {
  it('returns unknown when window data is missing', () => {
    const result = evaluateWineDrinkability({
      today_year: 2026,
      wine: {
        vintage: 2020,
        drink_start: null,
        peak_year: null,
        drink_end: null,
        wine_type: 'red',
        structure: {
          acidity: null,
          tannin: null,
          body: null,
          sweetness: null,
          oak: null,
        },
      },
    });

    expect(result.status).toBe('unknown');
    expect(result.uncertainty).toBe('high');
  });

  it('classifies in-window wines as drinkable', () => {
    const result = evaluateWineDrinkability({
      today_year: 2026,
      wine: {
        vintage: 2016,
        drink_start: 2022,
        peak_year: 2027,
        drink_end: 2032,
        wine_type: 'red',
        structure: {
          acidity: 4,
          tannin: 4,
          body: 4,
          sweetness: 1,
          oak: 3,
        },
      },
    });

    expect(['approaching', 'drinking_window', 'peak']).toContain(result.status);
    expect(result.drinkability_index).toBeGreaterThan(40);
  });

  it('maps calculated output to legacy DrinkabilityResult', () => {
    const wine: Wine = {
      id: '1',
      user_id: 'u1',
      name: 'Test Wine',
      vintage: 2018,
      region: 'Bordeaux',
      category: 'Genuss',
      quantity: 3,
      purchase_price: 25,
      format: '0.75L',
      drink_start: 2024,
      drink_end: 2030,
      wishlist: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = calculateDrinkability(wine);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.status.length).toBeGreaterThan(0);
  });
});
