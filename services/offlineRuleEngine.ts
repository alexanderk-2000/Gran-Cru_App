export interface OfflineRuleEngineInput {
  raw_input: string;
  producer_hint?: string | null;
  vintage_hint?: number | null;
  country_hint?: string | null;
}

type WineTypeDerived = 'White' | 'Red' | 'Rosé' | 'Sparkling' | null;
type SweetnessDerived = 'dry' | 'off-dry' | 'sweet' | null;

interface ValidationIssue {
  code: string;
  message: string;
}

export interface OfflineRuleEngineOutput {
  normalized_query: {
    producer: string | null;
    name: string | null;
    vintage: number | null;
    country: string | null;
    region: string | null;
    appellation_or_vineyard: string | null;
    quality_terms: string[];
    style_terms: string[];
  };
  derived: {
    wine_type: WineTypeDerived;
    sweetness: SweetnessDerived;
  };
  search: {
    tokens_primary: string[];
    tokens_secondary: string[];
    query_string: string;
    synonyms: string[];
    stopwords_removed: string[];
  };
  validation: {
    confidence: number;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    missing: string[];
  };
}

const QUALITY_TERMS = [
  'grosse lage',
  'großes gewächs',
  'erste lage',
  'grand cru classé',
  'grand cru classe',
  'grand cru',
  '1er cru',
  'trockenbeerenauslese',
  'beerenauslese',
  'spätlese',
  'spaetlese',
  'auslese',
  'kabinett',
  'riserva',
  'reserve',
  'classico',
  'superiore',
  'vdp',
  'gg',
  'tba'
];

const STYLE_TERMS = [
  'extra brut',
  'off-dry',
  'demi-sec',
  'halbtrocken',
  'fruchtsüß',
  'fruchtsuess',
  'fruchtsüss',
  'feinherb',
  'trocken',
  'fruchtsuß',
  'sweet',
  'brut',
  'dry',
  'sec',
  'süß',
  'suess',
  'sekt',
  'spumante'
];

const GRAPE_ALIASES: Record<string, string> = {
  riesling: 'riesling',
  chardonnay: 'chardonnay',
  'sauvignon blanc': 'sauvignon blanc',
  chenin: 'chenin blanc',
  'chenin blanc': 'chenin blanc',
  'grüner veltliner': 'grüner veltliner',
  'gruener veltliner': 'grüner veltliner',
  weißburgunder: 'weißburgunder',
  weissburgunder: 'weißburgunder',
  'pinot blanc': 'weißburgunder',
  spätburgunder: 'spätburgunder',
  spaetburgunder: 'spätburgunder',
  'pinot noir': 'spätburgunder',
  cabernet: 'cabernet sauvignon',
  'cabernet sauvignon': 'cabernet sauvignon',
  merlot: 'merlot',
  syrah: 'syrah',
  shiraz: 'shiraz',
  nebbiolo: 'nebbiolo',
  sangiovese: 'sangiovese',
  tempranillo: 'tempranillo'
};

const WHITE_GRAPES = new Set([
  'riesling',
  'chardonnay',
  'sauvignon blanc',
  'chenin blanc',
  'grüner veltliner',
  'weißburgunder'
]);

const RED_GRAPES = new Set([
  'spätburgunder',
  'cabernet sauvignon',
  'merlot',
  'syrah',
  'shiraz',
  'nebbiolo',
  'sangiovese',
  'tempranillo'
]);

const SPARKLING_TERMS = ['sekt', 'champagne', 'crémant', 'cremant', 'prosecco', 'cava', 'spumante'];
const ROSE_TERMS = ['rosé', 'rose'];
const STILL_QUALITY_TERMS = new Set([
  'gg',
  'grosse lage',
  'großes gewächs',
  'erste lage',
  'kabinett',
  'spätlese',
  'spaetlese',
  'auslese',
  'beerenauslese',
  'trockenbeerenauslese',
  'tba'
]);

