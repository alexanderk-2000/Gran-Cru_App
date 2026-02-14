import { describe, expect, it } from 'vitest';
import { normalizeWineJson } from '../../server/src/ai/normalize/normalizeWineJson.js';

describe('server normalizeWineJson', () => {
  it('maps aliases and flags missing required source domains', () => {
    const normalized = normalizeWineJson({
      wine_name: 'Test Wine',
      winery: 'Test Producer',
      vintage: '2020',
      region: 'Bordeaux',
      country: 'France',
      appellation: 'Pauillac',
      alcohol_percent: '13.5',
      drink_start: 2026,
      drink_end: 2036,
      peak_year: 2030,
      grapes: [{ name: 'Cabernet Sauvignon' }],
      aromas: [{ primary: 'Cassis', intensity: 'high' }],
      pairings: ['Lamb'],
      scores: [],
      sources: [{ title: 'Only one source', url: 'https://example.com/wine' }]
    });

    expect(normalized.data.name).toBe('Test Wine');
    expect(normalized.data.producer).toBe('Test Producer');
    expect(normalized.data.alcohol_percent).toBe(13.5);
    expect(normalized.issues).toContain('sources_require_gute_weine');
    expect(normalized.issues).toContain('sources_require_wine_searcher');
  });

  it('accepts required source domains and critic scores', () => {
    const normalized = normalizeWineJson({
      name: 'Test Wine',
      producer: 'Producer',
      vintage: 2019,
      region: 'Burgundy',
      country: 'France',
      appellation: 'Gevrey-Chambertin',
      alcohol_percent: 13,
      drink_start: 2025,
      drink_end: 2035,
      peak_year: 2029,
      grapes: [{ name: 'Pinot Noir' }],
      aromas: [{ primary: 'Cherry', intensity: 'medium' }],
      structure: { acidity: 3, tannin: 3, body: 3, sweetness: 1, oak: 2 },
      pairings: [{ item: 'Duck' }],
      scores: [{ critic: 'Vinous', score: 94, year: 2024 }],
      sources: [
        { title: 'Gute Weine', url: 'https://www.gute-weine.de/test' },
        { title: 'Wine Searcher', url: 'https://www.wine-searcher.com/find/test' },
        { title: 'Falstaff', url: 'https://www.falstaff.com/test' }
      ]
    });

    expect(normalized.issues).not.toContain('sources_require_gute_weine');
    expect(normalized.issues).not.toContain('sources_require_wine_searcher');
    expect(normalized.issues).not.toContain('scores_external_critics');
  });
});
