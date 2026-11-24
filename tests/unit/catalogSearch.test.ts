import { describe, expect, it } from 'vitest';
import {
  buildCatalogCanonicalKey,
  normalizeCatalogToken,
  trigramSimilarity
} from '../../domain/wine/catalogSearch.ts';

describe('catalog search helpers', () => {
  it('normalizes accents, case and punctuation like the old SQL helper', () => {
    expect(normalizeCatalogToken('Château Léoville-Las Cases')).toBe('chateau leoville las cases');
    expect(normalizeCatalogToken(null)).toBe('');
  });

  it('builds the canonical key as vintage::producer::name', () => {
    expect(buildCatalogCanonicalKey('Grand Vin', 'Château Margaux', 2015)).toBe('2015::chateau margaux::grand vin');
    expect(buildCatalogCanonicalKey('Grand Vin', null, null)).toBe('nv::grand vin');
  });

  it('computes pg_trgm-style similarity', () => {
    expect(trigramSimilarity('barolo', 'barolo')).toBe(1);
    expect(trigramSimilarity('', 'barolo')).toBe(0);
    // pg_trgm: similarity('word', 'words') = 4 shared / 7 distinct trigrams
    expect(trigramSimilarity('word', 'words')).toBeCloseTo(4 / 7, 5);
    expect(trigramSimilarity('barolo riserva', 'barolo')).toBeGreaterThan(0.3);
    expect(trigramSimilarity('riesling', 'barolo')).toBeLessThan(0.3);
  });
});