const REGION_MAP: Record<string, string> = {
  mosel: 'Mosel',
  pfalz: 'Pfalz',
  rheingau: 'Rheingau',
  rheinhessen: 'Rheinhessen',
  nahem: 'Nahe',
  nahe: 'Nahe',
  baden: 'Baden',
  elsass: 'Elsass',
  alsace: 'Alsace',
  burgundy: 'Burgundy',
  bourgogne: 'Bourgogne',
  bordeaux: 'Bordeaux',
  piemont: 'Piemonte',
  piemonte: 'Piemonte',
  toscana: 'Toscana',
  tuscany: 'Tuscany'
};

const COUNTRY_MAP: Record<string, string> = {
  deutschland: 'Germany',
  germany: 'Germany',
  frankreich: 'France',
  france: 'France',
  italien: 'Italy',
  italy: 'Italy',
  österreich: 'Austria',
  oesterreich: 'Austria',
  austria: 'Austria',
  spanien: 'Spain',
  spain: 'Spain',
  portugal: 'Portugal',
  usa: 'USA',
  us: 'USA'
};

const PACKAGING_PATTERNS = [
  /\b\d+[,.]?\d*\s?(l|ml)\b/gi,
  /\bmagnum\b/gi,
  /\bdouble\s?magnum\b/gi
];

const SHOP_TERMS = ['flasche', 'kiste', 'karton', 'inkl', 'preis', 'versand', '€', 'eur'];
const FILLER_WORDS = ['der', 'die', 'das', 'und', 'mit', 'für', 'for', 'the', 'ein', 'eine', 'zu', 'vom'];

const PRODUCER_SUFFIXES = ['weingut', 'domaine', 'chateau', 'tenuta', 'cantina'];

const asSingleSpaces = (value: string): string => value.trim().replace(/\s+/g, ' ');

const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');

const normalizeDiacritics = (value: string): string =>
  value
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü');

const addSynonymPair = (synonyms: Set<string>, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return;
  const withAe = trimmed
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  const withUmlaut = trimmed
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
  if (withAe !== trimmed) synonyms.add(withAe);
  if (withUmlaut !== trimmed) synonyms.add(withUmlaut);
  if (trimmed.includes('ß')) synonyms.add(trimmed.replace(/ß/g, 'ss'));
  if (trimmed.includes('ss')) synonyms.add(trimmed.replace(/ss/g, 'ß'));
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractTermList = (text: string, terms: string[]): { found: string[]; cleaned: string } => {
  let cleaned = text;
  const found: string[] = [];
  const ordered = [...terms].sort((a, b) => b.length - a.length);
  for (const term of ordered) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    if (pattern.test(cleaned)) {
      found.push(term);
      cleaned = cleaned.replace(pattern, ' ');
      cleaned = asSingleSpaces(cleaned);
    }
  }
  return { found: [...new Set(found)], cleaned };
};

const detectGrapes = (text: string): string[] => {
  const result = new Set<string>();
  for (const [alias, canonical] of Object.entries(GRAPE_ALIASES)) {
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
    if (pattern.test(text)) result.add(canonical);
  }
  return [...result];
};

const dedupe = (items: string[]): string[] => [...new Set(items.filter((item) => item.trim().length > 0))];

