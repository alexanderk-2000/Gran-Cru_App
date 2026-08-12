import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Edit3,
  GlassWater,
  MapPin,
  Minus,
  Plus,
  Star,
  Trash2,
  Utensils,
  Wind,
  X
} from 'lucide-react';
import { Badge } from '../../components/Badge.tsx';
import { ImageUploader } from '../../components/ImageUploader.tsx';
import { OpenBottleDialog } from '../../components/OpenBottleDialog.tsx';
import { MoveToPocketDialog } from '../../components/MoveToPocketDialog.tsx';
import { normalizeSubcellar } from '../../domain/wine/normalization.ts';
import { storageService } from '../../services/storage.ts';
import { imageStorageService, type ImageSlot } from '../../services/imageStorage.ts';
import { evaluateWineDrinkability, formatCurrency } from '../../utils.ts';
import { BottleFormat, Category, CriticScore, Tasting, Wine, WineDetails, WineType } from '../../types.ts';
import { WINE_CATEGORIES } from '../../constants.ts';

const LUXURY_BG = '#FDFBF7';
const ACCENT_BURGUNDY = '#5B1E2D';
const ACCENT_GOLD = '#C8A24A';

const TAB_ITEMS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'terroir', label: 'Terroir & Ausbau' },
  { id: 'sensory', label: 'Sensorik & Pairing' },
  { id: 'cellar', label: 'Keller' },
  { id: 'notes', label: 'Verkostungen' }
] as const;

type TabId = (typeof TAB_ITEMS)[number]['id'];
type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

interface GrapeFormEntry {
  name: string;
  percentage: string;
}

interface ScoreFormEntry {
  critic: string;
  score: string;
  year: string;
}

interface StructureFormState {
  acidity: number | null;
  tannin: number | null;
  body: number | null;
  sweetness: number | null;
  oak: number | null;
}

const EMPTY_STRUCTURE_FORM: StructureFormState = {
  acidity: null,
  tannin: null,
  body: null,
  sweetness: null,
  oak: null
};

interface EditFormState {
  name: string;
  producer: string;
  vintage: string;
  region: string;
  subcellar: string;
  appellation: string;
  country: string;
  quantity: string;
  category: string;
  wine_type: string;
  format: string;
  purchase_price: string;
  market_price: string;
  drink_start: string;
  drink_end: string;
  peak_year: string;
  alcohol_percent: string;
  vineyard: string;
  subregion: string;
  closure_type: string;
  fermentation: string;
  aging_process: string;
  farming: string;
  confidence: string;
  wishlist: string;
  is_favorite: string;
  grapes: GrapeFormEntry[];
  structure: StructureFormState;
  scores: ScoreFormEntry[];
  aromas_json: string;
  pairings_json: string;
  ai_details_json: string;
  ai_sources_json: string;
  missing_fields_json: string;
}

interface WindowMetrics {
  known: boolean;
  start: number | null;
  end: number | null;
  peak: number | null;
  currentYear: number;
  currentPosition: number | null;
  peakPosition: number | null;
  windowProgressPercent: number | null;
  windowLengthYears: number | null;
  yearsToPeak: number | null;
  yearsToEnd: number | null;
  statusLabel: string;
  statusTone: 'ready' | 'hold' | 'past' | 'unknown';
  drinkabilityIndex: number;
  uncertaintyLabel: 'Niedrig' | 'Mittel' | 'Hoch';
  explanation: string;
  nextAction: string;
}

interface NormalizedRating {
  critic: string;
  scoreValue: number;
  scoreLabel: string;
  year?: number;
}

interface SourceLink {
  title: string;
  url: string;
  domain: string;
}

interface FactItem {
  label: string;
  value: string;
}

interface ProfessionalFactGroup {
  title: string;
  subtitle: string;
  min: number;
  max: number;
}

interface AromaEntry {
  tag: string;
  intensity: number;
}

interface PairingItem {
  item: string;
  category?: string;
  note?: string;
}

interface StructureRows {
  acidity: number | null;
  tannin: number | null;
  body: number | null;
  sweetness: number | null;
  sweetnessText: string | null;
  oak: number | null;
}

const CATEGORY_OPTIONS: Category[] = WINE_CATEGORIES;
const WINE_TYPE_OPTIONS: WineType[] = ['Rot', 'Weiß', 'Rosé', 'Schaumwein', 'Süßwein'];
const FORMAT_OPTIONS: BottleFormat[] = ['0.375L', '0.75L', '1.5L (Magnum)', '3.0L (Double Magnum)', '6.0L (Imperial)'];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) return null;
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toNullableInt = (value: unknown): number | null => {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed);
};

const mapIntensity = (value: unknown): number | null => {
  const numeric = toNullableNumber(value);
  if (numeric !== null) return clamp(Math.round(numeric), 1, 5);

  const text = toNullableString(value)?.toLowerCase();
  if (!text) return null;
  if (text === 'high' || text === 'hoch') return 5;
  if (text === 'medium' || text === 'mittel') return 3;
  if (text === 'low' || text === 'niedrig') return 2;
  return null;
};

const sanitizeHttpUrl = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const extractFactOrder = (label: string): number => {
  const match = label.match(/^(\d+)\./);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[1], 10);
};

const normalizeFactLabel = (label: string): string => label.replace(/^\d+\.\s*/, '').trim();

const splitByDelimiter = (value: string, delimiter: string): string[] =>
  value
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const professionalFactGroups: ProfessionalFactGroup[] = [
  { title: 'Identität', subtitle: 'Herkunft, Stil, Jahrgang', min: 1, max: 6 },
  { title: 'Ausbau & Struktur', subtitle: 'Kellertechnik und Textur', min: 7, max: 12 },
  { title: 'Aromatik & Reife', subtitle: 'Duftbild, Fenster, Provenienz', min: 13, max: 15 }
];

