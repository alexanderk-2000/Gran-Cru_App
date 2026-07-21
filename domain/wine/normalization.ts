import { Category, Wine } from '../../types.ts';

export const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const normalizeSubcellar = (value: unknown): string => toText(value);

export const toNumberOr = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const normalizeConfidence = (value: unknown): Wine['confidence'] => {
  if (typeof value === 'number') {
    if (value >= 0.75) return 'high';
    if (value >= 0.4) return 'medium';
    return 'low';
  }
  const text = toText(value).toLowerCase();
  if (text === 'high' || text === 'hoch') return 'high';
  if (text === 'low' || text === 'niedrig') return 'low';
  return 'medium';
};

export const normalizeWineType = (value: unknown): Wine['wine_type'] | undefined => {
  const text = toText(value).toLowerCase();
  if (!text) return undefined;
  if (text.includes('rot')) return 'Rot';
  if (text.includes('weiß') || text.includes('weiss') || text.includes('white')) return 'Weiß';
  if (text.includes('ros')) return 'Rosé';
  if (text.includes('schaum') || text.includes('sekt') || text.includes('sparkling') || text.includes('champ')) {
    return 'Schaumwein';
  }
  if (text.includes('süß') || text.includes('suess') || text.includes('dessert') || text.includes('sweet')) {
    return 'Süßwein';
  }
  return undefined;
};

export const normalizeFormat = (value: unknown): Wine['format'] | undefined => {
  const text = toText(value).toLowerCase().replace(/\s/g, '');
  if (!text) return undefined;
  if (text.includes('0.375')) return '0.375L';
  if (text.includes('0.75')) return '0.75L';
  if (text.includes('1.5') || text.includes('magnum')) return '1.5L (Magnum)';
  if (text.includes('3.0') || text.includes('doublemagnum')) return '3.0L (Double Magnum)';
  if (text.includes('6.0') || text.includes('imperial')) return '6.0L (Imperial)';
  return undefined;
};

export const normalizeCategory = (value: unknown, fallback: Category): Category => {
  const text = toText(value);
  if (text === 'Genuss' || text === 'Investment' || text === 'Rarität' || text === 'Daily Drinker') return text;
  return fallback;
};

export const parseImportedSources = (value: unknown): Array<{ title?: string; url?: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any) => {
      if (typeof entry === 'string') return { title: 'Quelle', url: toText(entry) };
      return { title: toText(entry?.title) || 'Quelle', url: toText(entry?.url) };
    })
    .filter((entry) => Boolean(entry.url));
};

export const parseImportedGrapes = (
  primary: unknown,
  fallback: unknown
): Array<{ name: string; percentage?: number }> => {
  const fromPrimary = Array.isArray(primary)
    ? primary
        .map((entry: any) => ({
          name: toText(entry?.name || entry),
          percentage: toOptionalNumber(entry?.percentage),
        }))
        .filter((entry: any) => entry.name)
    : [];

  if (fromPrimary.length > 0) return fromPrimary;

  return Array.isArray(fallback)
    ? fallback
        .map((entry: any) => ({
          name: toText(entry?.name || entry),
          percentage: toOptionalNumber(entry?.percentage),
        }))
        .filter((entry: any) => entry.name)
    : [];
};

export const parseImportedAromas = (
  primary: unknown,
  sensoryAromatics: unknown
): Array<{ tag: string; intensity?: number }> => {
  const fromPrimary = Array.isArray(primary)
    ? primary
        .map((entry: any) => ({
          tag: toText(entry?.tag || entry),
          intensity: toOptionalNumber(entry?.intensity),
        }))
        .filter((entry: any) => entry.tag)
    : [];
  if (fromPrimary.length > 0) return fromPrimary;

  if (!sensoryAromatics || typeof sensoryAromatics !== 'object') return [];
  const buckets = ['fruit', 'floral', 'spice', 'herbal_spice', 'wood', 'minerality', 'mineral_earth', 'tertiary'];
  const flattened: Array<{ tag: string; intensity?: number }> = [];
  for (const bucket of buckets) {
    const values = (sensoryAromatics as any)[bucket];
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      const tag = toText(item);
      if (!tag) continue;
      flattened.push({ tag });
    }
  }
  return flattened;
};

