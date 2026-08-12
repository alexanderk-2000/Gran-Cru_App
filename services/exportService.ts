import { storageService } from './storage.ts';
import { buildWineCsv } from '../domain/wine/csvExport.ts';

/**
 * Export of the whole collection.
 *
 * A cellar grown over years lives in one database the user does not control.
 * Being able to take it out is a trust question, not a convenience feature -
 * there was no export of any kind before.
 *
 * The CSV formatting itself lives in domain/wine/csvExport.ts so it stays
 * testable without loading a database client.
 */

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
