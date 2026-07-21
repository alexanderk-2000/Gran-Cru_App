import type { Category, WineStatus } from '../types.ts';

export type InventorySort = 'name-asc' | 'vintage-desc' | 'value-desc' | 'quantity-desc';

export interface InventoryViewPreferences {
  search: string;
  category: Category | 'All';
  status: WineStatus | 'All';
  subcellar: string;
  sort: InventorySort;
}

export const DEFAULT_INVENTORY_VIEW_PREFERENCES: InventoryViewPreferences = {
  search: '',
  category: 'All',
  status: 'All',
  subcellar: 'All',
  sort: 'name-asc',
};

const STORAGE_PREFIX = 'grand-cru:inventory-view';
const categories = new Set(['All', 'Genuss', 'Investment', 'Rarität', 'Daily Drinker']);
const statuses = new Set(['All', 'READY', 'HOLD', 'PAST_PEAK']);
const sorts = new Set<InventorySort>(['name-asc', 'vintage-desc', 'value-desc', 'quantity-desc']);

const storageKey = (userId: string, view: 'inventory' | 'wishlist') =>
  `${STORAGE_PREFIX}:${userId}:${view}`;

export const loadInventoryViewPreferences = (
  userId: string,
  view: 'inventory' | 'wishlist',
  storage: Pick<Storage, 'getItem'> = localStorage
): InventoryViewPreferences => {
  try {
    const raw = storage.getItem(storageKey(userId, view));
    if (!raw) return { ...DEFAULT_INVENTORY_VIEW_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<InventoryViewPreferences>;
    return {
      search: typeof parsed.search === 'string' ? parsed.search.slice(0, 200) : '',
      category: categories.has(parsed.category ?? '') ? parsed.category! : 'All',
      status: statuses.has(parsed.status ?? '') ? parsed.status! : 'All',
      subcellar:
        typeof parsed.subcellar === 'string' && parsed.subcellar ? parsed.subcellar : 'All',
      sort: sorts.has(parsed.sort as InventorySort) ? parsed.sort! : 'name-asc',
    } as InventoryViewPreferences;
  } catch {
    return { ...DEFAULT_INVENTORY_VIEW_PREFERENCES };
  }
};

export const saveInventoryViewPreferences = (
  userId: string,
  view: 'inventory' | 'wishlist',
  preferences: InventoryViewPreferences,
  storage: Pick<Storage, 'setItem'> = localStorage
): void => {
  try {
    storage.setItem(storageKey(userId, view), JSON.stringify(preferences));
  } catch {
    // Browsers may deny or exhaust local storage. View preferences must never break the inventory UI.
  }
};
