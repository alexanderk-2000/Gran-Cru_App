import { Wine, WineStatus } from '../../types.ts';
import { getWineFamily, getWineStatus, type WineFamily } from '../../utils.ts';
import { findLikelyDuplicates } from '../../domain/wine/duplicateDetection.ts';

export const ratio = (value: number, total: number): number => (total <= 0 ? 0 : value / total);

export const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const buildWindowText = (wine: Wine): string => `${wine.drink_start ?? '—'}–${wine.drink_end ?? '—'}`;

export type DashboardView = 'ready' | 'holding' | 'past' | 'red' | 'white' | 'sparkling' | 'fortified';

export const viewPath = (view: DashboardView): string => `/inventory?view=${view}`;

export const familyLabel: Record<Exclude<WineFamily, 'unknown'>, string> = {
  red: 'Rot',
  white: 'Weiß',
  sparkling: 'Schaumwein',
  fortified: 'Portwein'
};

export interface DashboardKpis {
  totalBottles: number;
  readyBottles: number;
  pastPeakBottles: number;
  holdingBottles: number;
  overripeShare: number;
  overripeRiskLabel: 'niedrig' | 'mittel' | 'hoch';
  overripeRiskTone: string;
  pricedWineCount: number;
  marketValue: number;
}

export const computeDashboardKpis = (inventory: Wine[], currentYear: number): DashboardKpis => {
  const totalBottles = inventory.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0);

  const readyBottles = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (qty === 0) return sum;
    const status = getWineStatus(wine);
    const entersThisYear = typeof wine.drink_start === 'number' && wine.drink_start === currentYear;
    return status === WineStatus.READY || entersThisYear ? sum + qty : sum;
  }, 0);

  const pastPeakBottles = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (qty === 0) return sum;
    return getWineStatus(wine) === WineStatus.PAST_PEAK ? sum + qty : sum;
  }, 0);

  const holdingBottles = Math.max(0, totalBottles - readyBottles - pastPeakBottles);

  const overripeShare = ratio(pastPeakBottles, Math.max(1, totalBottles));
  const overripeRiskLabel = overripeShare < 0.1 ? 'niedrig' : overripeShare < 0.25 ? 'mittel' : 'hoch';
  const overripeRiskTone = overripeRiskLabel === 'niedrig' ? 'text-sage' : overripeRiskLabel === 'mittel' ? 'text-gold-dim' : 'text-burgundy';

  const pricedWineCount = inventory.filter((wine) => {
    const market = typeof wine.market_price === 'number' && wine.market_price > 0;
    const purchase = typeof wine.purchase_price === 'number' && wine.purchase_price > 0;
    return market || purchase;
  }).length;

  const marketValue = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (qty === 0) return sum;
    const market = typeof wine.market_price === 'number' && wine.market_price > 0 ? wine.market_price : null;
    const purchase = typeof wine.purchase_price === 'number' && wine.purchase_price > 0 ? wine.purchase_price : null;
    const unit = market ?? purchase;
    return unit ? sum + unit * qty : sum;
  }, 0);

  return {
    totalBottles,
    readyBottles,
    pastPeakBottles,
    holdingBottles,
    overripeShare,
    overripeRiskLabel,
    overripeRiskTone,
    pricedWineCount,
    marketValue
  };
};

export interface FamilyDistribution {
  red: number;
  white: number;
  sparkling: number;
  fortified: number;
  unknown: number;
}

export const computeFamilyDistribution = (inventory: Wine[]): FamilyDistribution => {
  const base: FamilyDistribution = { red: 0, white: 0, sparkling: 0, fortified: 0, unknown: 0 };
  for (const wine of inventory) {
    const qty = Math.max(0, wine.quantity || 0);
    if (qty === 0) continue;
    const family = getWineFamily(wine);
    base[family] += qty;
  }
  return base;
};

export interface RecommendationRow {
  wine: Wine;
  reason: string;
  statusLabel: string;
  urgency: number;
}

