import { Wine } from '../../types.ts';
import { normalizeCategory, normalizeFormat, normalizeSubcellar, normalizeWineType, toNumberOr, toOptionalNumber, toText } from './normalization.ts';
import { validateWineInput, WineValidationError } from './validation.ts';
import { findLikelyDuplicates } from './duplicateDetection.ts';

/**
 * Parses raw CSV text into rows of string cells. Auto-detects the delimiter
 * (comma or semicolon, the latter being common for German-locale exports)
 * from the header line, and supports RFC 4180 quoting (quoted fields,
 * embedded delimiters/newlines, doubled "" for an escaped quote).
 */
export const parseCsvText = (text: string): string[][] => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const headerLine = normalized.slice(0, normalized.indexOf('\n') === -1 ? undefined : normalized.indexOf('\n'));
  const delimiter = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ''));
};

export type CsvWineField =
  | 'name'
  | 'producer'
  | 'vintage'
  | 'region'
  | 'country'
  | 'appellation'
  | 'subregion'
  | 'vineyard'
  | 'subcellar'
  | 'barcode'
  | 'category'
  | 'wine_type'
  | 'format'
  | 'quantity'
  | 'purchase_price'
  | 'market_price'
  | 'alcohol_percent'
  | 'drink_start'
  | 'drink_end'
  | 'peak_year'
  | 'closure_type';

export interface CsvFieldDefinition {
  key: CsvWineField;
  label: string;
  required: boolean;
  aliases: string[];
}

/** Ordered list of Wine fields the CSV import can map to, matching the field set of the unified capture form. */
export const CSV_FIELD_DEFINITIONS: CsvFieldDefinition[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'wein', 'weinname', 'bezeichnung', 'title'] },
  { key: 'producer', label: 'Erzeuger', required: false, aliases: ['producer', 'erzeuger', 'winzer', 'weingut', 'hersteller'] },
  { key: 'vintage', label: 'Jahrgang', required: true, aliases: ['vintage', 'jahrgang', 'jahr', 'year'] },
  { key: 'region', label: 'Region', required: false, aliases: ['region', 'gebiet'] },
  { key: 'country', label: 'Land', required: false, aliases: ['country', 'land'] },
  { key: 'appellation', label: 'Appellation', required: false, aliases: ['appellation', 'lage'] },
  { key: 'subregion', label: 'Subregion', required: false, aliases: ['subregion', 'unterregion'] },
  { key: 'vineyard', label: 'Weinberg', required: false, aliases: ['vineyard', 'weinberg', 'lagenname'] },
  { key: 'subcellar', label: 'Unterkeller', required: false, aliases: ['subcellar', 'unterkeller', 'pocket', 'fach'] },
  { key: 'barcode', label: 'Barcode', required: false, aliases: ['barcode', 'ean', 'gtin'] },
  { key: 'category', label: 'Kategorie', required: false, aliases: ['category', 'kategorie'] },
  { key: 'wine_type', label: 'Weintyp', required: false, aliases: ['wine_type', 'winetype', 'typ', 'weintyp', 'farbe', 'color'] },
  { key: 'format', label: 'Format', required: false, aliases: ['format', 'flaschengröße', 'bottle_size', 'größe'] },
  { key: 'quantity', label: 'Menge', required: true, aliases: ['quantity', 'menge', 'anzahl', 'flaschen', 'bottles'] },
  { key: 'purchase_price', label: 'Kaufpreis', required: true, aliases: ['purchase_price', 'kaufpreis', 'preis', 'price'] },
  { key: 'market_price', label: 'Marktwert', required: false, aliases: ['market_price', 'marktwert', 'aktueller_wert'] },
  { key: 'alcohol_percent', label: 'Alkohol %', required: false, aliases: ['alcohol_percent', 'alkohol', 'alc', 'vol'] },
  { key: 'drink_start', label: 'Trinkfenster Start', required: false, aliases: ['drink_start', 'trinkbeginn', 'trinkfenster_start'] },
  { key: 'drink_end', label: 'Trinkfenster Ende', required: false, aliases: ['drink_end', 'trinkende', 'trinkfenster_ende'] },
  { key: 'peak_year', label: 'Höhepunkt', required: false, aliases: ['peak_year', 'höhepunkt', 'peak'] },
  { key: 'closure_type', label: 'Verschluss', required: false, aliases: ['closure_type', 'verschluss', 'closure'] }
];

const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export type CsvColumnMapping = Partial<Record<CsvWineField, number>>;

