

import { Wine, WineStatus, PortfolioStats } from './types.ts';

export const getWineStatus = (wine: Wine): WineStatus => {
  const currentYear = new Date().getFullYear();
  if (currentYear < wine.drink_start) return WineStatus.HOLD;
  if (currentYear > wine.drink_end) return WineStatus.PAST_PEAK;
  return WineStatus.READY;
};

/**
 * The value of one bottle: current market price where known, purchase price
 * otherwise.
 *
 * This used to be decided per screen - portfolio stats counted purchase price
 * only, while the dashboard and the "highest value" sort already preferred the
 * market price - so the same cellar was worth different amounts depending on
 * where you looked. Every value calculation goes through here now.
 */
export const getBottleUnitValue = (wine: Pick<Wine, 'market_price' | 'purchase_price'>): number => {
  if (typeof wine.market_price === 'number' && wine.market_price > 0) return wine.market_price;
  if (typeof wine.purchase_price === 'number' && wine.purchase_price > 0) return wine.purchase_price;
  return 0;
};

/** Total value of a wine position (unit value × bottles on hand). */
export const getWinePositionValue = (wine: Pick<Wine, 'market_price' | 'purchase_price' | 'quantity'>): number =>
  getBottleUnitValue(wine) * Math.max(0, wine.quantity || 0);

/** True when neither a market nor a purchase price is known. */
export const hasKnownPrice = (wine: Pick<Wine, 'market_price' | 'purchase_price'>): boolean =>
  getBottleUnitValue(wine) > 0;

export const calculatePortfolioStats = (wines: Wine[]): PortfolioStats => {
  const currentYear = new Date().getFullYear();

  const inventory = wines.filter(w => !w.wishlist);

  const stats = inventory.reduce((acc, wine) => {
    acc.totalBottles += wine.quantity;
    acc.totalValue += getWinePositionValue(wine);

    if (wine.category === 'Investment') {
      acc.investmentValue += getWinePositionValue(wine);
    }

    const status = getWineStatus(wine);
    if (status === WineStatus.READY) acc.readyCount++;
    else if (status === WineStatus.HOLD) acc.holdCount++;
    else if (status === WineStatus.PAST_PEAK) acc.pastPeakCount++;

    acc.totalVintages += wine.vintage;

    return acc;
  }, {
    totalBottles: 0,
    totalValue: 0,
    readyCount: 0,
    holdCount: 0,
    pastPeakCount: 0,
    investmentValue: 0,
    totalVintages: 0
  });

  const averageAge = inventory.length > 0 ? currentYear - (stats.totalVintages / inventory.length) : 0;

  return {
    totalBottles: stats.totalBottles,
    totalValue: stats.totalValue,
    readyCount: stats.readyCount,
    holdCount: stats.holdCount,
    pastPeakCount: stats.pastPeakCount,
    averageAge: Math.round(averageAge),
    investmentValue: stats.investmentValue
  };
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

export type WineFamily = 'red' | 'white' | 'sparkling' | 'fortified' | 'unknown';

export const getWineFamily = (wine: Wine): WineFamily => {
  const haystack = [
    wine.wine_type || '',
    wine.name || '',
    wine.appellation || '',
    wine.region || '',
    wine.producer || ''
  ]
    .join(' ')
    .toLowerCase();

  if (/(port|porto|sherry|madeira|marsala|vdn|vin doux naturel|fortified)/i.test(haystack)) {
    return 'fortified';
  }

  if (/(champagner|champagne|sekt|prosecco|cava|cr[eé]mant|spumante|sparkling|schaumwein)/i.test(haystack)) {
    return 'sparkling';
  }

  if (/(rotwein|rot\b|red\b|sp[aä]tburgunder|pinot noir|cabernet|merlot|syrah|shiraz|nebbiolo|sangiovese|tempranillo)/i.test(haystack)) {
    return 'red';
  }

  if (/(we[iß]wein|weisswein|wei[sß]\b|white\b|riesling|chardonnay|sauvignon|chenin|gr[uü]ner veltliner|pinot blanc|wei[sß]burgunder)/i.test(haystack)) {
    return 'white';
  }

  return 'unknown';
};

// --- INPUT HELPERS ---

export const extractVintageFromQuery = (query: string): number | null => {
  if (!query) return null;
  const normalized = query.toLowerCase();
  if (normalized.includes('nv') || normalized.includes('non-vintage') || normalized.includes('n.v.')) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const matches = query.match(/\b(18|19|20)\d{2}\b/g);
  if (!matches) return null;

  const candidates = matches
    .map((value) => Number(value))
    .filter((year) => Number.isFinite(year) && year >= 1800 && year <= currentYear + 5);

  if (candidates.length === 0) return null;
  // Use the last year mentioned (most likely the vintage)
  return candidates[candidates.length - 1];
};

export {
  calculateDrinkability,
  evaluateWineDrinkability,
  type DrinkabilityResult,
  type DrinkabilityStatus,
  type DrinkabilityUncertainty,
  type OenologyDrinkabilityInput,
  type OenologyDrinkabilityOutput,
  type OenologyWineType,
} from './domain/wine/drinkability.ts';

// --- ERROR HANDLING ---

export const handleAiOperationError = (error: any) => {
  console.error("AI Operation failed:", error);

  let isQuota = false;
  const errorStr = JSON.stringify(error);

  if (
    errorStr.includes('429') ||
    errorStr.includes('RESOURCE_EXHAUSTED') ||
    error?.status === 429 ||
    error?.error?.code === 429
  ) {
    isQuota = true;
  }

  if (isQuota) {
    alert("⚠️ KI-Limit erreicht (Quota Exceeded)\n\nIhr kostenloses Kontingent für AI-Analysen ist erschöpft. Bitte versuchen Sie es später erneut oder tragen Sie die Daten manuell ein.");
  } else if (/overloaded|503|service unavailable/i.test(errorStr)) {
    alert("⚠️ KI-Server überlastet\n\nBitte in 1–2 Minuten erneut versuchen oder kurzfristig den Provider wechseln.");
  } else {
    alert("Verbindung fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung.");
  }
};
