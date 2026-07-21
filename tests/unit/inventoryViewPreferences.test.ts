import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVENTORY_VIEW_PREFERENCES,
  loadInventoryViewPreferences,
  saveInventoryViewPreferences,
} from '../../services/inventoryViewPreferences.ts';
import { WineStatus } from '../../types.ts';

describe('inventory view preferences', () => {
  it('stores inventory and wishlist preferences separately per user', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveInventoryViewPreferences(
      'user-a',
      'inventory',
      {
        search: 'Margaux',
        category: 'Investment',
        status: WineStatus.READY,
        subcellar: 'Bordeaux',
        sort: 'value-desc',
      },
      storage
    );

    expect(loadInventoryViewPreferences('user-a', 'inventory', storage)).toEqual({
      search: 'Margaux',
      category: 'Investment',
      status: WineStatus.READY,
      subcellar: 'Bordeaux',
      sort: 'value-desc',
    });
    expect(loadInventoryViewPreferences('user-a', 'wishlist', storage)).toEqual(
      DEFAULT_INVENTORY_VIEW_PREFERENCES
    );
    expect(loadInventoryViewPreferences('user-b', 'inventory', storage)).toEqual(
      DEFAULT_INVENTORY_VIEW_PREFERENCES
    );
  });

  it('falls back safely when persisted values are invalid', () => {
    const storage = { getItem: () => '{"category":"invalid","sort":"unknown"}' };
    expect(loadInventoryViewPreferences('user-a', 'inventory', storage)).toEqual(
      DEFAULT_INVENTORY_VIEW_PREFERENCES
    );
  });

  it('does not throw when storage rejects writes', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() =>
      saveInventoryViewPreferences(
        'user-a',
        'inventory',
        DEFAULT_INVENTORY_VIEW_PREFERENCES,
        storage
      )
    ).not.toThrow();
  });
});
