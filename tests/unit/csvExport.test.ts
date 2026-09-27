// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildWineCsv } from '../../domain/wine/csvExport.ts';
import type { Wine } from '../../types.ts';

const wine = (overrides: Partial<Wine> = {}): Wine =>
  ({
    id: 'w1',
    user_id: 'u1',
    name: 'Barolo Cannubi',
    producer: 'Testweingut',
    vintage: 2016,
    region: 'Piemont',
    category: 'Genuss',
    quantity: 3,
    purchase_price: 60,
    format: '0.75L',
    drink_start: 2024,
    drink_end: 2038,
    wishlist: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

describe('buildWineCsv', () => {
  it('writes a header and one row per wine', () => {
    const csv = buildWineCsv([wine(), wine({ id: 'w2', name: 'Chablis' })]);
    const lines = csv.trimEnd().split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Name;Weingut;Jahrgang;Flaschen');
    expect(lines[1]).toContain('Barolo Cannubi');
    expect(lines[2]).toContain('Chablis');
  });

  it('starts with a BOM so Excel reads umlauts', () => {
    expect(buildWineCsv([wine({ region: 'Württemberg' })]).startsWith('﻿')).toBe(true);
  });

  it('quotes fields containing the separator or quotes', () => {
    const csv = buildWineCsv([wine({ name: 'Cuvée "Alte Reben"; Reserve' })]);

    expect(csv).toContain('"Cuvée ""Alte Reben""; Reserve"');
  });

  it('neutralises values a spreadsheet would read as a formula', () => {
    const csv = buildWineCsv([wine({ producer: '=HYPERLINK("http://evil")' })]);

    expect(csv).toContain("'=HYPERLINK");
  });

  it('leaves unknown values empty instead of writing "undefined"', () => {
    const csv = buildWineCsv([wine({ producer: undefined, market_price: undefined })]);

    expect(csv).not.toContain('undefined');
  });

  it('joins grape names into one column', () => {
    const csv = buildWineCsv([
      wine({ grapes: [{ name: 'Nebbiolo', percentage: 90 }, { name: 'Barbera' }] })
    ]);

    expect(csv).toContain('Nebbiolo; Barbera');
  });
});
