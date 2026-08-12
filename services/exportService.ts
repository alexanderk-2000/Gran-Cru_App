import { storageService } from './storage.ts';
import type { Wine } from '../types.ts';

/**
 * Export of the whole collection.
 *
 * A cellar grown over years lives in one database the user does not control.
 * Being able to take it out is a trust question, not a convenience feature -
 * there was no export of any kind before.
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

const timestamp = (): string => new Date().toISOString().slice(0, 10);

const download = (content: string, filename: string, mime: string): void => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export interface ExportSummary {
  wines: number;
  tastings: number;
  events: number;
}

export const exportService = {
  /** Bottle list for a spreadsheet - readable, lossy. */
  exportCsv: async (): Promise<ExportSummary> => {
    const wines = await storageService.getWines();
    download(buildWineCsv(wines), `weinkeller-${timestamp()}.csv`, 'text/csv;charset=utf-8');
    return { wines: wines.length, tastings: 0, events: 0 };
  },

  /**
   * Complete backup: wines, tasting notes, stock events, occasions and pockets.
   * Lossless, and the format the JSON import can read back.
   */
  exportJson: async (): Promise<ExportSummary> => {
    const [wines, events, occasions, pockets] = await Promise.all([
      storageService.getWines(),
      storageService.getConsumptionHistory().catch(() => []),
      storageService.getOccasions().catch(() => []),
      storageService.getCellarPockets().catch(() => [])
    ]);

    // Tastings are stored per wine; there is no "all tastings" read that does
    // not need a cursor, so they are collected per wine here. For a private
    // cellar (hundreds of wines at most) that is acceptable for a manual,
    // one-off export.
    const tastings = (
      await Promise.all(wines.map((wine) => storageService.getTastings(wine.id).catch(() => [])))
    ).flat();

    const payload = {
      exported_at: new Date().toISOString(),
      app: 'Grand Cru Vault',
      schema: 1,
      wines,
      tastings,
      inventory_events: events,
      occasions,
      cellar_pockets: pockets
    };

    download(JSON.stringify(payload, null, 2), `weinkeller-backup-${timestamp()}.json`, 'application/json');
    return { wines: wines.length, tastings: tastings.length, events: events.length };
  }
};