export const parseImportedScores = (primary: unknown, detailCritics: unknown): Wine['scores'] => {
  const fromPrimary: NonNullable<Wine['scores']> = [];
  if (Array.isArray(primary)) {
    for (const entry of primary) {
      const critic = toText((entry as any)?.critic || (entry as any)?.source);
      const rawScore = (entry as any)?.score ?? (entry as any)?.value;
      const numericScore = toOptionalNumber(rawScore);
      const stringScore = toText(rawScore);
      const score = numericScore ?? (stringScore || null);
      if (!critic || score === null) continue;
      fromPrimary.push({
        critic,
        score,
        year: toOptionalNumber((entry as any)?.year ?? (entry as any)?.vintage),
      });
    }
  }

  const fromDetails: NonNullable<Wine['scores']> = [];
  if (Array.isArray(detailCritics)) {
    for (const entry of detailCritics) {
      const critic = toText((entry as any)?.source || (entry as any)?.critic);
      const score = toOptionalNumber((entry as any)?.value ?? (entry as any)?.score);
      if (!critic || score === undefined) continue;
      fromDetails.push({
        critic,
        score,
        year: toOptionalNumber((entry as any)?.vintage ?? (entry as any)?.year),
      });
    }
  }

  return [...fromPrimary, ...fromDetails].filter((entry, idx, arr) => {
    const key = `${entry.critic.toLowerCase()}::${entry.year || 'na'}`;
    return arr.findIndex((item) => `${item.critic.toLowerCase()}::${item.year || 'na'}` === key) === idx;
  });
};

export const getImportCandidates = (payload: unknown): any[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as any;
  if (Array.isArray(record.wines)) return record.wines;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') return [record.data];
  return [record];
};