/** Auto-suggests a column mapping by matching normalized CSV headers against known field aliases. */
export const guessCsvColumnMapping = (headers: string[]): CsvColumnMapping => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: CsvColumnMapping = {};

  for (const definition of CSV_FIELD_DEFINITIONS) {
    const normalizedAliases = definition.aliases.map(normalizeHeader);
    const columnIndex = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
    if (columnIndex !== -1) {
      mapping[definition.key] = columnIndex;
    }
  }

  return mapping;
};

const cellValue = (row: string[], mapping: CsvColumnMapping, field: CsvWineField): string | undefined => {
  const columnIndex = mapping[field];
  if (columnIndex === undefined || columnIndex < 0) return undefined;
  const raw = row[columnIndex];
  return raw === undefined ? undefined : raw.trim();
};

/** Maps a single CSV row into a partial Wine using the given column mapping, applying the same normalization used by JSON import. */
export const buildWineFromCsvRow = (
  row: string[],
  mapping: CsvColumnMapping,
  options: { wishlistOnly: boolean; targetSubcellar?: string }
): Partial<Wine> => {
  const currentYear = new Date().getFullYear();
  const vintage = toNumberOr(cellValue(row, mapping, 'vintage'), currentYear);
  const drinkStart = toNumberOr(cellValue(row, mapping, 'drink_start'), vintage + 2);
  const drinkEnd = toNumberOr(cellValue(row, mapping, 'drink_end'), drinkStart + 8);
  const subcellar = normalizeSubcellar(cellValue(row, mapping, 'subcellar')) || normalizeSubcellar(options.targetSubcellar);

  return {
    name: toText(cellValue(row, mapping, 'name')),
    producer: toText(cellValue(row, mapping, 'producer')) || undefined,
    vintage,
    region: toText(cellValue(row, mapping, 'region')) || 'Unbekannt',
    country: toText(cellValue(row, mapping, 'country')) || undefined,
    appellation: toText(cellValue(row, mapping, 'appellation')) || undefined,
    subregion: toText(cellValue(row, mapping, 'subregion')) || undefined,
    vineyard: toText(cellValue(row, mapping, 'vineyard')) || undefined,
    subcellar: subcellar || undefined,
    barcode: toText(cellValue(row, mapping, 'barcode')) || undefined,
    category: normalizeCategory(cellValue(row, mapping, 'category'), options.wishlistOnly ? 'Rarität' : 'Genuss'),
    wine_type: normalizeWineType(cellValue(row, mapping, 'wine_type')),
    format: normalizeFormat(cellValue(row, mapping, 'format')) || '0.75L',
    quantity: Math.max(0, Math.trunc(toNumberOr(cellValue(row, mapping, 'quantity'), 1))),
    purchase_price: toNumberOr(cellValue(row, mapping, 'purchase_price'), 0),
    market_price: toOptionalNumber(cellValue(row, mapping, 'market_price')),
    alcohol_percent: toOptionalNumber(cellValue(row, mapping, 'alcohol_percent')),
    drink_start: drinkStart,
    drink_end: drinkEnd,
    peak_year: toOptionalNumber(cellValue(row, mapping, 'peak_year')),
    closure_type: toText(cellValue(row, mapping, 'closure_type')) || undefined,
    wishlist: options.wishlistOnly
  };
};

export interface CsvImportRowResult {
  rowNumber: number;
  wine: Partial<Wine>;
  errors: WineValidationError[];
  isDuplicate: boolean;
}

/**
 * Validates and duplicate-checks every parsed CSV data row (rows excludes
 * the header). Duplicate checks run against both already-saved wines and
 * earlier rows in the same file, so repeated lines within one import are
 * also caught, not just collisions with the existing cellar.
 */
export const evaluateCsvImportRows = (
  rows: string[][],
  mapping: CsvColumnMapping,
  existingWines: Wine[],
  options: { wishlistOnly: boolean; targetSubcellar?: string }
): CsvImportRowResult[] => {
  const results: CsvImportRowResult[] = [];
  const seenSoFar = [...existingWines];

  rows.forEach((row, index) => {
    const wine = buildWineFromCsvRow(row, mapping, options);
    const errors = validateWineInput(wine);
    const isDuplicate = errors.length === 0 && findLikelyDuplicates(wine, seenSoFar).length > 0;

    results.push({ rowNumber: index + 2, wine, errors, isDuplicate });

    if (errors.length === 0 && !isDuplicate) {
      seenSoFar.push({ ...wine, id: `__pending-${index}__` } as Wine);
    }
  });

  return results;
};