const normalizeScore = (score: CriticScore['score']): number | null => {
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  if (typeof score === 'string') {
    const parsed = Number.parseFloat(score.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toScoreLabel = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const normalizeError = (error: unknown, fallback = 'Unbekannter Fehler'): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
};

const toJsonText = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
};

const parseJsonField = <T,>(raw: string, label: string, validate: (value: unknown) => value is T, fallback: T): T => {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label}: JSON ist ungültig.`);
  }

  if (!validate(parsed)) {
    throw new Error(`${label}: Struktur ist ungültig.`);
  }
  return parsed;
};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isAromaArray = (value: unknown): value is NonNullable<Wine['aromas']> =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { tag?: unknown }).tag === 'string' &&
      ((entry as { intensity?: unknown }).intensity === undefined || typeof (entry as { intensity?: unknown }).intensity === 'number')
  );

const isPairingsArray = (value: unknown): value is NonNullable<Wine['pairings']> =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { item?: unknown }).item === 'string' &&
      ((entry as { category?: unknown }).category === undefined || typeof (entry as { category?: unknown }).category === 'string') &&
      ((entry as { note?: unknown }).note === undefined || typeof (entry as { note?: unknown }).note === 'string')
  );

const isWineDetails = (value: unknown): value is WineDetails => asRecord(value) !== null;

const grapesToFormState = (grapes: Wine['grapes']): GrapeFormEntry[] =>
  (grapes ?? []).map((entry) => ({
    name: entry.name,
    percentage: entry.percentage !== undefined && entry.percentage !== null ? String(entry.percentage) : ''
  }));

const grapesFromFormState = (entries: GrapeFormEntry[]): Wine['grapes'] =>
  entries
    .map((entry) => ({ name: entry.name.trim(), percentage: entry.percentage.trim() }))
    .filter((entry) => entry.name.length > 0)
    .map((entry) => {
      const percentage = Number.parseFloat(entry.percentage.replace(',', '.'));
      return { name: entry.name, percentage: Number.isFinite(percentage) ? percentage : undefined };
    });

const pickStructureValue = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const structureToFormState = (structure: Wine['structure']): StructureFormState => ({
  acidity: pickStructureValue(structure?.acidity),
  tannin: pickStructureValue(structure?.tannin),
  body: pickStructureValue(structure?.body),
  sweetness: pickStructureValue(structure?.sweetness),
  oak: pickStructureValue(structure?.oak)
});

const structureFromFormState = (state: StructureFormState): Wine['structure'] => {
  const structure: Wine['structure'] = {};
  if (state.acidity !== null) structure.acidity = state.acidity;
  if (state.tannin !== null) structure.tannin = state.tannin;
  if (state.body !== null) structure.body = state.body;
  if (state.sweetness !== null) structure.sweetness = state.sweetness;
  if (state.oak !== null) structure.oak = state.oak;
  return structure;
};

const scoresToFormState = (scores: Wine['scores']): ScoreFormEntry[] =>
  (scores ?? []).map((entry) => ({
    critic: entry.critic,
    score: String(entry.score ?? ''),
    year: entry.year !== undefined && entry.year !== null ? String(entry.year) : ''
  }));

const scoresFromFormState = (entries: ScoreFormEntry[]): Wine['scores'] =>
  entries
    .map((entry) => ({ critic: entry.critic.trim(), score: entry.score.trim(), year: entry.year.trim() }))
    .filter((entry) => entry.critic.length > 0 && entry.score.length > 0)
    .map((entry) => {
      const year = Number.parseInt(entry.year, 10);
      return { critic: entry.critic, score: entry.score, year: Number.isFinite(year) ? year : undefined };
    });

const isAiSources = (value: unknown): value is NonNullable<Wine['ai_sources']> =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      ((entry as { title?: unknown }).title === undefined || typeof (entry as { title?: unknown }).title === 'string') &&
      ((entry as { url?: unknown }).url === undefined || typeof (entry as { url?: unknown }).url === 'string')
  );

const parseCategory = (value: string): Category | undefined => {
  const trimmed = value.trim();
  return CATEGORY_OPTIONS.includes(trimmed as Category) ? (trimmed as Category) : undefined;
};

const parseWineType = (value: string): WineType | undefined => {
  const trimmed = value.trim();
  return WINE_TYPE_OPTIONS.includes(trimmed as WineType) ? (trimmed as WineType) : undefined;
};

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

const parseConfidenceValue = (value: string): Wine['confidence'] | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'low') return 'low';
  return undefined;
};

const computeWindowMetrics = (wine: Wine): WindowMetrics => {
  const currentYear = new Date().getFullYear();
  const start = toNullableInt(wine.drink_start);
  const end = toNullableInt(wine.drink_end);
  const peak = toNullableInt(wine.peak_year);
  const knownWindow = start !== null && end !== null && end >= start;

  const mappedType =
    wine.wine_type === 'Rot'
      ? 'red'
      : wine.wine_type === 'Weiß'
        ? 'white'
        : wine.wine_type === 'Rosé'
          ? 'rose'
          : wine.wine_type === 'Schaumwein'
            ? 'sparkling'
            : null;

  const evaluation = evaluateWineDrinkability({
    today_year: currentYear,
    wine: {
      vintage: toNullableInt(wine.vintage),
      drink_start: start,
      peak_year: peak,
      drink_end: end,
      wine_type: mappedType,
      structure: {
        acidity: mapIntensity(wine.structure?.acidity),
        tannin: mapIntensity(wine.structure?.tannin),
        body: mapIntensity(wine.structure?.body),
        sweetness: mapIntensity(wine.structure?.sweetness),
        oak: mapIntensity(wine.structure?.oak)
      }
    }
  });

  const statusLabelMap = {
    too_early: 'Zu früh',
    approaching: 'Anlaufphase',
    drinking_window: 'Im Fenster',
    peak: 'Peak',
    past_peak: 'Nach Peak',
    unknown: 'Unbekannt'
  } as const;

  const uncertaintyLabelMap = {
    low: 'Niedrig',
    medium: 'Mittel',
    high: 'Hoch'
  } as const;

  const statusToneMap = {
    too_early: 'hold',
    approaching: 'hold',
    drinking_window: 'ready',
    peak: 'ready',
    past_peak: 'past',
    unknown: 'unknown'
  } as const;

  const safeStart = start ?? currentYear;
  const safeEnd = end ?? safeStart + 1;
  const currentPosition = knownWindow
    ? clamp((currentYear - safeStart) / Math.max(1, safeEnd - safeStart), 0, 1)
    : (typeof evaluation.window_used === 'number' ? evaluation.window_used : null);

  const peakPosition =
    knownWindow && peak !== null && peak >= safeStart && peak <= safeEnd
      ? clamp((peak - safeStart) / Math.max(1, safeEnd - safeStart), 0, 1)
      : null;

  const windowLengthYears = knownWindow ? Math.max(1, safeEnd - safeStart) : null;
  const windowProgressPercent = knownWindow && currentPosition !== null ? Math.round(currentPosition * 100) : null;
  const yearsToPeak = peak !== null ? peak - currentYear : null;
  const yearsToEnd = knownWindow ? safeEnd - currentYear : null;
  const nextAction = (() => {
    switch (evaluation.status) {
      case 'too_early':
        return safeStart > currentYear
          ? `Weiter lagern, Fensterstart in ${formatYearDelta(safeStart - currentYear)}.`
          : 'Weiter lagern und Entwicklung beobachten.';
      case 'approaching':
        return yearsToPeak !== null && yearsToPeak > 0
          ? `Annäherung an Peak: in ca. ${formatYearDelta(yearsToPeak)} erneut prüfen.`
          : 'Annäherung an Peak: für die nächsten Anlässe einplanen.';
      case 'peak':
        return 'Optimales Zeitfenster: jetzt priorisiert trinken.';
      case 'drinking_window':
        return yearsToEnd !== null && yearsToEnd <= 2
          ? 'Im Fenster mit begrenzter Restzeit: für die nächsten Anlässe priorisieren.'
          : 'Im Fenster: flexibel trinkbar, aber regelmäßig gegen Peak prüfen.';
      case 'past_peak':
        return 'Über dem empfohlenen Fenster: zeitnah öffnen.';
      default:
        return 'Trinkfensterdaten ergänzen, um verlässlicher planen zu können.';
    }
  })();

  return {
    known: knownWindow,
    start: knownWindow ? start : null,
    end: knownWindow ? end : null,
    peak,
    currentYear,
    currentPosition,
    peakPosition,
    windowProgressPercent,
    windowLengthYears,
    yearsToPeak,
    yearsToEnd,
    statusLabel: statusLabelMap[evaluation.status],
    statusTone: statusToneMap[evaluation.status],
    drinkabilityIndex: evaluation.drinkability_index,
    uncertaintyLabel: uncertaintyLabelMap[evaluation.uncertainty],
    explanation: evaluation.explanation,
    nextAction
  };
};

const buildRatings = (scores: CriticScore[] | undefined): NormalizedRating[] => {
  if (!scores || scores.length === 0) return [];

  const deduped = new Map<string, NormalizedRating>();

  for (const score of scores) {
    const critic = score.critic?.trim();
    if (!critic) continue;

    const normalized = normalizeScore(score.score);
    if (normalized === null) continue;

    const key = critic.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || normalized > existing.scoreValue) {
      deduped.set(key, {
        critic,
        scoreValue: normalized,
        scoreLabel: toScoreLabel(normalized),
        year: score.year
      });
    }
  }

  const criticRank = (critic: string): number => {
    const normalized = critic.toLowerCase();
    if (normalized.includes('suckling')) return 1;
    if (normalized.includes('parker') || normalized.includes('wine advocate')) return 2;
    if (normalized.includes('vinous')) return 3;
    if (normalized.includes('jancis')) return 4;
    if (normalized.includes('decanter')) return 5;
    if (normalized.includes('falstaff')) return 6;
    return 10;
  };

  return [...deduped.values()].sort((a, b) => {
    const rankDelta = criticRank(a.critic) - criticRank(b.critic);
    if (rankDelta !== 0) return rankDelta;
    return b.scoreValue - a.scoreValue;
  });
};

const buildSourceLinks = (sources: Wine['ai_sources'] | undefined): SourceLink[] => {
  if (!sources || sources.length === 0) return [];

  const map = new Map<string, SourceLink>();

  for (const source of sources) {
    const url = sanitizeHttpUrl(source.url ?? null);
    if (!url) continue;
    const title = toNullableString(source.title) ?? getDomain(url);
    if (!title) continue;

    map.set(url, {
      title,
      url,
      domain: getDomain(url)
    });
  }

  return [...map.values()];
};

const buildAromas = (aromas: Wine['aromas']): { primary: AromaEntry[]; secondary: AromaEntry[] } => {
  const list = (aromas ?? [])
    .map((entry) => {
      const tag = toNullableString(entry.tag);
      if (!tag) return null;
      const intensity = mapIntensity(entry.intensity) ?? 3;
      return { tag, intensity };
    })
    .filter((entry): entry is AromaEntry => entry !== null)
    .sort((a, b) => b.intensity - a.intensity || a.tag.localeCompare(b.tag));

  const primary = list.filter((entry) => entry.intensity >= 4);
  const secondary = list.filter((entry) => entry.intensity < 4);

  return { primary, secondary };
};

const getSweetnessText = (details: WineDetails | undefined): string | null => {
  const value = details?.grapes_style?.sweetness;
  return toNullableString(value);
};

const buildStructureRows = (wine: Wine, details: WineDetails | undefined): StructureRows => ({
  acidity: mapIntensity(wine.structure?.acidity),
  tannin: mapIntensity(wine.structure?.tannin),
  body: mapIntensity(wine.structure?.body),
  sweetness: mapIntensity(wine.structure?.sweetness),
  sweetnessText: getSweetnessText(details),
  oak: mapIntensity(wine.structure?.oak)
});

const buildQuickFacts = (wine: Wine, details: WineDetails | undefined): FactItem[] => [
  { label: 'Typ', value: wine.wine_type ?? details?.identification?.wine_type ?? '—' },
  { label: 'Land', value: wine.country ?? details?.identification?.country ?? '—' },
  { label: 'Region', value: wine.region ?? details?.identification?.region ?? '—' },
  { label: 'Unterkeller', value: wine.subcellar ?? '—' },
  { label: 'Appellation', value: wine.appellation ?? details?.identification?.appellation ?? '—' },
  { label: 'Alkohol', value: wine.alcohol_percent ? `${wine.alcohol_percent}% vol` : '—' },
  { label: 'Flaschengröße', value: wine.format ?? details?.identification?.bottle_size ?? '—' },
  { label: 'Verschluss', value: wine.closure_type ?? details?.identification?.closure_type ?? '—' }
];

const joinDefined = (parts: Array<string | null | undefined>, separator = ' | '): string => {
  const normalized = parts
    .map((part) => toNullableString(part))
    .filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join(separator) : '—';
};

const formatNumberValue = (value: number | null | undefined, unit?: string): string | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return unit ? `${value}${unit}` : String(value);
};

const formatStructureValue = (value: number | null | undefined, descriptor?: string | null): string => {
  const score = value ? `${value}/5` : '—';
  const note = toNullableString(descriptor);
  return note ? `${score} (${note})` : score;
};

const formatYearDelta = (delta: number): string => {
  const abs = Math.abs(delta);
  const unit = abs === 1 ? 'Jahr' : 'Jahre';
  return `${abs} ${unit}`;
};

const buildCoreAromaProfile = (wine: Wine, details: WineDetails | undefined): string => {
  const tags = new Set<string>();
  for (const aroma of wine.aromas ?? []) {
    const tag = toNullableString(aroma.tag);
    if (tag) tags.add(tag);
  }

  const aromatics = details?.sensory?.aromatics;
  const additional = [
    ...(aromatics?.fruit ?? []),
    ...(aromatics?.floral ?? []),
    ...(aromatics?.herbal_spice ?? []),
    ...(aromatics?.wood ?? []),
    ...(aromatics?.mineral_earth ?? []),
    ...(aromatics?.minerality ?? []),
    ...(aromatics?.tertiary ?? [])
  ];
  for (const entry of additional) {
    const tag = toNullableString(entry);
    if (tag) tags.add(tag);
  }

  const list = [...tags].slice(0, 8);
  return list.length > 0 ? list.join(', ') : '—';
};

const buildVarietiesText = (wine: Wine, details: WineDetails | undefined): string => {
  if (wine.grapes && wine.grapes.length > 0) {
    return wine.grapes
      .map((grape) => {
        const percent = grape.percentage !== undefined ? ` (${Math.round(grape.percentage)}%)` : '';
        return `${grape.name}${percent}`;
      })
      .join(', ');
  }

  const varieties = details?.grapes_style?.varieties ?? [];
  if (varieties.length > 0) {
    return varieties
      .map((grape) => {
        const name = toNullableString(grape.name);
        if (!name) return null;
        const percent = grape.percentage !== undefined ? ` (${Math.round(grape.percentage)}%)` : '';
        return `${name}${percent}`;
      })
      .filter((entry): entry is string => Boolean(entry))
      .join(', ');
  }

  return '—';
};

const buildProfessionalFacts = (wine: Wine, details: WineDetails | undefined): FactItem[] => {
  const country = wine.country ?? details?.identification?.country ?? null;
  const region = wine.region ?? details?.identification?.region ?? null;
  const appellation = wine.appellation ?? details?.identification?.appellation ?? null;
  const vineyard = wine.vineyard ?? details?.identification?.vineyard ?? null;
  const cru = details?.identification?.cru ?? null;
  const classification = details?.identification?.classification ?? null;
  const wineType = wine.wine_type ?? details?.identification?.wine_type ?? null;
  const wineStyle = details?.identification?.wine_style ?? null;
  const sweetness = details?.grapes_style?.sweetness ?? null;
  const residualSugar = formatNumberValue(details?.grapes_style?.residual_sugar_g_l ?? null, ' g/L');
  const alcohol = formatNumberValue(wine.alcohol_percent ?? details?.grapes_style?.alcohol_percent ?? null, '% vol');

  const winemaking = joinDefined([
    wine.fermentation ?? details?.vinification?.fermentation_vessel ?? null,
    wine.aging_process ?? details?.vinification?.aging_vessel ?? null,
    details?.vinification?.oak_type ? `Holz: ${details.vinification.oak_type}` : null,
    details?.vinification?.new_oak_percent !== undefined ? `Neuholz: ${Math.round(details.vinification.new_oak_percent)}%` : null,
    details?.vinification?.aging_months !== undefined ? `Ausbau: ${Math.round(details.vinification.aging_months)} Monate` : null,
    details?.vinification?.lees_contact ? `Hefelager: ${details.vinification.lees_contact}` : null,
    details?.vinification?.malolactic ? `Malo: ${details.vinification.malolactic}` : null
  ]);

  const drinkStart = wine.drink_start ?? details?.maturity?.drink_start ?? null;
  const peakYear = wine.peak_year ?? details?.maturity?.peak_year ?? null;
  const drinkEnd = wine.drink_end ?? details?.maturity?.drink_end ?? null;
  const stage = details?.maturity?.stage ?? details?.sensory?.stage ?? null;
  const window = [drinkStart, peakYear, drinkEnd].some((value) => value !== null && value !== undefined)
    ? `${drinkStart ?? '—'} – ${peakYear ?? '—'} – ${drinkEnd ?? '—'}`
    : '—';

  const provenance = joinDefined([
    details?.cellar?.provenance ?? null,
    details?.cellar?.storage_location ?? null,
    wine.format ?? details?.identification?.bottle_size ?? null,
    wine.closure_type ?? details?.identification?.closure_type ?? null
  ]);

  return [
    { label: '1. Produzent/Weingut', value: wine.producer ?? details?.identification?.brand_line ?? '—' },
    { label: '2. Exakte Herkunft', value: joinDefined([country, region, appellation], ' / ') },
    { label: '3. Lage/Vineyard', value: joinDefined([vineyard, cru, classification]) },
    { label: '4. Jahrgang', value: String(wine.vintage ?? '—') },
    { label: '5. Rebsorten/Cuvée', value: buildVarietiesText(wine, details) },
    { label: '6. Weinart & Stil', value: joinDefined([wineType, wineStyle, sweetness]) },
    { label: '7. Ausbau/Winemaking', value: winemaking },
    { label: '8. Alkohol', value: alcohol ?? '—' },
    { label: '9. Restzucker/Süße', value: residualSugar ?? (toNullableString(sweetness) ?? '—') },
    { label: '10. Säure/Frische', value: formatStructureValue(wine.structure?.acidity ?? null, details?.sensory?.palate?.freshness ?? null) },
    { label: '11. Tannin/Griff', value: formatStructureValue(wine.structure?.tannin ?? null, details?.sensory?.palate?.tannin_grip ?? null) },
    { label: '12. Körper/Extrakt', value: formatStructureValue(wine.structure?.body ?? null, details?.sensory?.palate?.body_extract ?? null) },
    { label: '13. Aromenprofil', value: buildCoreAromaProfile(wine, details) },
    { label: '14. Reife & Trinkfenster', value: stage ? `${window} (${stage})` : window },
    { label: '15. Provenienz/Lagerung', value: provenance }
  ];
};

const buildHeaderDescription = (wine: Wine, details: WineDetails | undefined): string | null => {
  const aiNarrative = toNullableString(details?.extensions?.short_description_de);
  if (aiNarrative) return aiNarrative;

  const originParts = [
    toNullableString(wine.appellation),
    toNullableString(wine.region ?? details?.identification?.region),
    toNullableString(wine.country ?? details?.identification?.country)
  ].filter((part): part is string => Boolean(part));

  const grapes = (wine.grapes ?? [])
    .map((grape) => toNullableString(grape.name))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 2)
    .join(', ');

  const styleParts = [
    toNullableString(wine.wine_type ?? details?.identification?.wine_type),
    toNullableString(details?.identification?.wine_style ?? details?.grapes_style?.sweetness)
  ].filter((part): part is string => Boolean(part));

  const window =
    typeof wine.drink_start === 'number' && typeof wine.drink_end === 'number'
      ? `${wine.drink_start}-${wine.drink_end}`
      : null;

  const fragments: string[] = [];
  if (originParts.length > 0) fragments.push(`aus ${originParts.join(', ')}`);
  if (grapes) fragments.push(`mit ${grapes}`);
  if (styleParts.length > 0) fragments.push(`Stil ${styleParts.join(', ')}`);
  if (window) fragments.push(`Trinkfenster ${window}`);

  return fragments.length > 0 ? fragments.join(' · ') : null;
};

const pairingIconLabel = (category?: string): string => {
  if (!category) return 'Pairing';
  const normalized = category.toLowerCase();
  if (normalized.includes('dessert')) return 'Dessert';
  if (normalized.includes('starter') || normalized.includes('vorspeise')) return 'Vorspeise';
  if (normalized.includes('cheese') || normalized.includes('käse')) return 'Käse';
  return 'Hauptgang';
};

const toneClass: Record<WindowMetrics['statusTone'], string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  hold: 'bg-amber-50 text-amber-700 border-amber-100',
  past: 'bg-rose-50 text-rose-700 border-rose-100',
  unknown: 'bg-stone-100 text-stone-500 border-stone-200'
};

const InlineToast = memo(function InlineToast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const colorClass =
    message.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : message.tone === 'info'
        ? 'border-stone-300 bg-white text-stone-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className="fixed left-1/2 top-6 z-[80] w-[min(92vw,560px)] -translate-x-1/2">
      <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${colorClass}`}>
        <p className="text-sm leading-5">{message.text}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-current/70 hover:bg-black/5"
          aria-label="Hinweis schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