export const normalizeImportedWine = (
  candidate: unknown,
  options: { wishlistOnly: boolean; fallbackName?: string }
): Partial<Wine> | null => {
  const { wishlistOnly, fallbackName = 'Importierter Wein' } = options;

  if (!candidate || typeof candidate !== 'object') return null;

  const data =
    (candidate as any).data && typeof (candidate as any).data === 'object' && !Array.isArray((candidate as any).data)
      ? (candidate as any).data
      : candidate;
  if (!data || typeof data !== 'object') return null;

  const details = (data as any).details && typeof (data as any).details === 'object' ? (data as any).details : {};
  const detailsIdentification =
    details.identification && typeof details.identification === 'object' ? details.identification : {};
  const detailsVinification =
    details.vinification && typeof details.vinification === 'object' ? details.vinification : {};
  const detailsRatings = details.ratings && typeof details.ratings === 'object' ? details.ratings : {};
  const detailsMaturity = details.maturity && typeof details.maturity === 'object' ? details.maturity : {};
  const detailsSensory = details.sensory && typeof details.sensory === 'object' ? details.sensory : {};
  const detailsGrapesStyle =
    details.grapes_style && typeof details.grapes_style === 'object' ? details.grapes_style : {};

  const currentYear = new Date().getFullYear();
  const normalizedVintage = toNumberOr((data as any).vintage, currentYear);
  const normalizedDrinkStart = toNumberOr((data as any).drink_start ?? detailsMaturity.drink_start, normalizedVintage + 2);
  const normalizedDrinkEnd = toNumberOr((data as any).drink_end ?? detailsMaturity.drink_end, normalizedDrinkStart + 8);
  const normalizedMarketPrice = toNumberOr((data as any).market_price, 0);
  const shortDescription = toText((data as any).short_description_de);
  const normalizedName = toText((data as any).name) || fallbackName;

  if (!normalizedName) return null;

  const normalizedSources = parseImportedSources((data as any).sources);
  const normalizedGrapes = parseImportedGrapes((data as any).grapes, detailsGrapesStyle.varieties);
  const normalizedAromas = parseImportedAromas((data as any).aromas, detailsSensory.aromatics);
  const normalizedScores = parseImportedScores((data as any).scores, detailsRatings.critics);

  const structureRaw = (data as any).structure && typeof (data as any).structure === 'object' ? (data as any).structure : {};
  const normalizedStructure = {
    acidity: toOptionalNumber((structureRaw as any).acidity),
    tannin: toOptionalNumber((structureRaw as any).tannin),
    body: toOptionalNumber((structureRaw as any).body),
    sweetness: toOptionalNumber((structureRaw as any).sweetness),
    oak: toOptionalNumber((structureRaw as any).oak),
  };

  const normalizedPairings = Array.isArray((data as any).pairings)
    ? (data as any).pairings
        .map((entry: any) => ({
          item: toText(entry?.item || entry),
          category: toText(entry?.category) || undefined,
          note: toText(entry?.note) || undefined,
        }))
        .filter((entry: any) => entry.item)
    : [];

  const importSubcellar =
    toText((data as any).subcellar) ||
    toText((data as any).sub_cellar) ||
    toText((details as any)?.cellar?.storage_location);

  return {
    name: normalizedName,
    vintage: normalizedVintage,
    barcode: toText((data as any).barcode) || undefined,
    producer: toText((data as any).producer) || undefined,
    region: toText((data as any).region) || toText((detailsIdentification as any).region) || 'Unbekannt',
    country: toText((data as any).country) || toText((detailsIdentification as any).country) || undefined,
    appellation: toText((data as any).appellation) || toText((detailsIdentification as any).appellation) || undefined,
    vineyard: toText((data as any).vineyard) || toText((detailsIdentification as any).vineyard) || undefined,
    wine_type: normalizeWineType((data as any).wine_type) || normalizeWineType((detailsIdentification as any).wine_type),
    category: normalizeCategory((data as any).category, wishlistOnly ? 'Rarität' : 'Genuss'),
    format: normalizeFormat((data as any).format) || normalizeFormat((detailsIdentification as any).bottle_size) || '0.75L',
    quantity: Math.max(1, toNumberOr((data as any).quantity, 1)),
    purchase_price: toNumberOr((data as any).purchase_price, normalizedMarketPrice),
    market_price: normalizedMarketPrice,
    drink_start: normalizedDrinkStart,
    drink_end: normalizedDrinkEnd,
    peak_year: toOptionalNumber((data as any).peak_year ?? (detailsMaturity as any).peak_year),
    alcohol_percent: toOptionalNumber((data as any).alcohol_percent ?? (detailsGrapesStyle as any).alcohol_percent),
    closure_type: toText((data as any).closure_type) || toText((detailsIdentification as any).closure_type) || undefined,
    fermentation:
      toText(
        ((data as any).vinification && (data as any).vinification.fermentation_vessel) ||
          (detailsVinification as any).fermentation_vessel
      ) || undefined,
    aging_process:
      toText(
        ((data as any).vinification && (data as any).vinification.aging_vessel) ||
          (detailsVinification as any).aging_vessel
      ) || undefined,
    grapes: normalizedGrapes,
    aromas: normalizedAromas,
    structure: normalizedStructure,
    pairings: normalizedPairings,
    scores: normalizedScores,
    subcellar: importSubcellar || undefined,
    confidence: normalizeConfidence((data as any).confidence),
    missing_fields: Array.isArray((data as any).missing_fields)
      ? (data as any).missing_fields.filter((item: any) => toText(item))
      : [],
    ai_details: {
      ...details,
      extensions: {
        ...((details as any).extensions || {}),
        ...(shortDescription ? { short_description_de: shortDescription } : {}),
      },
    },
    ai_sources: normalizedSources,
    wishlist: wishlistOnly,
  };
};
