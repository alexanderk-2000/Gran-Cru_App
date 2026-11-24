/**
 * Wine catalog matching - the client-side replacement for the former
 * Postgres `normalize_catalog_token()` / pg_trgm `search_wine_catalog()`.
 */

/** pg_trgm's default `%` similarity threshold. */
export const PG_TRGM_THRESHOLD = 0.3;

export const normalizeCatalogToken = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const buildCatalogCanonicalKey = (name: string, producer?: string | null, vintage?: number | null): string => {
  const normalizedName = normalizeCatalogToken(name);
  const normalizedProducer = normalizeCatalogToken(producer || '');
  const normalizedVintage = Number.isFinite(vintage as number) ? String(vintage) : 'nv';
  return [normalizedVintage, normalizedProducer, normalizedName].filter(Boolean).join('::');
};

/** Trigram set as produced by Postgres pg_trgm (words padded with two leading and one trailing space). */
const trigrams = (value: string): Set<string> => {
  const set = new Set<string>();
  for (const word of value.split(' ').filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i += 1) set.add(padded.slice(i, i + 3));
  }
  return set;
};

/** Equivalent of pg_trgm's similarity(): |A ∩ B| / |A ∪ B|. */
export const trigramSimilarity = (a: string, b: string): number => {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  left.forEach((gram) => {
    if (right.has(gram)) shared += 1;
  });
  return shared / (left.size + right.size - shared);
};
