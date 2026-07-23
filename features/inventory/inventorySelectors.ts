import { Category, Wine, WineStatus } from '../../types.ts';
import { getWineFamily, getWineStatus } from '../../utils.ts';
import { normalizeSubcellar } from '../../domain/wine/normalization.ts';
import type { InventorySort } from '../../services/inventoryViewPreferences.ts';
import { MAIN_CELLAR_FILTER, MAIN_CELLAR_LABEL } from './constants.ts';

export type PresetView = 'ready' | 'holding' | 'past' | 'red' | 'white' | 'sparkling' | 'fortified';

export const PRESET_VIEWS: ReadonlySet<string> = new Set(['ready', 'holding', 'past', 'red', 'white', 'sparkling', 'fortified']);

export interface InventoryFilterOptions {
  wishlistOnly: boolean;
  presetView: PresetView | null;
  search: string;
  categoryFilter: Category | 'All';
  statusFilter: WineStatus | 'All';
  subcellarFilter: string;
  sort: InventorySort;
}

export const filterAndSortWines = (wines: Wine[], options: InventoryFilterOptions): Wine[] => {
  const { wishlistOnly, presetView, search, categoryFilter, statusFilter, subcellarFilter, sort } = options;

  return wines
    .filter((wine) => {
      if (wine.wishlist !== wishlistOnly) return false;
      if (presetView === 'ready' && getWineStatus(wine) !== WineStatus.READY) return false;
      if (presetView === 'holding' && getWineStatus(wine) !== WineStatus.HOLD) return false;
      if (presetView === 'past' && getWineStatus(wine) !== WineStatus.PAST_PEAK) return false;
      if (presetView === 'red' && getWineFamily(wine) !== 'red') return false;
      if (presetView === 'white' && getWineFamily(wine) !== 'white') return false;
      if (presetView === 'sparkling' && getWineFamily(wine) !== 'sparkling') return false;
      if (presetView === 'fortified' && getWineFamily(wine) !== 'fortified') return false;

      const matchesSearch =
        wine.name.toLowerCase().includes(search.toLowerCase()) ||
        wine.region.toLowerCase().includes(search.toLowerCase()) ||
        wine.producer?.toLowerCase().includes(search.toLowerCase()) ||
        wine.subcellar?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || wine.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || getWineStatus(wine) === statusFilter;
      const normalizedWineSubcellar = normalizeSubcellar(wine.subcellar);
      const matchesSubcellar =
        subcellarFilter === 'All' ||
        (subcellarFilter === MAIN_CELLAR_FILTER ? normalizedWineSubcellar.length === 0 : normalizedWineSubcellar === subcellarFilter);

      return matchesSearch && matchesCategory && matchesStatus && matchesSubcellar;
    })
    .sort((a, b) => {
      if (sort === 'vintage-desc') return b.vintage - a.vintage || a.name.localeCompare(b.name, 'de');
      if (sort === 'value-desc') return (b.market_price ?? b.purchase_price) - (a.market_price ?? a.purchase_price) || a.name.localeCompare(b.name, 'de');
      if (sort === 'quantity-desc') return b.quantity - a.quantity || a.name.localeCompare(b.name, 'de');
      return a.name.localeCompare(b.name, 'de');
    });
};

export interface WineGroup {
  key: string;
  label: string;
  wines: Wine[];
  bottleCount: number;
}

export const groupWinesBySubcellar = (wines: Wine[]): WineGroup[] => {
  const groups = new Map<string, Wine[]>();
  for (const wine of wines) {
    const normalized = normalizeSubcellar(wine.subcellar);
    const key = normalized || MAIN_CELLAR_FILTER;
    const list = groups.get(key) ?? [];
    list.push(wine);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === MAIN_CELLAR_FILTER) return -1;
      if (b === MAIN_CELLAR_FILTER) return 1;
      return a.localeCompare(b, 'de');
    })
    .map(([key, list]) => ({
      key,
      label: key === MAIN_CELLAR_FILTER ? MAIN_CELLAR_LABEL : key,
      wines: list,
      bottleCount: list.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0)
    }));
};

export interface PocketSummary {
  id: string;
  label: string;
  wineCount: number;
  bottleCount: number;
}

export const buildPocketSummaries = (wines: Wine[], wishlistOnly: boolean, availableSubcellars: string[]): PocketSummary[] => {
  const inventory = wines.filter((wine) => wine.wishlist === wishlistOnly);
  const byPocket = new Map<string, { wineCount: number; bottleCount: number }>();

  for (const wine of inventory) {
    const key = normalizeSubcellar(wine.subcellar) || MAIN_CELLAR_FILTER;
    const stats = byPocket.get(key) ?? { wineCount: 0, bottleCount: 0 };
    stats.wineCount += 1;
    stats.bottleCount += Math.max(0, wine.quantity || 0);
    byPocket.set(key, stats);
  }

  const allWineCount = inventory.length;
  const allBottleCount = inventory.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0);

  return [
    {
      id: 'All',
      label: 'Alle Pockets',
      wineCount: allWineCount,
      bottleCount: allBottleCount
    },
    {
      id: MAIN_CELLAR_FILTER,
      label: MAIN_CELLAR_LABEL,
      wineCount: byPocket.get(MAIN_CELLAR_FILTER)?.wineCount ?? 0,
      bottleCount: byPocket.get(MAIN_CELLAR_FILTER)?.bottleCount ?? 0
    },
    ...availableSubcellars
      .filter((name) => name.toLowerCase() !== MAIN_CELLAR_LABEL.toLowerCase())
      .map((name) => ({
        id: name,
        label: name,
        wineCount: byPocket.get(name)?.wineCount ?? 0,
        bottleCount: byPocket.get(name)?.bottleCount ?? 0
      }))
  ];
};
