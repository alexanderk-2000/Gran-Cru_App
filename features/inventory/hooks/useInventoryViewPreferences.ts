import { useEffect, useState } from 'react';
import { Category, WineStatus } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';
import { loadInventoryViewPreferences, saveInventoryViewPreferences, type InventorySort } from '../../../services/inventoryViewPreferences.ts';

export const useInventoryViewPreferences = (wishlistOnly: boolean) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<WineStatus | 'All'>('All');
  const [subcellarFilter, setSubcellarFilter] = useState<string>('All');
  const [sort, setSort] = useState<InventorySort>('name-asc');
  const [preferenceUserId, setPreferenceUserId] = useState<string | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    setPreferencesHydrated(false);
    void storageService.getCurrentUser().then((user) => {
      if (!active) return;
      const userId = user?.id ?? 'demo-user';
      const saved = loadInventoryViewPreferences(userId, wishlistOnly ? 'wishlist' : 'inventory');
      setSearch(saved.search);
      setCategoryFilter(saved.category);
      setStatusFilter(saved.status);
      setSubcellarFilter(saved.subcellar);
      setSort(saved.sort);
      setPreferenceUserId(userId);
      setPreferencesHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [wishlistOnly]);

  useEffect(() => {
    if (!preferencesHydrated || !preferenceUserId) return;
    saveInventoryViewPreferences(preferenceUserId, wishlistOnly ? 'wishlist' : 'inventory', {
      search,
      category: categoryFilter,
      status: statusFilter,
      subcellar: subcellarFilter,
      sort
    });
  }, [categoryFilter, preferenceUserId, preferencesHydrated, search, sort, statusFilter, subcellarFilter, wishlistOnly]);

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    subcellarFilter,
    setSubcellarFilter,
    sort,
    setSort
  };
};
