import { BottleFormat, Category, Wine, WineType } from '../../types.ts';
import { normalizeSubcellar } from '../../domain/wine/normalization.ts';

export interface WineCaptureFormValues {
  name: string;
  producer: string;
  vintage: string;
  region: string;
  subcellar: string;
  appellation: string;
  country: string;
  subregion: string;
  vineyard: string;
  barcode: string;
  category: string;
  wine_type: string;
  format: string;
  quantity: string;
  purchase_price: string;
  market_price: string;
  alcohol_percent: string;
  drink_start: string;
  drink_end: string;
  peak_year: string;
  closure_type: string;
  fermentation: string;
  aging_process: string;
  farming: string;
  confidence: string;
  wishlist: string;
  is_favorite: string;
}

export type WineCaptureAiExtras = Pick<
  Wine,
  'grapes' | 'aromas' | 'structure' | 'pairings' | 'scores' | 'ai_details' | 'ai_sources' | 'missing_fields'
>;

export const CATEGORY_OPTIONS: Category[] = ['Genuss', 'Investment', 'Rarität', 'Daily Drinker'];
export const WINE_TYPE_OPTIONS: WineType[] = ['Rot', 'Weiß', 'Rosé', 'Schaumwein', 'Süßwein'];
export const FORMAT_OPTIONS: BottleFormat[] = ['0.375L', '0.75L', '1.5L (Magnum)', '3.0L (Double Magnum)', '6.0L (Imperial)'];

const toStr = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

export const blankWineCaptureForm = (options: { wishlist?: boolean; targetSubcellar?: string } = {}): WineCaptureFormValues => {
  const currentYear = new Date().getFullYear();
  return {
    name: '',
    producer: '',
    vintage: String(currentYear),
    region: 'Unbekannt',
    subcellar: normalizeSubcellar(options.targetSubcellar),
    appellation: '',
    country: '',
    subregion: '',
    vineyard: '',
    barcode: '',
    category: options.wishlist ? 'Rarität' : 'Genuss',
    wine_type: '',
    format: '0.75L',
    quantity: '1',
    purchase_price: '0',
    market_price: '',
    alcohol_percent: '',
    drink_start: String(currentYear + 2),
    drink_end: String(currentYear + 12),
    peak_year: '',
    closure_type: '',
    fermentation: '',
    aging_process: '',
    farming: '',
    confidence: '',
    wishlist: options.wishlist ? 'true' : 'false',
    is_favorite: 'false'
  };
};

export const wineToFormValues = (wine: Wine): WineCaptureFormValues => ({
  name: wine.name ?? '',
  producer: wine.producer ?? '',
  vintage: toStr(wine.vintage),
  region: wine.region ?? '',
  subcellar: wine.subcellar ?? '',
  appellation: wine.appellation ?? '',
  country: wine.country ?? '',
  subregion: wine.subregion ?? '',
  vineyard: wine.vineyard ?? '',
  barcode: wine.barcode ?? '',
  category: wine.category ?? '',
  wine_type: wine.wine_type ?? '',
  format: wine.format ?? '',
  quantity: toStr(wine.quantity, '0'),
  purchase_price: toStr(wine.purchase_price),
  market_price: toStr(wine.market_price),
  alcohol_percent: toStr(wine.alcohol_percent),
  drink_start: toStr(wine.drink_start),
  drink_end: toStr(wine.drink_end),
  peak_year: toStr(wine.peak_year),
  closure_type: wine.closure_type ?? '',
  fermentation: wine.fermentation ?? '',
  aging_process: wine.aging_process ?? '',
  farming: wine.farming ?? '',
  confidence: wine.confidence ?? '',
  wishlist: wine.wishlist ? 'true' : 'false',
  is_favorite: wine.is_favorite ? 'true' : 'false'
});

const initialDataToFormPatch = (initialData: Partial<Wine>): Partial<WineCaptureFormValues> => {
  const patch: Partial<WineCaptureFormValues> = {};
  if (initialData.name !== undefined) patch.name = initialData.name;
  if (initialData.producer !== undefined) patch.producer = initialData.producer ?? '';
  if (initialData.vintage !== undefined) patch.vintage = toStr(initialData.vintage);
  if (initialData.barcode !== undefined) patch.barcode = initialData.barcode ?? '';
  return patch;
};

export const buildInitialFormValues = (options: {
  wine?: Wine;
  initialData?: Partial<Wine>;
  wishlist?: boolean;
  targetSubcellar?: string;
}): WineCaptureFormValues => {
  if (options.wine) return wineToFormValues(options.wine);
  const base = blankWineCaptureForm({ wishlist: options.wishlist, targetSubcellar: options.targetSubcellar });
  return options.initialData ? { ...base, ...initialDataToFormPatch(options.initialData) } : base;
};

/**
 * Merges an AI enrichment response (services/ai.ts generateWineInfo shape)
 * into the visible form fields, so the user sees and can adjust what the AI
 * found rather than it silently landing only in the save payload.
 */
