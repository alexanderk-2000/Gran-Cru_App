import type { Wine } from '../../types.ts';

/**
 * Builds the cellar CSV.
 *
 * Deliberately free of any service import: constructing the Supabase client
 * (which `services/storage.ts` does at module load) eagerly builds a Realtime
 * client, and that throws on Node 20 without a native WebSocket - which is the
 * Node version CI runs. Pure formatting logic therefore lives here, so a test
 * for it never drags a database client into its module graph.
 */

const CSV_COLUMNS: Array<{ header: string; value: (wine: Wine) => string | number | undefined }> = [
  { header: 'Name', value: (w) => w.name },
  { header: 'Weingut', value: (w) => w.producer },
  { header: 'Jahrgang', value: (w) => w.vintage },
  { header: 'Flaschen', value: (w) => w.quantity },
  { header: 'Format', value: (w) => w.format },
  { header: 'Region', value: (w) => w.region },
  { header: 'Land', value: (w) => w.country },
  { header: 'Appellation', value: (w) => w.appellation },
  { header: 'Weinart', value: (w) => w.wine_type },
  { header: 'Kategorie', value: (w) => w.category },
  { header: 'Pocket', value: (w) => w.subcellar },
  { header: 'Einstand', value: (w) => w.purchase_price },
  { header: 'Marktpreis', value: (w) => w.market_price },
  { header: 'Trinkfenster ab', value: (w) => w.drink_start },
  { header: 'Peak', value: (w) => w.peak_year },
  { header: 'Trinkfenster bis', value: (w) => w.drink_end },
  { header: 'Alkohol %', value: (w) => w.alcohol_percent },
  { header: 'Rebsorten', value: (w) => (w.grapes || []).map((g) => g.name).filter(Boolean).join('; ') },
  { header: 'Barcode', value: (w) => w.barcode },
  { header: 'Wunschliste', value: (w) => (w.wishlist ? 'ja' : 'nein') }
];

/**
 * Quotes a CSV field. Excel in a German locale reads semicolons as the column
 * separator, which is why the separator below is ';' and not ','.
 */
const csvCell = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  // A leading =, +, - or @ makes spreadsheets treat the cell as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const buildWineCsv = (wines: Wine[]): string => {
  const header = CSV_COLUMNS.map((column) => csvCell(column.header)).join(';');
  const rows = wines.map((wine) => CSV_COLUMNS.map((column) => csvCell(column.value(wine))).join(';'));
  // BOM so Excel detects UTF-8 and shows umlauts correctly.
  return `\ufeff${[header, ...rows].join('\r\n')}\r\n`;
};