const DetailSkeleton = memo(function DetailSkeleton() {
  return (
    <div className="min-h-screen px-6 pb-14 pt-8" style={{ backgroundColor: LUXURY_BG }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-44 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        <div className="h-12 animate-pulse rounded-2xl border border-stone-200 bg-white" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white md:col-span-2" />
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        </div>
      </div>
    </div>
  );
});

const StickyTabNav = memo(function StickyTabNav({
  active,
  onChange,
  tastingCount
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  tastingCount: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const activeButton = buttonRefs.current[active];
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  return (
    <div className="sticky top-3 z-20 mt-6">
      <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
        <div ref={containerRef} className="-mx-1 flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAB_ITEMS.map((tab) => {
            const label = tab.id === 'notes' ? `${tab.label} (${tastingCount})` : tab.label;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                ref={(node) => {
                  buttonRefs.current[tab.id] = node;
                }}
                onClick={() => onChange(tab.id)}
                className={`relative mx-1 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${isActive ? 'bg-[#5B1E2D] text-white shadow-[0_8px_18px_rgba(91,30,45,0.25)]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', { label: string; variant: 'sage' | 'gold' | 'bordeaux' }> = {
  high: { label: 'KI-Daten: hohe Sicherheit', variant: 'sage' },
  medium: { label: 'KI-Daten: mittlere Sicherheit', variant: 'gold' },
  low: { label: 'KI-Daten: geringe Sicherheit', variant: 'bordeaux' }
};

// Confidence and missing_fields were only ever visible in the edit form's
// raw JSON textareas - a wine with low confidence or several unresolved
// fields looked identical to a fully verified one in read mode. This
// surfaces that trust signal where a collector actually sees it.
const ConfidenceBadge = memo(function ConfidenceBadge({
  confidence,
  missingFields
}: {
  confidence?: 'high' | 'medium' | 'low';
  missingFields?: string[];
}) {
  if (!confidence) return null;

  const { label, variant } = CONFIDENCE_LABELS[confidence];
  const missingCount = missingFields?.length ?? 0;
  const title = missingCount > 0 ? `Fehlende Felder: ${missingFields!.join(', ')}` : undefined;

  return (
    <span title={title}>
      <Badge variant={variant}>
        {label}
        {missingCount > 0 ? ` · ${missingCount} Feld${missingCount === 1 ? '' : 'er'} offen` : ''}
      </Badge>
    </span>
  );
});

const HeaderCard = memo(function HeaderCard({
  wine,
  isSaving,
  onBack,
  onOpenEdit,
  onOpenPurchase,
  onDelete,
  onDrink,
  onAdjust,
  onOpenMove
}: {
  wine: Wine;
  isSaving: boolean;
  onBack: () => void;
  onOpenEdit: () => void;
  onOpenPurchase: () => void;
  onDelete: () => void;
  onDrink: () => void;
  onAdjust: (delta: number) => void;
  onOpenMove: () => void;
}) {
  const disabled = isSaving;

  return (
    <header className="px-6 pt-7">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-[#5B1E2D]/10 bg-gradient-to-br from-white via-[#fdfaf5] to-[#f6efe6] p-6 shadow-[0_18px_42px_rgba(48,20,24,0.08)] md:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#c8a24a]/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-20 h-40 w-40 rounded-full bg-[#5B1E2D]/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900"
              >
                <ArrowLeft className="h-4 w-4" /> Zurück
              </button>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 p-2">
                <button
                  type="button"
                  onClick={onOpenEdit}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
                >
                  <Edit3 className="h-4 w-4" />
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={onOpenPurchase}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#c8a24a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Nachkauf
                </button>
                <button
                  type="button"
                  onClick={onOpenMove}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
                >
                  <MapPin className="h-4 w-4" />
                  Verschieben
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-stone-300 bg-white/80 px-3 py-1 font-serif text-lg text-stone-700">{wine.vintage || 'NV'}</span>
                  {wine.region ? <Badge variant="sage">{wine.region}</Badge> : null}
                  {wine.wine_type ? <Badge variant="gold">{wine.wine_type}</Badge> : null}
                  {wine.category ? <Badge variant="bordeaux">{wine.category}</Badge> : null}
                  <ConfidenceBadge confidence={wine.confidence} missingFields={wine.missing_fields} />
                </div>

                <h1 className="font-serif text-[2rem] leading-[1.05] text-stone-900 md:text-[3.25rem]">{wine.name}</h1>

                <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-600 md:text-lg">
                  <span>{wine.producer || 'Produzent unbekannt'}</span>
                  {wine.appellation ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-stone-300" />
                      <span>{wine.appellation}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="w-full rounded-3xl border border-[#5B1E2D]/15 bg-white/95 p-5 shadow-[0_10px_26px_rgba(0,0,0,0.08)]">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Bestand</p>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    onClick={() => onAdjust(-1)}
                    disabled={disabled || wine.quantity <= 0}
                    aria-label="Bestand reduzieren"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <p className="font-serif text-4xl leading-none text-stone-900">{wine.quantity}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Flaschen</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    onClick={() => onAdjust(1)}
                    disabled={disabled}
                    aria-label="Bestand erhöhen"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onDrink}
                  disabled={disabled || wine.quantity <= 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: ACCENT_BURGUNDY }}
                >
                  <GlassWater className="h-4 w-4" /> Flasche öffnen
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </header>
  );
});

const DrinkingWindowCard = memo(function DrinkingWindowCard({ metrics }: { metrics: WindowMetrics }) {
  const peakTimingLabel =
    metrics.yearsToPeak === null
      ? '—'
      : metrics.yearsToPeak === 0
        ? 'Peak jetzt'
        : metrics.yearsToPeak > 0
          ? `in ${formatYearDelta(metrics.yearsToPeak)}`
          : `seit ${formatYearDelta(metrics.yearsToPeak)} vorbei`;

  const endTimingLabel =
    metrics.yearsToEnd === null
      ? '—'
      : metrics.yearsToEnd === 0
        ? 'endet dieses Jahr'
        : metrics.yearsToEnd > 0
          ? `in ${formatYearDelta(metrics.yearsToEnd)}`
          : `seit ${formatYearDelta(metrics.yearsToEnd)} überschritten`;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl text-stone-900">Trinkreife</h3>
          <p className="mt-1 text-sm text-stone-500">
            {metrics.known && metrics.start !== null && metrics.end !== null
              ? `${metrics.start} bis ${metrics.end}`
              : 'Fensterdaten unvollständig'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-stone-200 px-3 py-1 text-xs uppercase tracking-[0.16em] text-stone-600">
            Index {metrics.drinkabilityIndex}/100
          </span>
          <span className="rounded-full border border-stone-200 px-3 py-1 text-xs uppercase tracking-[0.16em] text-stone-600">
            Unsicherheit {metrics.uncertaintyLabel}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${toneClass[metrics.statusTone]}`}>
            {metrics.statusLabel}
          </span>
        </div>
      </div>

      {metrics.known && metrics.start !== null && metrics.end !== null && metrics.currentPosition !== null ? (
        <>
          <div className="relative rounded-full bg-stone-100">
            <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${ACCENT_GOLD}22 0%, ${ACCENT_BURGUNDY} 50%, ${ACCENT_GOLD}22 100%)` }} />

            <span
              className="absolute -top-2 h-6 w-[3px] -translate-x-1/2 rounded-full bg-stone-900"
              style={{ left: `${metrics.currentPosition * 100}%` }}
              aria-label={`Aktuelles Jahr ${metrics.currentYear}`}
            />

            {metrics.peakPosition !== null ? (
              <span
                className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full"
                style={{ left: `${metrics.peakPosition * 100}%`, backgroundColor: ACCENT_GOLD }}
                aria-label={`Peak ${metrics.peak}`}
              />
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-stone-500">
            <span>Start {metrics.start}</span>
            <span>Heute {metrics.currentYear}</span>
            <span>Ende {metrics.end}</span>
          </div>

          {metrics.peak !== null ? <p className="mt-3 text-xs text-stone-500">Peak: {metrics.peak}</p> : null}
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 text-sm text-stone-500">
          Für diesen Wein fehlen vollständige Start-/Enddaten des Trinkfensters.
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Fenster-Fortschritt</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">
            {metrics.windowProgressPercent !== null ? `${metrics.windowProgressPercent}%` : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Bis Peak</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">{peakTimingLabel}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Bis Fensterende</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">{endTimingLabel}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Fensterlänge</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">
            {metrics.windowLengthYears !== null ? `${metrics.windowLengthYears} Jahre` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Nächster Schritt</p>
        <p className="mt-1 text-sm text-stone-700">{metrics.nextAction}</p>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-stone-600">{metrics.explanation}</p>
    </section>
  );
});

const ShortDescriptionCard = memo(function ShortDescriptionCard({ description }: { description?: string | null }) {
  const cleaned = (description ?? '').trim();
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="font-serif text-xl text-stone-900">Kurzbeschreibung</h3>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        {cleaned || 'Für diesen Wein ist noch keine Kurzbeschreibung hinterlegt.'}
      </p>
    </section>
  );
});

const FactValue = memo(function FactValue({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === '—') {
    return <p className="text-sm text-stone-400">—</p>;
  }

  const piped = splitByDelimiter(cleaned, '|');
  if (piped.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {piped.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  const commaSeparated = splitByDelimiter(cleaned, ',');
  if (normalizeFactLabel(label).toLowerCase().includes('aromenprofil') && commaSeparated.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {commaSeparated.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className={`${compact ? 'text-sm' : 'text-[15px]'} leading-6 text-stone-800 break-words`}>
      {cleaned}
    </p>
  );
});

const FactsDefinitionList = memo(function FactsDefinitionList({ items }: { items: FactItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Quick Facts</h3>
      <p className="mb-4 text-xs uppercase tracking-[0.14em] text-stone-500">Kernwerte auf einen Blick</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="grid grid-cols-1 gap-1 rounded-2xl border border-stone-100 bg-stone-50/60 px-3 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">{item.label}</p>
            <FactValue label={item.label} value={item.value} compact />
          </li>
        ))}
      </ul>
    </section>
  );
});

const ProfessionalFactsCard = memo(function ProfessionalFactsCard({ items }: { items: FactItem[] }) {
  const grouped = professionalFactGroups.map((group) => ({
    ...group,
    items: items.filter((item) => {
      const order = extractFactOrder(item.label);
      return order >= group.min && order <= group.max;
    })
  }));

  const ungrouped = items.filter((item) => extractFactOrder(item.label) === Number.MAX_SAFE_INTEGER);

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Professionelles Weinprofil</h3>
      <p className="mb-6 text-xs uppercase tracking-[0.14em] text-stone-500">Strukturiert nach Herkunft, Ausbau und Reife</p>
      <div className="space-y-6">
        {grouped
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <article key={group.title} className="rounded-2xl border border-stone-200 bg-white">
              <header className="border-b border-stone-100 px-4 py-3">
                <h4 className="font-serif text-lg text-stone-900">{group.title}</h4>
                <p className="text-xs text-stone-500">{group.subtitle}</p>
              </header>
              <dl className="divide-y divide-stone-100 px-4">
                {group.items.map((item) => (
                  <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                      {normalizeFactLabel(item.label)}
                    </dt>
                    <dd className="min-w-0">
                      <FactValue label={item.label} value={item.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}

        {ungrouped.length > 0 ? (
          <article className="rounded-2xl border border-stone-200 bg-white">
            <header className="border-b border-stone-100 px-4 py-3">
              <h4 className="font-serif text-lg text-stone-900">Weitere Angaben</h4>
            </header>
            <dl className="divide-y divide-stone-100 px-4">
              {ungrouped.map((item) => (
                <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                    {normalizeFactLabel(item.label)}
                  </dt>
                  <dd className="min-w-0">
                    <FactValue label={item.label} value={item.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ) : null}
      </div>
    </section>
  );
});

const RatingsCard = memo(function RatingsCard({ ratings }: { ratings: NormalizedRating[] }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [ratings]);

  if (ratings.length === 0) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <h3 className="font-serif text-xl text-stone-900">Bewertungen</h3>
        <p className="mt-3 text-sm text-stone-500">Noch keine externen Bewertungen vorhanden.</p>
      </section>
    );
  }

  const visible = expanded ? ratings : ratings.slice(0, 8);
  const hasMore = ratings.length > 8;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-4 font-serif text-xl text-stone-900">Bewertungen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((rating) => (
          <div key={`${rating.critic}-${rating.scoreLabel}`} className="rounded-2xl border border-stone-200 bg-stone-50/50 p-3 text-center">
            <p className="font-serif text-2xl text-stone-900">{rating.scoreLabel}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-stone-500">{rating.critic}</p>
            {rating.year ? <p className="mt-0.5 text-[10px] text-stone-400">Jg. {rating.year}</p> : null}
          </div>
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Weniger anzeigen' : `Mehr anzeigen (${ratings.length - 8})`}
        </button>
      ) : null}
    </section>
  );
});

const AromaCard = memo(function AromaCard({ aromas }: { aromas: { primary: AromaEntry[]; secondary: AromaEntry[] } }) {
  const renderGroup = (title: string, entries: AromaEntry[]) => (
    <div>
      <h4 className="mb-3 text-xs uppercase tracking-[0.16em] text-stone-500">{title}</h4>
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <span
              key={`${title}-${entry.tag}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${title === 'Primary' ? 'border-[color:#5B1E2D]/25 bg-[color:#5B1E2D]/10 text-[color:#5B1E2D]' : 'border-stone-200 bg-white text-stone-700'
                }`}
            >
              {entry.tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">Keine Angaben</p>
      )}
    </div>
  );

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Wind className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Aromatik
      </h3>
      <div className="space-y-6">
        {renderGroup('Primary', aromas.primary)}
        {renderGroup('Secondary', aromas.secondary)}
      </div>
    </section>
  );
});

const StructureCard = memo(function StructureCard({ rows }: { rows: StructureRows }) {
  const bars = [
    { label: 'Säure', value: rows.acidity, description: null as string | null },
    { label: 'Tannin', value: rows.tannin, description: null as string | null },
    { label: 'Körper', value: rows.body, description: null as string | null },
    { label: 'Süße', value: rows.sweetness, description: rows.sweetnessText },
    { label: 'Holz', value: rows.oak, description: null as string | null }
  ];

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Activity className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Struktur
      </h3>

      <div className="space-y-5">
        {bars.map((bar) => {
          const barValue = bar.value;
          return (
            <div key={bar.label}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-xs uppercase tracking-[0.16em] text-stone-500">{bar.label}</span>
                <span className="text-xs text-stone-500">{barValue ?? bar.description ?? '—'}</span>
              </div>
              {barValue === null ? (
                <div className="h-1.5 rounded-full bg-stone-100" />
              ) : (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <span
                      key={`${bar.label}-${idx}`}
                      className={`h-1.5 flex-1 rounded-full ${idx <= barValue ? 'bg-[color:#5B1E2D]' : 'bg-stone-100'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

const PairingsCard = memo(function PairingsCard({ pairings }: { pairings: PairingItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Utensils className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Pairing
      </h3>

      {pairings.length === 0 ? (
        <p className="text-sm text-stone-500">Keine Pairing-Daten vorhanden.</p>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => (
            <article key={`${pairing.item}-${pairing.category ?? ''}`} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-900">{pairing.item}</p>
                <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{pairingIconLabel(pairing.category)}</span>
              </div>
              {pairing.note ? <p className="text-sm leading-6 text-stone-600">{pairing.note}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

const NotesTimeline = memo(function NotesTimeline({ tastings, onCreateNote, disabled }: { tastings: Tasting[]; onCreateNote: () => void; disabled: boolean }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="font-serif text-xl text-stone-900">Verkostungen</h3>
        <button
          type="button"
          onClick={onCreateNote}
          disabled={disabled}
          className="rounded-full border border-stone-300 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          Notiz erfassen
        </button>
      </div>

      {tastings.length === 0 ? (
        <p className="text-sm text-stone-500">
          Noch keine Verkostung notiert. Beim Öffnen einer Flasche - oder jederzeit über
          „Notiz erfassen“ - hältst du hier Bewertung und Eindruck fest.
        </p>
      ) : (
        <ol className="space-y-5">
          {tastings.map((tasting) => (
            <li key={tasting.id} className="rounded-2xl border border-stone-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <time className="text-xs uppercase tracking-[0.16em] text-stone-500">
                  {new Date(tasting.date).toLocaleDateString('de-DE')}
                </time>
                {tasting.rating > 0 && (
                  <div className="flex items-center gap-0.5" aria-label={`Bewertung ${tasting.rating} von 5`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={`${tasting.id}-${star}`}
                        className={`h-3.5 w-3.5 ${star <= tasting.rating ? 'fill-current text-[color:#C8A24A]' : 'text-stone-300'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {tasting.note ? (
                <p className="font-serif text-base leading-relaxed text-stone-800">“{tasting.note}”</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

const SourceFooter = memo(function SourceFooter({ sources }: { sources: SourceLink[] }) {
  if (sources.length === 0) return null;

  return (
    <footer className="mx-auto mt-10 max-w-6xl border-t border-stone-200 px-6 pt-8">
      <h4 className="mb-4 text-xs uppercase tracking-[0.18em] text-stone-500">Quellen</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300"
          >
            <p className="line-clamp-2 text-sm text-stone-800">{source.title}</p>
            <p className="mt-1 text-xs text-stone-500">{source.domain}</p>
          </a>
        ))}
      </div>
    </footer>
  );
});

const Dialog = memo(function Dialog({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useMemo(() => `dialog-${title.toLowerCase().replace(/\s+/g, '-')}`, [title]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const node = dialogRef.current;
    if (!node) return undefined;

    const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(selectors)).filter((entry) => !entry.hasAttribute('disabled'));
    const fieldFocusables = focusables.filter((entry) => {
      const tag = entry.tagName.toLowerCase();
      return tag === 'input' || tag === 'select' || tag === 'textarea';
    });
    const first = fieldFocusables[0] || focusables[0];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      if (focusables.length === 0) return;

      const activeElement = document.activeElement;
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.20)]"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 id={titleId} className="font-serif text-2xl text-stone-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-stone-500 hover:bg-stone-100" aria-label="Dialog schließen">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
});

export const WineDetail: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [wine, setWine] = useState<Wine | null>(null);
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [isSaving, setIsSaving] = useState(false);

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState('0');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    producer: '',
    vintage: '',
    region: '',
    subcellar: '',
    appellation: '',
    country: '',
    quantity: '0',
    category: '',
    wine_type: '',
    format: '',
    purchase_price: '',
    market_price: '',
    drink_start: '',
    drink_end: '',
    peak_year: '',
    alcohol_percent: '',
    vineyard: '',
    subregion: '',
    closure_type: '',
    fermentation: '',
    aging_process: '',
    farming: '',
    confidence: '',
    wishlist: 'false',
    is_favorite: 'false',
    grapes: [],
    structure: EMPTY_STRUCTURE_FORM,
    scores: [],
    aromas_json: '[]',
    pairings_json: '[]',
    ai_details_json: '{}',
    ai_sources_json: '[]',
    missing_fields_json: '[]'
  });

  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastTone) => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  // Opening a bottle and writing a note are the same dialog with different
  // defaults: the header button pre-selects consumption, the notes timeline
  // does not (a note must not require drinking a bottle).
  const [openBottleMode, setOpenBottleMode] = useState<{ consume: boolean } | null>(null);
  const openBottleDialog = useCallback((consume: boolean) => setOpenBottleMode({ consume }), []);

  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [pocketOptions, setPocketOptions] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void storageService.getCellarPockets().then((pockets) => {
      if (!active) return;
      setPocketOptions(
        pockets.map((pocket) => normalizeSubcellar(pocket.name)).filter((name) => name.length > 0)
      );
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      if (!id) {
        navigate('/inventory');
        return;
      }

      setLoading(true);
      try {
        const loadedWine = await storageService.getWineById(id);
        if (!active) return;

        if (!loadedWine) {
          navigate('/inventory');
          return;
        }

        setWine(loadedWine);
        setPurchasePrice(String(loadedWine.purchase_price ?? 0));

        const history = await storageService.getTastings(id);
        if (!active) return;
        setTastings(history);
      } catch (error) {
        if (!active) return;
        showToast(normalizeError(error, 'Weindaten konnten nicht geladen werden.'), 'error');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [id, navigate, showToast]);

  // Every mutation on this page also changes the cellar list the app keeps in
  // memory. Only drinking used to report back, so a purchase or an edit left
  // the list stale until a reload.
  const reloadWine = useCallback(async () => {
    if (!id) return;
    const [loadedWine, history] = await Promise.all([
      storageService.getWineById(id),
      storageService.getTastings(id)
    ]);
    if (loadedWine) setWine(loadedWine);
    setTastings(history);
    onChanged?.();
  }, [id, onChanged]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'buy') {
      setIsPurchaseModalOpen(true);
    }
  }, [location.search]);

  const aiDetails = useMemo(() => wine?.ai_details, [wine?.ai_details]);
  const metrics = useMemo(() => (wine ? computeWindowMetrics(wine) : null), [wine]);
  const ratings = useMemo(() => buildRatings(wine?.scores), [wine?.scores]);
  const sources = useMemo(() => buildSourceLinks(wine?.ai_sources), [wine?.ai_sources]);
  const aromas = useMemo(() => buildAromas(wine?.aromas), [wine?.aromas]);
  const structureRows = useMemo(() => (wine ? buildStructureRows(wine, aiDetails) : null), [wine, aiDetails]);
  const quickFacts = useMemo(() => (wine ? buildQuickFacts(wine, aiDetails) : []), [wine, aiDetails]);
  const professionalFacts = useMemo(() => (wine ? buildProfessionalFacts(wine, aiDetails) : []), [wine, aiDetails]);
  const headerDescription = useMemo(() => (wine ? buildHeaderDescription(wine, aiDetails) : null), [wine, aiDetails]);
  const pairings = useMemo<PairingItem[]>(
    () =>
      (wine?.pairings ?? []).map((item) => ({
        item: item.item,
        category: item.category,
        note: item.note
      })),
    [wine?.pairings]
  );
  const handleJumpToSection = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const target = document.getElementById(`section-${tab}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const canMutate = !isSaving;
  const updateEditField = useCallback((field: keyof EditFormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const openEditModal = useCallback(() => {
    if (!wine) return;

    setEditForm({
      name: wine.name ?? '',
      producer: wine.producer ?? '',
      vintage: String(wine.vintage ?? ''),
      region: wine.region ?? '',
      subcellar: wine.subcellar ?? '',
      appellation: wine.appellation ?? '',
      country: wine.country ?? '',
      quantity: String(wine.quantity ?? 0),
      category: wine.category ?? '',
      wine_type: wine.wine_type ?? '',
      format: wine.format ?? '',
      purchase_price: String(wine.purchase_price ?? ''),
      market_price: String(wine.market_price ?? ''),
      drink_start: String(wine.drink_start ?? ''),
      drink_end: String(wine.drink_end ?? ''),
      peak_year: String(wine.peak_year ?? ''),
      alcohol_percent: String(wine.alcohol_percent ?? ''),
      vineyard: wine.vineyard ?? '',
      subregion: wine.subregion ?? '',
      closure_type: wine.closure_type ?? '',
      fermentation: wine.fermentation ?? '',
      aging_process: wine.aging_process ?? '',
      farming: wine.farming ?? '',
      confidence: wine.confidence ?? '',
      wishlist: wine.wishlist ? 'true' : 'false',
      is_favorite: wine.is_favorite ? 'true' : 'false',
      grapes: grapesToFormState(wine.grapes),
      structure: structureToFormState(wine.structure),
      scores: scoresToFormState(wine.scores),
      aromas_json: toJsonText(wine.aromas ?? [], '[]'),
      pairings_json: toJsonText(wine.pairings ?? [], '[]'),
      ai_details_json: toJsonText(wine.ai_details ?? {}, '{}'),
      ai_sources_json: toJsonText(wine.ai_sources ?? [], '[]'),
      missing_fields_json: toJsonText(wine.missing_fields ?? [], '[]')
    });
    setIsEditModalOpen(true);
  }, [wine]);

  const handleAdjustStock = useCallback(
    async (delta: number) => {
      if (!wine || !canMutate) return;

      setIsSaving(true);
      try {
        const updated = await storageService.adjustStock(wine.id, delta, 'detail');
        if (updated) {
          setWine(updated as Wine);
          onChanged?.();
        }
      } catch (error) {
        showToast(normalizeError(error, 'Bestand konnte nicht aktualisiert werden.'), 'error');
      } finally {
        setIsSaving(false);
      }
    },
    [wine, canMutate, showToast, onChanged]
  );

  const handleRegisterPurchase = useCallback(async () => {
    if (!wine || !canMutate) return;

    const qty = Math.max(1, Math.round(toNullableNumber(purchaseQty) ?? 1));
    const price = Math.max(0, toNullableNumber(purchasePrice) ?? 0);

    setIsSaving(true);
    try {
      const updated = await storageService.recordPurchase({
        wine_id: wine.id,
        quantity: qty,
        price_per_bottle: price,
        date: new Date().toISOString()
      });

      if (updated) {
        setWine(updated);
        setIsPurchaseModalOpen(false);
        setPurchaseQty(1);
        showToast('Nachkauf gespeichert.', 'success');
        onChanged?.();
      }
    } catch (error) {
      showToast(normalizeError(error, 'Nachkauf konnte nicht gespeichert werden.'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [wine, canMutate, purchaseQty, purchasePrice, showToast, onChanged]);

  const handleDelete = useCallback(async () => {
    if (!wine || !canMutate) return;
    if (!window.confirm('Diesen Wein in den Papierkorb verschieben?')) return;

    setIsSaving(true);
    try {
      await storageService.softDeleteWine(wine.id, 'Manuell gelöscht');
      showToast('Wein wurde in den Papierkorb verschoben.', 'success');
      onChanged?.();
      navigate('/inventory');
    } catch (error) {
      showToast(normalizeError(error, 'Löschen fehlgeschlagen.'), 'error');
      setIsSaving(false);
    }
  }, [wine, canMutate, navigate, showToast, onChanged]);

  const handleSaveEdit = useCallback(async () => {
    if (!wine || !canMutate) return;

    const name = editForm.name.trim();
    if (!name) {
      showToast('Name ist erforderlich.', 'error');
      return;
    }

    const vintage = toNullableInt(editForm.vintage);
    if (vintage === null) {
      showToast('Bitte gültigen Jahrgang eintragen.', 'error');
      return;
    }

    const quantity = Math.max(0, Math.round(toNullableNumber(editForm.quantity) ?? 0));
    const purchasePrice = Math.max(0, toNullableNumber(editForm.purchase_price) ?? wine.purchase_price ?? 0);
    const marketPrice = toNullableNumber(editForm.market_price) ?? undefined;
    const drinkStart = toNullableInt(editForm.drink_start) ?? wine.drink_start;
    const drinkEnd = toNullableInt(editForm.drink_end) ?? wine.drink_end;
    const peakYear = toNullableInt(editForm.peak_year) ?? undefined;
    const alcoholPercent = toNullableNumber(editForm.alcohol_percent) ?? undefined;
    const category = parseCategory(editForm.category) ?? wine.category;
    const wineType = parseWineType(editForm.wine_type);
    const format = parseFormat(editForm.format) ?? wine.format;
    const confidence = parseConfidenceValue(editForm.confidence);

    if (drinkStart > drinkEnd) {
      showToast('Trinkfenster ist ungültig: Start darf nicht nach Ende liegen.', 'error');
      return;
    }

    const grapes: Wine['grapes'] = grapesFromFormState(editForm.grapes);
    const structure: Wine['structure'] = structureFromFormState(editForm.structure);
    const scores: Wine['scores'] = scoresFromFormState(editForm.scores);
    let aromas: Wine['aromas'] = wine.aromas;
    let pairings: Wine['pairings'] = wine.pairings;
    let aiDetailsValue: WineDetails | undefined = wine.ai_details;
    let aiSourcesValue: Wine['ai_sources'] = wine.ai_sources;
    let missingFieldsValue: string[] | undefined = wine.missing_fields;

    try {
      aromas = parseJsonField(editForm.aromas_json, 'Aromen', isAromaArray, wine.aromas ?? []);
      pairings = parseJsonField(editForm.pairings_json, 'Pairings', isPairingsArray, wine.pairings ?? []);
      aiDetailsValue = parseJsonField(editForm.ai_details_json, 'AI Details', isWineDetails, wine.ai_details ?? {});
      aiSourcesValue = parseJsonField(editForm.ai_sources_json, 'AI Quellen', isAiSources, wine.ai_sources ?? []);
      missingFieldsValue = parseJsonField(editForm.missing_fields_json, 'Fehlende Felder', isStringArray, wine.missing_fields ?? []);
    } catch (error) {
      showToast(normalizeError(error, 'JSON-Felder sind ungültig.'), 'error');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await storageService.saveWine({
        ...wine,
        name,
        producer: editForm.producer.trim() || undefined,
        vintage,
        region: editForm.region.trim() || '',
        subcellar: editForm.subcellar.trim() || undefined,
        appellation: editForm.appellation.trim() || undefined,
        country: editForm.country.trim() || undefined,
        quantity,
        category,
        wine_type: wineType,
        format,
        purchase_price: purchasePrice,
        market_price: marketPrice,
        drink_start: drinkStart,
        drink_end: drinkEnd,
        peak_year: peakYear,
        alcohol_percent: alcoholPercent,
        vineyard: editForm.vineyard.trim() || undefined,
        subregion: editForm.subregion.trim() || undefined,
        closure_type: editForm.closure_type.trim() || undefined,
        fermentation: editForm.fermentation.trim() || undefined,
        aging_process: editForm.aging_process.trim() || undefined,
        farming: editForm.farming.trim() || undefined,
        confidence,
        wishlist: editForm.wishlist === 'true',
        is_favorite: editForm.is_favorite === 'true',
        grapes,
        aromas,
        structure,
        pairings,
        scores,
        ai_details: aiDetailsValue,
        ai_sources: aiSourcesValue,
        missing_fields: missingFieldsValue,
        updated_at: new Date().toISOString()
      });

      setWine(updated);
      setIsEditModalOpen(false);
      showToast('Wein wurde gespeichert.', 'success');
      onChanged?.();
    } catch (error) {
      showToast(normalizeError(error, 'Speichern fehlgeschlagen.'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [wine, canMutate, editForm, showToast, onChanged]);

  const wineImages = useMemo<Record<ImageSlot, string | null>>(
    () => (wine ? imageStorageService.getImagesFromWine(wine) : { bottle: null, label: null, case: null }),
    [wine]
  );
  const heroImage = wineImages.bottle || wineImages.label || wineImages.case;

  const handleImageUpload = useCallback(async (slot: ImageSlot, file: File) => {
    if (!wine) return;
    const url = await imageStorageService.upload(wine.id, slot, file);
    const updatedDetails = imageStorageService.mergeImageUrl(wine.ai_details, slot, url);
    const updated = await storageService.saveWine({ ...wine, ai_details: updatedDetails, updated_at: new Date().toISOString() });
    setWine(updated);
    showToast('Bild hochgeladen.', 'success');
  }, [wine, showToast]);

  const handleImageDelete = useCallback(async (slot: ImageSlot) => {
    if (!wine) return;
    await imageStorageService.delete(wine.id, slot);
    const updatedDetails = imageStorageService.mergeImageUrl(wine.ai_details, slot, null);
    const updated = await storageService.saveWine({ ...wine, ai_details: updatedDetails, updated_at: new Date().toISOString() });
    setWine(updated);
    showToast('Bild gelöscht.', 'success');
  }, [wine, showToast]);

  if (loading) {
    return (
      <>
        <InlineToast message={toast} onClose={() => setToast(null)} />
        <DetailSkeleton />
      </>
    );
  }

  if (!wine || !metrics || !structureRows) {
    return (
      <div className="min-h-screen px-6 py-12" style={{ backgroundColor: LUXURY_BG }}>
        <InlineToast message={toast} onClose={() => setToast(null)} />
        <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 text-center">
          <h2 className="font-serif text-2xl text-stone-900">Wein nicht gefunden</h2>
          <p className="mt-2 text-sm text-stone-500">Der Datensatz ist nicht verfügbar oder wurde gelöscht.</p>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="mt-6 rounded-full border border-stone-300 px-5 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: LUXURY_BG }}>
      <InlineToast key={toast?.id ?? 0} message={toast} onClose={() => setToast(null)} />

      {/* Hero wine image */}
      {heroImage && (
        <div className="relative w-full h-64 md:h-80 overflow-hidden">
          <img
            src={heroImage}
            alt={wine.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#FDFBF7] via-transparent to-transparent" />
        </div>
      )}

      <HeaderCard
        wine={wine}
        isSaving={isSaving}
        onBack={() => navigate(-1)}
        onOpenEdit={openEditModal}
        onOpenPurchase={() => setIsPurchaseModalOpen(true)}
        onDelete={handleDelete}
        onDrink={() => openBottleDialog(true)}
        onAdjust={handleAdjustStock}
        onOpenMove={() => setIsMoveOpen(true)}
      />

      <main className="mx-auto max-w-6xl px-6">
        <StickyTabNav active={activeTab} onChange={handleJumpToSection} tastingCount={tastings.length} />

        <div className="mt-8 space-y-8">
          <section id="section-overview" className="space-y-6 scroll-mt-24">
            <ShortDescriptionCard description={headerDescription} />
            <DrinkingWindowCard metrics={metrics} />
            <div className="grid gap-6 xl:grid-cols-12">
              <div className="space-y-6 xl:col-span-8">
                <ProfessionalFactsCard items={professionalFacts} />
              </div>
              <div className="space-y-6 xl:col-span-4">
                <FactsDefinitionList items={quickFacts} />
                <RatingsCard ratings={ratings} />
              </div>
            </div>
          </section>

          <section id="section-terroir" className="grid gap-6 scroll-mt-24 lg:grid-cols-2">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 flex items-center gap-2 font-serif text-xl text-stone-900">
                <MapPin className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Herkunft & Terroir
              </h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Region" value={wine.region} />
                <TerroirRow label="Subregion" value={aiDetails?.identification?.subregion} />
                <TerroirRow label="Appellation" value={wine.appellation} />
                <TerroirRow label="Boden" value={aiDetails?.terroir?.soil_types?.join(', ')} />
                <TerroirRow label="Klima" value={aiDetails?.terroir?.climate} />
                <TerroirRow label="Exposition" value={aiDetails?.terroir?.exposure} />
              </dl>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 font-serif text-xl text-stone-900">Ausbau</h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Gärung" value={wine.fermentation ?? aiDetails?.vinification?.fermentation_vessel} />
                <TerroirRow label="Ausbau" value={wine.aging_process ?? aiDetails?.vinification?.aging_vessel} />
                <TerroirRow label="Holztyp" value={aiDetails?.vinification?.oak_type} />
                <TerroirRow label="Monate" value={aiDetails?.vinification?.aging_months ? `${aiDetails.vinification.aging_months} Monate` : null} />
                <TerroirRow label="Anbau" value={wine.farming} />
              </dl>
            </section>
          </section>

          <section id="section-sensory" className="space-y-6 scroll-mt-24">
            <div className="grid gap-6 lg:grid-cols-2">
              <AromaCard aromas={aromas} />
              <StructureCard rows={structureRows} />
            </div>
            <PairingsCard pairings={pairings} />
          </section>

          <section id="section-cellar" className="scroll-mt-24">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 font-serif text-xl text-stone-900">Bestand & Einkauf</h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Bestand" value={`${wine.quantity} Flaschen`} />
                <TerroirRow label="Unterkeller" value={wine.subcellar} />
                <TerroirRow label="Einstand" value={formatCurrency(wine.purchase_price ?? 0)} />
                <TerroirRow label="Marktpreis" value={wine.market_price ? formatCurrency(wine.market_price) : null} />
                <TerroirRow label="Kaufquelle" value={aiDetails?.cellar?.purchase_source} />
                <TerroirRow label="Lagerort" value={aiDetails?.cellar?.storage_location} />
              </dl>
            </section>
          </section>

          <section id="section-notes" className="scroll-mt-24">
            <NotesTimeline tastings={tastings} onCreateNote={() => openBottleDialog(false)} disabled={!canMutate} />
          </section>
        </div>
      </main>

      <SourceFooter sources={sources} />

      <OpenBottleDialog
        open={openBottleMode !== null}
        wine={wine}
        source="detail"
        defaultConsume={openBottleMode?.consume ?? true}
        onClose={() => setOpenBottleMode(null)}
        onSaved={(message) => {
          setOpenBottleMode(null);
          showToast(message, 'success');
          void reloadWine();
        }}
      />

      <MoveToPocketDialog
        open={isMoveOpen}
        wine={wine}
        pocketOptions={pocketOptions}
        onClose={() => setIsMoveOpen(false)}
        onMoved={(message) => {
          setIsMoveOpen(false);
          showToast(message, 'success');
          void reloadWine();
        }}
      />

      <Dialog open={isPurchaseModalOpen} title="Nachkauf" onClose={() => setIsPurchaseModalOpen(false)}>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
            <button
              type="button"
              onClick={() => setPurchaseQty((prev) => Math.max(1, prev - 1))}
              className="rounded-full p-2 text-stone-700 hover:bg-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-serif text-2xl text-stone-900">{purchaseQty}</span>
            <button type="button" onClick={() => setPurchaseQty((prev) => prev + 1)} className="rounded-full p-2 text-stone-700 hover:bg-white">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <label className="block text-sm text-stone-700">
            Preis pro Flasche
            <input
              type="text"
              inputMode="decimal"
              placeholder="z. B. 8,99"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
            />
          </label>

          <button
            type="button"
            onClick={handleRegisterPurchase}
            disabled={!canMutate}
            className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT_BURGUNDY }}
          >
            Speichern
          </button>
        </div>
      </Dialog>

      <Dialog open={isEditModalOpen} title="Wein bearbeiten" onClose={() => setIsEditModalOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveEdit();
          }}
        >
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {/* Image upload section */}
            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Fotos</h4>
              <div className="grid grid-cols-3 gap-3">
                {(['bottle', 'label', 'case'] as const).map((slot) => (
                  <ImageUploader
                    key={slot}
                    label={slot === 'bottle' ? 'Flasche' : slot === 'label' ? 'Etikett' : 'Kiste'}
                    currentUrl={wineImages[slot]}
                    onUpload={(file) => handleImageUpload(slot, file)}
                    onDelete={() => handleImageDelete(slot)}
                    disabled={isSaving}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Basisdaten</h4>
              <FormField label="Name" value={editForm.name} onChange={(value) => updateEditField('name', value)} required />
              <FormField label="Produzent" value={editForm.producer} onChange={(value) => updateEditField('producer', value)} />
              <FormField label="Jahrgang" value={editForm.vintage} onChange={(value) => updateEditField('vintage', value)} type="number" required />
              <FormField label="Region" value={editForm.region} onChange={(value) => updateEditField('region', value)} required />
              <FormField label="Unterkeller" value={editForm.subcellar} onChange={(value) => updateEditField('subcellar', value)} />
              <FormField label="Appellation" value={editForm.appellation} onChange={(value) => updateEditField('appellation', value)} />
              <FormField label="Land" value={editForm.country} onChange={(value) => updateEditField('country', value)} />
              <FormField label="Subregion" value={editForm.subregion} onChange={(value) => updateEditField('subregion', value)} />
              <FormField label="Lage / Vineyard" value={editForm.vineyard} onChange={(value) => updateEditField('vineyard', value)} />
            </section>

            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Keller & Klassifikation</h4>
              <SelectField
                label="Kategorie"
                value={editForm.category}
                options={[{ value: '', label: 'Bitte wählen' }, ...CATEGORY_OPTIONS.map((item) => ({ value: item, label: item }))]}
                onChange={(value) => updateEditField('category', value)}
              />
              <SelectField
                label="Weintyp"
                value={editForm.wine_type}
                options={[{ value: '', label: 'Bitte wählen' }, ...WINE_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))]}
                onChange={(value) => updateEditField('wine_type', value)}
              />
              <SelectField
                label="Flaschenformat"
                value={editForm.format}
                options={[{ value: '', label: 'Bitte wählen' }, ...FORMAT_OPTIONS.map((item) => ({ value: item, label: item }))]}
                onChange={(value) => updateEditField('format', value)}
              />
              <FormField label="Menge" value={editForm.quantity} onChange={(value) => updateEditField('quantity', value)} type="number" required />
              <FormField label="Kaufpreis" value={editForm.purchase_price} onChange={(value) => updateEditField('purchase_price', value)} />
              <FormField label="Marktpreis" value={editForm.market_price} onChange={(value) => updateEditField('market_price', value)} />
              <FormField label="Alkohol %" value={editForm.alcohol_percent} onChange={(value) => updateEditField('alcohol_percent', value)} type="number" />
              <FormField label="Trinkstart" value={editForm.drink_start} onChange={(value) => updateEditField('drink_start', value)} type="number" />
              <FormField label="Trinkende" value={editForm.drink_end} onChange={(value) => updateEditField('drink_end', value)} type="number" />
              <FormField label="Peak Year" value={editForm.peak_year} onChange={(value) => updateEditField('peak_year', value)} type="number" />
              <FormField label="Verschluss" value={editForm.closure_type} onChange={(value) => updateEditField('closure_type', value)} />
              <FormField label="Gärung" value={editForm.fermentation} onChange={(value) => updateEditField('fermentation', value)} />
              <FormField label="Ausbau" value={editForm.aging_process} onChange={(value) => updateEditField('aging_process', value)} />
              <FormField label="Anbau" value={editForm.farming} onChange={(value) => updateEditField('farming', value)} />
              <SelectField
                label="Confidence"
                value={editForm.confidence}
                options={[
                  { value: '', label: 'Nicht gesetzt' },
                  { value: 'high', label: 'high' },
                  { value: 'medium', label: 'medium' },
                  { value: 'low', label: 'low' }
                ]}
                onChange={(value) => updateEditField('confidence', value)}
              />
              <SelectField
                label="Wishlist"
                value={editForm.wishlist}
                options={[
                  { value: 'false', label: 'Nein' },
                  { value: 'true', label: 'Ja' }
                ]}
                onChange={(value) => updateEditField('wishlist', value)}
              />
              <SelectField
                label="Favorit"
                value={editForm.is_favorite}
                options={[
                  { value: 'false', label: 'Nein' },
                  { value: 'true', label: 'Ja' }
                ]}
                onChange={(value) => updateEditField('is_favorite', value)}
              />
            </section>

            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Rebsorten</h4>
              <GrapesField
                value={editForm.grapes}
                onChange={(next) => setEditForm((prev) => ({ ...prev, grapes: next }))}
              />
            </section>

            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Struktur</h4>
              <StructureSlidersField
                value={editForm.structure}
                onChange={(next) => setEditForm((prev) => ({ ...prev, structure: next }))}
              />
            </section>

            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Kritiker-Scores</h4>
              <ScoresField
                value={editForm.scores}
                onChange={(next) => setEditForm((prev) => ({ ...prev, scores: next }))}
              />
            </section>

          </div>

          <button
            type="submit"
            disabled={!canMutate}
            className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT_BURGUNDY }}
          >
            Speichern
          </button>
        </form>
      </Dialog>
    </div>
  );
};

const TerroirRow = memo(function TerroirRow({ label, value }: { label: string; value: string | null | undefined }) {
  const safeValue = toNullableString(value) ?? '—';
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-stone-100 pb-2 last:border-none last:pb-0">
      <dt className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</dt>
      <dd className="text-sm leading-6 text-stone-800">{safeValue}</dd>
    </div>
  );
});

const FormField = memo(function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-stone-700">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      />
    </label>
  );
});

const SelectField = memo(function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm text-stone-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
});

const GrapesField = memo(function GrapesField({
  value,
  onChange
}: {
  value: GrapeFormEntry[];
  onChange: (next: GrapeFormEntry[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<GrapeFormEntry>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Rebsorte, z. B. Cabernet Sauvignon"
            value={row.name}
            onChange={(event) => updateRow(index, { name: event.target.value })}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="number"
            placeholder="%"
            min={0}
            max={100}
            value={row.percentage}
            onChange={(event) => updateRow(index, { percentage: event.target.value })}
            className="w-20 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-alabaster hover:text-burgundy"
            aria-label="Rebsorte entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: '', percentage: '' }])}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-burgundy/40 hover:text-burgundy"
      >
        <Plus className="h-3.5 w-3.5" /> Rebsorte hinzufügen
      </button>
    </div>
  );
});

const STRUCTURE_SLIDER_FIELDS: {
  key: keyof StructureFormState;
  label: string;
  lowLabel: string;
  highLabel: string;
}[] = [
  { key: 'acidity', label: 'Säure', lowLabel: 'mild', highLabel: 'straff' },
  { key: 'tannin', label: 'Tannin', lowLabel: 'weich', highLabel: 'kräftig' },
  { key: 'body', label: 'Körper', lowLabel: 'leicht', highLabel: 'voll' },
  { key: 'sweetness', label: 'Süße', lowLabel: 'trocken', highLabel: 'süß' },
  { key: 'oak', label: 'Holzausbau', lowLabel: 'kein Holz', highLabel: 'stark geprägt' }
];

const StructureSlidersField = memo(function StructureSlidersField({
  value,
  onChange
}: {
  value: StructureFormState;
  onChange: (next: StructureFormState) => void;
}) {
  return (
    <div className="space-y-4">
      {STRUCTURE_SLIDER_FIELDS.map(({ key, label, lowLabel, highLabel }) => {
        const current = value[key];
        const isSet = current !== null;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">{label}</span>
              <label className="flex items-center gap-2 text-xs text-stone-500">
                <input
                  type="checkbox"
                  checked={isSet}
                  onChange={(event) =>
                    onChange({ ...value, [key]: event.target.checked ? current ?? 3 : null })
                  }
                />
                erfasst
              </label>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={current ?? 3}
              disabled={!isSet}
              onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
              className="w-full accent-[#5B1E2D] disabled:opacity-40"
            />
            <div className="flex justify-between text-[10px] uppercase tracking-[0.1em] text-stone-400">
              <span>{lowLabel}</span>
              <span>{isSet ? current : '—'}</span>
              <span>{highLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const ScoresField = memo(function ScoresField({
  value,
  onChange
}: {
  value: ScoreFormEntry[];
  onChange: (next: ScoreFormEntry[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<ScoreFormEntry>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Kritiker, z. B. Parker"
            value={row.critic}
            onChange={(event) => updateRow(index, { critic: event.target.value })}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="text"
            placeholder="Score"
            value={row.score}
            onChange={(event) => updateRow(index, { score: event.target.value })}
            className="w-20 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="number"
            placeholder="Jahr"
            value={row.year}
            onChange={(event) => updateRow(index, { year: event.target.value })}
            className="w-24 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-alabaster hover:text-burgundy"
            aria-label="Score entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { critic: '', score: '', year: '' }])}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-burgundy/40 hover:text-burgundy"
      >
        <Plus className="h-3.5 w-3.5" /> Score hinzufügen
      </button>
    </div>
  );
});