export const runOfflineRuleEngine = (input: OfflineRuleEngineInput): OfflineRuleEngineOutput => {
  const rawInput = typeof input.raw_input === 'string' ? input.raw_input : '';
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  const stopwordsRemoved = new Set<string>();
  const synonyms = new Set<string>();

  const currentYear = new Date().getFullYear();

  let working = asSingleSpaces(rawInput.toLowerCase());
  if (!working) {
    errors.push({ code: 'EMPTY_AFTER_CLEAN', message: 'Eingabe ist leer.' });
  }

  working = normalizeDiacritics(working);

  for (const pattern of PACKAGING_PATTERNS) {
    const matches = working.match(pattern);
    if (matches) matches.forEach((match) => stopwordsRemoved.add(match));
    working = working.replace(pattern, ' ');
  }

  for (const word of SHOP_TERMS) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    if (pattern.test(working)) stopwordsRemoved.add(word);
    working = working.replace(pattern, ' ');
  }
  working = asSingleSpaces(working);

  const yearMatches = [...rawInput.matchAll(/\b(19\d{2}|20\d{2}|21\d{2})\b/g)]
    .map((entry) => Number(entry[1]))
    .filter((year) => year >= 1900 && year <= currentYear + 1);
  const uniqueYears = [...new Set(yearMatches)];
  let vintage: number | null = null;
  let hasUniqueVintage = false;

  if (uniqueYears.length === 1) {
    vintage = uniqueYears[0];
    hasUniqueVintage = true;
  } else if (uniqueYears.length > 1) {
    if (input.vintage_hint && uniqueYears.includes(input.vintage_hint)) {
      vintage = input.vintage_hint;
      warnings.push({
        code: 'MULTIPLE_VINTAGES',
        message: `Mehrere Jahrgänge erkannt (${uniqueYears.join(', ')}). Vintage-Hint ${input.vintage_hint} verwendet.`
      });
    } else {
      errors.push({
        code: 'MULTIPLE_VINTAGES',
        message: `Mehrere plausible Jahrgänge gefunden (${uniqueYears.join(', ')}).`
      });
    }
  }

  if (/\b\d{2}\b/.test(rawInput)) {
    warnings.push({
      code: 'AMBIGUOUS_VINTAGE_SHORT',
      message: '2-stelliger Jahrgang erkannt und nicht aufgelöst.'
    });
  }

  if (vintage !== null) {
    working = working.replace(new RegExp(`\\b${vintage}\\b`, 'g'), ' ');
    working = asSingleSpaces(working);
  }

  let producerFromText: string | null = null;
  let nameCandidate = working;

  const separatorMatch = working.match(/(.+?)(:| - )(.+)/);
  if (separatorMatch) {
    producerFromText = asSingleSpaces(separatorMatch[1]);
    nameCandidate = asSingleSpaces(separatorMatch[3]);
  } else if (working.startsWith('von ')) {
    const tokens = working.split(' ');
    if (tokens.length >= 2) {
      producerFromText = `${tokens[0]} ${tokens[1]}`.trim();
      nameCandidate = asSingleSpaces(tokens.slice(2).join(' '));
    }
  } else {
    const tokens = working.split(' ').filter(Boolean);
    const suffixIndex = tokens.findIndex((token) => PRODUCER_SUFFIXES.includes(token));
    if (suffixIndex >= 0) {
      const start = Math.max(0, suffixIndex - 1);
      const end = Math.min(tokens.length, suffixIndex + 3);
      producerFromText = asSingleSpaces(tokens.slice(start, end).join(' '));
      const remainder = [...tokens.slice(0, start), ...tokens.slice(end)];
      nameCandidate = asSingleSpaces(remainder.join(' '));
    }
  }

  const producerHint = input.producer_hint?.trim() || null;
  let producer = producerHint ?? producerFromText;
  if (producerHint && producerFromText) {
    const hint = producerHint.toLowerCase();
    const inferred = producerFromText.toLowerCase();
    const isConflict = !hint.includes(inferred) && !inferred.includes(hint);
    if (isConflict) {
      warnings.push({
        code: 'PRODUCER_CONFLICT',
        message: `Producer-Hint "${producerHint}" kollidiert mit Input "${producerFromText}".`
      });
    }
  }
  producer = producer ? toTitleCase(asSingleSpaces(producer)) : null;

  const qualityExtract = extractTermList(nameCandidate, QUALITY_TERMS);
  const styleExtract = extractTermList(qualityExtract.cleaned, STYLE_TERMS);
  let nameClean = styleExtract.cleaned;

  const qualityTerms = dedupe(qualityExtract.found);
  const styleTerms = dedupe(styleExtract.found);

  for (const word of FILLER_WORDS) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');
    if (pattern.test(nameClean)) stopwordsRemoved.add(word);
    nameClean = nameClean.replace(pattern, ' ');
    nameClean = asSingleSpaces(nameClean);
  }

  const allTextForContext = asSingleSpaces(`${working} ${qualityTerms.join(' ')} ${styleTerms.join(' ')}`);
  const grapes = detectGrapes(allTextForContext);

  let country: string | null = input.country_hint?.trim() || null;
  let region: string | null = null;
  for (const [token, canonical] of Object.entries(COUNTRY_MAP)) {
    if (!country && new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(allTextForContext)) {
      country = canonical;
    }
  }
  for (const [token, canonical] of Object.entries(REGION_MAP)) {
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(allTextForContext)) {
      region = canonical;
      break;
    }
  }

  let appellationOrVineyard: string | null = null;
  const tokens = allTextForContext.split(' ').filter(Boolean);
  const deMarkers = new Set(['ried', 'lage', 'paradiesgarten', 'juffer', 'brücke', 'bruecke', 'herzog']);
  for (let i = 0; i < tokens.length; i += 1) {
    if (deMarkers.has(tokens[i])) {
      appellationOrVineyard = i > 0 ? `${tokens[i - 1]} ${tokens[i]}` : tokens[i];
      break;
    }
  }
  if (!appellationOrVineyard) {
    const pattern = /(grand cru|1er cru|appellation|aoc|docg|doc|igt)/i;
    const match = allTextForContext.match(pattern);
    if (match) appellationOrVineyard = match[1];
  }
  appellationOrVineyard = appellationOrVineyard ? toTitleCase(appellationOrVineyard) : null;

  const hasGrandCruClasse = /grand cru class[ée]/i.test(allTextForContext);
  const hasRieslingContext = /\briesling\b/i.test(allTextForContext);
  const hasGermanLagePattern = /\b(paradiesgarten|juffer|ried|lage|brücke|bruecke|herzog)\b/i.test(allTextForContext);
  if (hasGrandCruClasse && (hasRieslingContext || hasGermanLagePattern)) {
    warnings.push({
      code: 'STYLE_MISMATCH',
      message: 'Mischung aus französischer Klassifikation und deutschem Lagen-/Riesling-Kontext erkannt.'
    });
  }

  const hasSparklingIndicator =
    SPARKLING_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(allTextForContext)) ||
    styleTerms.some((term) => term === 'spumante' || term === 'sekt');
  const hasRoseIndicator = ROSE_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(allTextForContext));
  const hasStillIndicator = qualityTerms.some((term) => STILL_QUALITY_TERMS.has(term));

  if (hasSparklingIndicator && hasStillIndicator) {
    errors.push({
      code: 'TYPE_CONFLICT',
      message: 'Sparkling-Indikator und klare Stillwein-Qualitätsbegriffe gleichzeitig erkannt.'
    });
  }

  let wineType: WineTypeDerived = null;
  const hasWhiteGrape = grapes.some((grape) => WHITE_GRAPES.has(grape));
  const hasRedGrape = grapes.some((grape) => RED_GRAPES.has(grape));

  if (hasRoseIndicator) {
    wineType = 'Rosé';
  } else if (hasSparklingIndicator) {
    wineType = 'Sparkling';
  } else if (hasWhiteGrape && !hasRedGrape) {
    wineType = 'White';
  } else if (hasRedGrape && !hasWhiteGrape) {
    wineType = 'Red';
  }

  const sweetnessBuckets = new Set<SweetnessDerived>();
  for (const style of styleTerms) {
    if (['trocken', 'dry', 'brut', 'extra brut', 'sec'].includes(style)) sweetnessBuckets.add('dry');
    if (['halbtrocken', 'feinherb', 'off-dry', 'demi-sec'].includes(style)) sweetnessBuckets.add('off-dry');
    if (['fruchtsüß', 'fruchtsuess', 'fruchtsüss', 'sweet', 'süß', 'suess', 'fruchtsuß'].includes(style)) sweetnessBuckets.add('sweet');
  }

  let sweetness: SweetnessDerived = null;
  if (sweetnessBuckets.size > 1) {
    errors.push({
      code: 'SWEETNESS_CONFLICT',
      message: `Widersprüchliche Süßeangaben erkannt (${[...sweetnessBuckets].join(', ')}).`
    });
  } else if (sweetnessBuckets.size === 1) {
    sweetness = [...sweetnessBuckets][0];
  }

  if (/[^aeiouyäöü\s]{4,}/i.test(nameClean)) {
    warnings.push({
      code: 'TYPO_SUSPECT',
      message: 'Ungewöhnliche Zeichenfolge erkannt, mögliche Tippfehler vorhanden.'
    });
  }

  const name = nameClean ? toTitleCase(nameClean) : null;
  if (!name && !producer && vintage === null) {
    errors.push({
      code: 'EMPTY_AFTER_CLEAN',
      message: 'Nach Bereinigung sind keine sinnvollen Suchtokens übrig.'
    });
  }

  const meaningfulTokens = [producer, name, vintage ? String(vintage) : null].filter(Boolean);
  if (meaningfulTokens.length < 2) {
    warnings.push({
      code: 'VERY_SHORT_QUERY',
      message: 'Sehr kurze Sucheingabe mit <2 sinnvollen Tokens.'
    });
  }

  const nameTokens = (name || '').split(' ').filter(Boolean);
  const primaryTokens = dedupe([
    producer || '',
    ...nameTokens,
    vintage ? String(vintage) : '',
    appellationOrVineyard || ''
  ]);
  const secondaryTokens = dedupe([
    region || '',
    country || '',
    ...qualityTerms,
    ...grapes
  ]);

  const queryString = asSingleSpaces(
    [vintage ? String(vintage) : '', producer || '', name || ''].filter(Boolean).join(' ')
  );

  for (const token of [...primaryTokens, ...secondaryTokens]) {
    addSynonymPair(synonyms, token.toLowerCase());
  }
  if (allTextForContext.includes('spaetlese') || allTextForContext.includes('spätlese')) {
    synonyms.add('spaetlese');
    synonyms.add('spätlese');
  }
  if (allTextForContext.includes('pinot noir') || allTextForContext.includes('spätburgunder') || allTextForContext.includes('spaetburgunder')) {
    synonyms.add('pinot noir');
    synonyms.add('spätburgunder');
    synonyms.add('spaetburgunder');
  }
  if (allTextForContext.includes('syrah') || allTextForContext.includes('shiraz')) {
    synonyms.add('syrah');
    synonyms.add('shiraz');
  }

  let confidence = 50;
  if (producer && name) confidence += 20;
  if (hasUniqueVintage) confidence += 10;
  if (grapes.length > 0) confidence += 10;
  confidence -= errors.length * 30;
  confidence -= warnings.length * 10;
  confidence = Math.max(0, Math.min(100, confidence));

  const missing = [
    producer ? null : 'producer',
    name ? null : 'name',
    vintage !== null ? null : 'vintage',
    country ? null : 'country',
    region ? null : 'region',
    appellationOrVineyard ? null : 'appellation_or_vineyard',
    wineType ? null : 'wine_type',
    sweetness ? null : 'sweetness'
  ].filter((entry): entry is string => Boolean(entry));

  return {
    normalized_query: {
      producer,
      name,
      vintage,
      country,
      region,
      appellation_or_vineyard: appellationOrVineyard,
      quality_terms: qualityTerms,
      style_terms: styleTerms
    },
    derived: {
      wine_type: wineType,
      sweetness
    },
    search: {
      tokens_primary: primaryTokens,
      tokens_secondary: secondaryTokens,
      query_string: queryString,
      synonyms: [...synonyms].sort(),
      stopwords_removed: [...stopwordsRemoved]
    },
    validation: {
      confidence,
      errors,
      warnings,
      missing
    }
  };
};