export const applyAiEnrichment = (form: WineCaptureFormValues, data: Record<string, any>): WineCaptureFormValues => ({
  ...form,
  name: toStr(data.name, form.name),
  producer: data.producer !== undefined && data.producer !== null ? toStr(data.producer) : form.producer,
  vintage: data.vintage !== undefined && data.vintage !== null ? toStr(data.vintage) : form.vintage,
  region: data.region !== undefined && data.region !== null ? toStr(data.region) : form.region,
  country: data.country !== undefined && data.country !== null ? toStr(data.country) : form.country,
  appellation: data.appellation !== undefined && data.appellation !== null ? toStr(data.appellation) : form.appellation,
  vineyard: data.vineyard !== undefined && data.vineyard !== null ? toStr(data.vineyard) : form.vineyard,
  wine_type: data.wine_type !== undefined && data.wine_type !== null ? toStr(data.wine_type) : form.wine_type,
  format: data.format !== undefined && data.format !== null ? toStr(data.format) : form.format,
  purchase_price: data.purchase_price !== undefined && data.purchase_price !== null ? toStr(data.purchase_price) : form.purchase_price,
  market_price: data.market_price !== undefined && data.market_price !== null ? toStr(data.market_price) : form.market_price,
  drink_start: data.drink_start !== undefined && data.drink_start !== null ? toStr(data.drink_start) : form.drink_start,
  drink_end: data.drink_end !== undefined && data.drink_end !== null ? toStr(data.drink_end) : form.drink_end,
  peak_year: data.peak_year !== undefined && data.peak_year !== null ? toStr(data.peak_year) : form.peak_year,
  alcohol_percent: data.alcohol_percent !== undefined && data.alcohol_percent !== null ? toStr(data.alcohol_percent) : form.alcohol_percent,
  confidence: data.confidence !== undefined && data.confidence !== null ? toStr(data.confidence) : form.confidence
});

export const extractAiExtras = (data: Record<string, any> | null | undefined): WineCaptureAiExtras | null => {
  if (!data) return null;
  return {
    grapes: data.grapes || [],
    aromas: data.aromas || [],
    structure: data.structure || {},
    pairings: data.pairings || [],
    scores: data.scores || [],
    missing_fields: data.missing_fields || [],
    ai_details: data.details || data.ai_details || {},
    ai_sources: data.sources || data.ai_sources || []
  };
};

const parseCategory = (value: string): Category | undefined =>
  CATEGORY_OPTIONS.includes(value.trim() as Category) ? (value.trim() as Category) : undefined;

const parseWineType = (value: string): WineType | undefined =>
  WINE_TYPE_OPTIONS.includes(value.trim() as WineType) ? (value.trim() as WineType) : undefined;

const parseFormat = (value: string): BottleFormat | undefined => {
  const trimmed = value.trim();
  if (FORMAT_OPTIONS.includes(trimmed as BottleFormat)) return trimmed as BottleFormat;
  const normalized = trimmed.toLowerCase().replace(/\s/g, '');
  if (normalized.includes('0.375')) return '0.375L';
  if (normalized.includes('0.75')) return '0.75L';
  if (normalized.includes('1.5') || normalized.includes('magnum')) return '1.5L (Magnum)';
  if (normalized.includes('3.0') || normalized.includes('doublemagnum')) return '3.0L (Double Magnum)';
  if (normalized.includes('6.0') || normalized.includes('imperial')) return '6.0L (Imperial)';
  return undefined;
};

const parseConfidence = (value: string): Wine['confidence'] | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return undefined;
};

const toNullableNumber = (value: string): number | undefined => {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toNullableInt = (value: string): number | undefined => {
  const parsed = toNullableNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
};

/**
 * Builds the storageService.saveWine payload from the form's string state.
 * `base` (an existing Wine, in edit mode) is spread first so fields the form
 * doesn't manage (id, ai_details, grapes, timestamps, ...) carry over untouched;
 * `extras` (from a fresh AI enrichment during create) overrides those on top.
 */
export const buildWinePayload = (
  form: WineCaptureFormValues,
  options: { base?: Partial<Wine>; extras?: WineCaptureAiExtras | null } = {}
): Partial<Wine> => {
  const currentYear = new Date().getFullYear();
  const vintage = toNullableInt(form.vintage) ?? currentYear;
  const drinkStart = toNullableInt(form.drink_start) ?? vintage + 2;
  const drinkEnd = toNullableInt(form.drink_end) ?? vintage + 12;

  return {
    ...options.base,
    ...(options.extras ?? {}),
    name: form.name.trim(),
    producer: form.producer.trim() || undefined,
    vintage,
    region: form.region.trim() || 'Unbekannt',
    subcellar: normalizeSubcellar(form.subcellar) || undefined,
    appellation: form.appellation.trim() || undefined,
    country: form.country.trim() || undefined,
    subregion: form.subregion.trim() || undefined,
    vineyard: form.vineyard.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    category: parseCategory(form.category) ?? (form.wishlist === 'true' ? 'Rarität' : 'Genuss'),
    wine_type: parseWineType(form.wine_type),
    format: parseFormat(form.format) ?? '0.75L',
    quantity: Math.max(0, toNullableInt(form.quantity) ?? 0),
    purchase_price: Math.max(0, toNullableNumber(form.purchase_price) ?? 0),
    market_price: toNullableNumber(form.market_price),
    alcohol_percent: toNullableNumber(form.alcohol_percent),
    drink_start: drinkStart,
    drink_end: drinkEnd,
    peak_year: toNullableInt(form.peak_year),
    closure_type: form.closure_type.trim() || undefined,
    fermentation: form.fermentation.trim() || undefined,
    aging_process: form.aging_process.trim() || undefined,
    farming: form.farming.trim() || undefined,
    confidence: parseConfidence(form.confidence),
    wishlist: form.wishlist === 'true',
    is_favorite: form.is_favorite === 'true',
    updated_at: new Date().toISOString()
  };
};
