import { describe, expect, it } from 'vitest';
import {
  buildWineFromCsvRow,
  evaluateCsvImportRows,
  guessCsvColumnMapping,
  parseCsvText,
} from '../../domain/wine/csvImport.ts';
import { Wine } from '../../types.ts';

describe('parseCsvText', () => {
  it('parses a simple comma-separated file into header + data rows', () => {
    const rows = parseCsvText('name,vintage\nChateau Test,2019\nOther Wine,2020');
    expect(rows).toEqual([
      ['name', 'vintage'],
      ['Chateau Test', '2019'],
      ['Other Wine', '2020'],
    ]);
  });

  it('auto-detects semicolon delimiter from the header line', () => {
    const rows = parseCsvText('name;vintage;preis\nChateau Test;2019;40,50');
    expect(rows).toEqual([
      ['name', 'vintage', 'preis'],
      ['Chateau Test', '2019', '40,50'],
    ]);
  });

  it('handles quoted fields with embedded delimiters and newlines', () => {
    const rows = parseCsvText('name,note\n"Chateau, Test","Line1\nLine2"');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Chateau, Test', 'Line1\nLine2'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const rows = parseCsvText('name\n"Château ""Grand"" Cru"');
    expect(rows).toEqual([['name'], ['Château "Grand" Cru']]);
  });

  it('ignores trailing blank lines', () => {
    const rows = parseCsvText('name,vintage\nChateau Test,2019\n\n');
    expect(rows).toEqual([
      ['name', 'vintage'],
      ['Chateau Test', '2019'],
    ]);
  });
});

describe('guessCsvColumnMapping', () => {
  it('maps common German and English header aliases to wine fields', () => {
    const mapping = guessCsvColumnMapping(['Weinname', 'Jahrgang', 'Kaufpreis', 'Menge', 'Unbekannte Spalte']);
    expect(mapping.name).toBe(0);
    expect(mapping.vintage).toBe(1);
    expect(mapping.purchase_price).toBe(2);
    expect(mapping.quantity).toBe(3);
    expect(mapping.producer).toBeUndefined();
  });

  it('is case- and accent-insensitive', () => {
    const mapping = guessCsvColumnMapping(['NAME', 'Alkohol', 'Größe']);
    expect(mapping.name).toBe(0);
    expect(mapping.alcohol_percent).toBe(1);
    expect(mapping.format).toBe(2);
  });
});

describe('buildWineFromCsvRow', () => {
  const headers = ['name', 'vintage', 'quantity', 'purchase_price', 'format'];
  const mapping = guessCsvColumnMapping(headers);

  it('maps a row into a partial wine using the same normalization as JSON import', () => {
    const wine = buildWineFromCsvRow(['Chateau Test', '2019', '3', '45.5', 'magnum'], mapping, { wishlistOnly: false });
    expect(wine.name).toBe('Chateau Test');
    expect(wine.vintage).toBe(2019);
    expect(wine.quantity).toBe(3);
    expect(wine.purchase_price).toBe(45.5);
    expect(wine.format).toBe('1.5L (Magnum)');
    expect(wine.category).toBe('Genuss');
    expect(wine.wishlist).toBe(false);
  });

  it('falls back to the target subcellar when the row has none', () => {
    const wine = buildWineFromCsvRow(['Chateau Test', '2019', '1', '10', ''], mapping, {
      wishlistOnly: false,
      targetSubcellar: 'Kühlschrank',
    });
    expect(wine.subcellar).toBe('Kühlschrank');
  });

  it('defaults category to Rarität for wishlist imports', () => {
    const wine = buildWineFromCsvRow(['Chateau Test', '2019', '1', '10', ''], mapping, { wishlistOnly: true });
    expect(wine.category).toBe('Rarität');
    expect(wine.wishlist).toBe(true);
  });
});

describe('evaluateCsvImportRows', () => {
  const headers = ['name', 'vintage', 'quantity', 'purchase_price', 'barcode'];
  const mapping = guessCsvColumnMapping(headers);
  const existingWine: Wine = {
    id: 'existing-1',
    user_id: 'user-1',
    name: 'Existing Wine',
    vintage: 2018,
    region: 'Unbekannt',
    category: 'Genuss',
    quantity: 1,
    purchase_price: 20,
    format: '0.75L',
    drink_start: 2022,
    drink_end: 2030,
    wishlist: false,
    barcode: '4006381333931',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('flags a row with missing required fields as invalid', () => {
    const rows = [['', '2019', '1', '10', '']];
    const [result] = evaluateCsvImportRows(rows, mapping, [], { wishlistOnly: false });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => error.field === 'name')).toBe(true);
    expect(result.isDuplicate).toBe(false);
  });

  it('accepts a fully valid row with no duplicate', () => {
    const rows = [['New Wine', '2021', '2', '30', '']];
    const [result] = evaluateCsvImportRows(rows, mapping, [existingWine], { wishlistOnly: false });
    expect(result.errors).toHaveLength(0);
    expect(result.isDuplicate).toBe(false);
  });

  it('flags a row as duplicate when its barcode matches an existing wine', () => {
    const rows = [['New Wine', '2021', '2', '30', '4006381333931']];
    const [result] = evaluateCsvImportRows(rows, mapping, [existingWine], { wishlistOnly: false });
    expect(result.isDuplicate).toBe(true);
  });

  it('flags the second of two identical rows within the same file as duplicate', () => {
    const rows = [
      ['New Wine', '2021', '2', '30', '4111111111111'],
      ['New Wine', '2021', '2', '30', '4111111111111'],
    ];
    const results = evaluateCsvImportRows(rows, mapping, [], { wishlistOnly: false });
    expect(results[0].isDuplicate).toBe(false);
    expect(results[1].isDuplicate).toBe(true);
  });

  it('numbers rows starting at 2 to match the CSV line number including the header', () => {
    const rows = [
      ['First Wine', '2021', '1', '10', ''],
      ['Second Wine', '2021', '1', '10', ''],
    ];
    const results = evaluateCsvImportRows(rows, mapping, [], { wishlistOnly: false });
    expect(results[0].rowNumber).toBe(2);
    expect(results[1].rowNumber).toBe(3);
  });
});