export const computeRecommendations = (inventory: Wine[], currentYear: number): RecommendationRow[] => {
  const rows: RecommendationRow[] = inventory
    .filter((wine) => (wine.quantity || 0) > 0)
    .map((wine) => {
      const status = getWineStatus(wine);
      const end = typeof wine.drink_end === 'number' ? wine.drink_end : currentYear + 8;
      const start = typeof wine.drink_start === 'number' ? wine.drink_start : currentYear;
      const peak = typeof wine.peak_year === 'number' ? wine.peak_year : null;
      const yearsToEnd = end - currentYear;
      const yearsToStart = start - currentYear;

      let urgency = 0;
      let reason = 'Im Trinkfenster';
      if (status === WineStatus.PAST_PEAK) {
        urgency += 1.2;
        reason = 'Bereits über Trinkfenster';
      } else if (yearsToEnd <= 0) {
        urgency += 1.0;
        reason = 'Trinkfenster endet dieses Jahr';
      } else if (yearsToEnd === 1) {
        urgency += 0.9;
        reason = 'Trinkfenster endet im nächsten Jahr';
      } else if (status === WineStatus.READY) {
        urgency += 0.8;
        reason = 'Jetzt trinkreif';
      } else if (yearsToStart <= 0) {
        urgency += 0.7;
        reason = 'Eintritt ins Trinkfenster';
      } else if (yearsToStart === 1) {
        urgency += 0.5;
        reason = 'Trinkfenster startet nächstes Jahr';
      }

      if (peak !== null && Math.abs(peak - currentYear) <= 1) {
        urgency += 0.18;
        reason = `${reason} · nahe Peak`;
      }

      if (wine.category === 'Investment') {
        urgency -= 0.12;
      }

      if ((wine.quantity || 0) <= 1) urgency += 0.03;

      const statusLabel = status === WineStatus.READY ? 'Trinkbereit' : status === WineStatus.HOLD ? 'Lagernd' : 'Überreif';

      return { wine, reason, statusLabel, urgency };
    })
    .filter((row) => row.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency);

  return rows.slice(0, 8);
};

export interface AlertRow {
  id: string;
  title: string;
  detail: string;
  ctaLabel: string;
  to: string;
}

/** Number of duplicate-wine clusters, using the same barcode/name+producer+vintage+format
 * matching as manual entry, scan entry, and JSON import (domain/wine/duplicateDetection.ts),
 * so the dashboard alert agrees with what those flows consider a duplicate. */
const countDuplicateGroups = (inventory: Wine[]): number => {
  const visited = new Set<string>();
  let groups = 0;
  for (const wine of inventory) {
    if (visited.has(wine.id)) continue;
    const matches = findLikelyDuplicates(wine, inventory, { excludeId: wine.id });
    if (matches.length > 0) {
      groups += 1;
      visited.add(wine.id);
      for (const match of matches) visited.add(match.id);
    }
  }
  return groups;
};

export const computeAlerts = (inventory: Wine[], currentYear: number): AlertRow[] => {
  const rows: AlertRow[] = [];

  const enteringWindowBottles = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (!qty) return sum;
    if (typeof wine.drink_start === 'number' && wine.drink_start === currentYear) return sum + qty;
    return sum;
  }, 0);
  if (enteringWindowBottles > 0) {
    rows.push({
      id: 'window-now',
      title: 'Trinkfenster erreicht',
      detail: `${enteringWindowBottles} Flaschen erreichen dieses Jahr ihr Fenster.`,
      ctaLabel: 'Beheben',
      to: viewPath('ready')
    });
  }

  const endSoonBottles = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (!qty) return sum;
    if (typeof wine.drink_end === 'number' && wine.drink_end <= currentYear + 1) return sum + qty;
    return sum;
  }, 0);
  if (endSoonBottles > 0) {
    rows.push({
      id: 'window-end',
      title: 'Überreif in ≤ 12 Monaten',
      detail: `${endSoonBottles} Flaschen nähern sich dem Fensterende.`,
      ctaLabel: 'Beheben',
      to: viewPath('past')
    });
  }

  const missingPriceBottles = inventory.reduce((sum, wine) => {
    const qty = Math.max(0, wine.quantity || 0);
    if (!qty) return sum;
    const hasPrice =
      (typeof wine.purchase_price === 'number' && wine.purchase_price > 0) || (typeof wine.market_price === 'number' && wine.market_price > 0);
    return hasPrice ? sum : sum + qty;
  }, 0);
  if (missingPriceBottles > 0) {
    rows.push({
      id: 'missing-price',
      title: 'Preis fehlt',
      detail: `${missingPriceBottles} Flaschen ohne Preisbasis.`,
      ctaLabel: 'Beheben',
      to: '/inventory'
    });
  }

  const duplicateGroups = countDuplicateGroups(inventory);
  if (duplicateGroups > 0) {
    rows.push({
      id: 'duplicate',
      title: 'Duplikat erkannt',
      detail: `${duplicateGroups} doppelte Weinposition(en) erkannt.`,
      ctaLabel: 'Beheben',
      to: '/inventory'
    });
  }

  const lowStockWines = inventory.filter((wine) => (wine.quantity || 0) > 0 && (wine.quantity || 0) <= 1).length;
  if (lowStockWines > 0) {
    rows.push({
      id: 'low-stock',
      title: 'Bestand niedrig',
      detail: `${lowStockWines} Wein(e) nur noch mit 1 Flasche.`,
      ctaLabel: 'Beheben',
      to: '/inventory'
    });
  }

  if (rows.length === 0) {
    rows.push({
      id: 'all-clear',
      title: 'Keine akuten Alerts',
      detail: 'Ihr Keller ist aktuell sauber priorisiert.',
      ctaLabel: 'Zur Übersicht',
      to: '/inventory'
    });
  }

  return rows.slice(0, 6);
};
