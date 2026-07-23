import { evaluateWineDrinkability } from '../../utils.ts';
import { CriticScore, Wine, WineDetails } from '../../types.ts';

export interface WindowMetrics {
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

export interface NormalizedRating {
  critic: string;
  scoreValue: number;
  scoreLabel: string;
  year?: number;
}

export interface SourceLink {
  title: string;
  url: string;
  domain: string;
}

export interface FactItem {
  label: string;
  value: string;
}

export interface ProfessionalFactGroup {
  title: string;
  subtitle: string;
  min: number;
  max: number;
}

export interface AromaEntry {
  tag: string;
  intensity: number;
}

export interface PairingItem {
  item: string;
  category?: string;
  note?: string;
}

export interface StructureRows {
  acidity: number | null;
  tannin: number | null;
  body: number | null;
  sweetness: number | null;
  sweetnessText: string | null;
  oak: number | null;
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (normalized.length === 0) return null;
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const toNullableInt = (value: unknown): number | null => {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed);
};

export const mapIntensity = (value: unknown): number | null => {
  const numeric = toNullableNumber(value);
  if (numeric !== null) return clamp(Math.round(numeric), 1, 5);

  const text = toNullableString(value)?.toLowerCase();
  if (!text) return null;
  if (text === 'high' || text === 'hoch') return 5;
  if (text === 'medium' || text === 'mittel') return 3;
  if (text === 'low' || text === 'niedrig') return 2;
  return null;
};

export const sanitizeHttpUrl = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

export const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const extractFactOrder = (label: string): number => {
  const match = label.match(/^(\d+)\./);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[1], 10);
};

export const normalizeFactLabel = (label: string): string => label.replace(/^\d+\.\s*/, '').trim();

export const splitByDelimiter = (value: string, delimiter: string): string[] =>
  value
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const professionalFactGroups: ProfessionalFactGroup[] = [
  { title: 'Identität', subtitle: 'Herkunft, Stil, Jahrgang', min: 1, max: 6 },
  { title: 'Ausbau & Struktur', subtitle: 'Kellertechnik und Textur', min: 7, max: 12 },
  { title: 'Aromatik & Reife', subtitle: 'Duftbild, Fenster, Provenienz', min: 13, max: 15 }
];

export const normalizeScore = (score: CriticScore['score']): number | null => {
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  if (typeof score === 'string') {
    const parsed = Number.parseFloat(score.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const toScoreLabel = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const normalizeError = (error: unknown, fallback = 'Unbekannter Fehler'): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
};

export const computeWindowMetrics = (wine: Wine): WindowMetrics => {
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

export const buildRatings = (scores: CriticScore[] | undefined): NormalizedRating[] => {
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

export const buildSourceLinks = (sources: Wine['ai_sources'] | undefined): SourceLink[] => {
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

export const buildAromas = (aromas: Wine['aromas']): { primary: AromaEntry[]; secondary: AromaEntry[] } => {
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

export const getSweetnessText = (details: WineDetails | undefined): string | null => {
  const value = details?.grapes_style?.sweetness;
  return toNullableString(value);
};

export const buildStructureRows = (wine: Wine, details: WineDetails | undefined): StructureRows => ({
  acidity: mapIntensity(wine.structure?.acidity),
  tannin: mapIntensity(wine.structure?.tannin),
  body: mapIntensity(wine.structure?.body),
  sweetness: mapIntensity(wine.structure?.sweetness),
  sweetnessText: getSweetnessText(details),
  oak: mapIntensity(wine.structure?.oak)
});

export const buildQuickFacts = (wine: Wine, details: WineDetails | undefined): FactItem[] => [
  { label: 'Typ', value: wine.wine_type ?? details?.identification?.wine_type ?? '—' },
  { label: 'Land', value: wine.country ?? details?.identification?.country ?? '—' },
  { label: 'Region', value: wine.region ?? details?.identification?.region ?? '—' },
  { label: 'Unterkeller', value: wine.subcellar ?? '—' },
  { label: 'Appellation', value: wine.appellation ?? details?.identification?.appellation ?? '—' },
  { label: 'Alkohol', value: wine.alcohol_percent ? `${wine.alcohol_percent}% vol` : '—' },
  { label: 'Flaschengröße', value: wine.format ?? details?.identification?.bottle_size ?? '—' },
  { label: 'Verschluss', value: wine.closure_type ?? details?.identification?.closure_type ?? '—' }
];

export const joinDefined = (parts: Array<string | null | undefined>, separator = ' | '): string => {
  const normalized = parts
    .map((part) => toNullableString(part))
    .filter((part): part is string => Boolean(part));
  return normalized.length > 0 ? normalized.join(separator) : '—';
};

export const formatNumberValue = (value: number | null | undefined, unit?: string): string | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return unit ? `${value}${unit}` : String(value);
};

export const formatStructureValue = (value: number | null | undefined, descriptor?: string | null): string => {
  const score = value ? `${value}/5` : '—';
  const note = toNullableString(descriptor);
  return note ? `${score} (${note})` : score;
};

export const formatYearDelta = (delta: number): string => {
  const abs = Math.abs(delta);
  const unit = abs === 1 ? 'Jahr' : 'Jahre';
  return `${abs} ${unit}`;
};

export const buildCoreAromaProfile = (wine: Wine, details: WineDetails | undefined): string => {
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

export const buildVarietiesText = (wine: Wine, details: WineDetails | undefined): string => {
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

export const buildProfessionalFacts = (wine: Wine, details: WineDetails | undefined): FactItem[] => {
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

export const buildHeaderDescription = (wine: Wine, details: WineDetails | undefined): string | null => {
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

export const pairingIconLabel = (category?: string): string => {
  if (!category) return 'Pairing';
  const normalized = category.toLowerCase();
  if (normalized.includes('dessert')) return 'Dessert';
  if (normalized.includes('starter') || normalized.includes('vorspeise')) return 'Vorspeise';
  if (normalized.includes('cheese') || normalized.includes('käse')) return 'Käse';
  return 'Hauptgang';
};

export const toneClass: Record<WindowMetrics['statusTone'], string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  hold: 'bg-amber-50 text-amber-700 border-amber-100',
  past: 'bg-rose-50 text-rose-700 border-rose-100',
  unknown: 'bg-stone-100 text-stone-500 border-stone-200'
};
