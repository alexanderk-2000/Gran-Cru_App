// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });

vi.mock('../../services/supabase.ts', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
    auth: { getUser: () => getUser() }
  }
}));

const { storageService } = await import('../../services/storage.legacy.ts');

const wineRow = { id: 'w1', quantity: 4, purchase_price: 25 };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stock changes go through the atomic RPC', () => {
  it('consumes a bottle in a single call', async () => {
    rpc.mockResolvedValue({ data: { ...wineRow, quantity: 3 }, error: null });

    const result = await storageService.consumeBottle('w1', 'detail');

    expect(rpc).toHaveBeenCalledWith(
      'record_inventory_change',
      expect.objectContaining({ p_wine_id: 'w1', p_delta: -1, p_type: 'consume', p_source: 'detail' })
    );
    expect(result.quantity).toBe(3);
    // The whole point: no separate read/write/event round trips in the client.
    expect(from).not.toHaveBeenCalled();
  });

  it('passes the price along for a repeat purchase', async () => {
    rpc.mockResolvedValue({ data: { ...wineRow, quantity: 6, purchase_price: 30 }, error: null });

    await storageService.recordPurchase({
      wine_id: 'w1',
      quantity: 2,
      price_per_bottle: 40,
      date: '2026-08-11T00:00:00.000Z'
    });

    expect(rpc).toHaveBeenCalledWith(
      'record_inventory_change',
      expect.objectContaining({ p_delta: 2, p_type: 'purchase', p_price_per_bottle: 40 })
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('records a loss with its reason', async () => {
    rpc.mockResolvedValue({ data: { ...wineRow, quantity: 3 }, error: null });

    await storageService.recordLoss('w1', 1, 'Korken defekt');

    expect(rpc).toHaveBeenCalledWith(
      'record_inventory_change',
      expect.objectContaining({ p_delta: -1, p_type: 'loss', p_note: 'Korken defekt' })
    );
  });

  it('books a stocktake correction as an adjustment', async () => {
    rpc.mockResolvedValue({ data: { ...wineRow, quantity: 2 }, error: null });

    await storageService.adjustStock('w1', -2, 'stocktake');

    expect(rpc).toHaveBeenCalledWith(
      'record_inventory_change',
      expect.objectContaining({ p_delta: -2, p_type: 'adjustment', p_source: 'stocktake' })
    );
  });

  it('accepts a single-row array from PostgREST', async () => {
    rpc.mockResolvedValue({ data: [{ ...wineRow, quantity: 3 }], error: null });

    const result = await storageService.consumeBottle('w1');

    expect(result.quantity).toBe(3);
  });

  it('surfaces real database errors instead of falling back', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Nicht genügend Flaschen im Bestand.' } });

    await expect(storageService.consumeBottle('w1')).rejects.toMatchObject({
      message: 'Nicht genügend Flaschen im Bestand.'
    });
    expect(from).not.toHaveBeenCalled();
  });

  // A database that has not run migration 20260811000034 must keep working -
  // the app then uses the old, non-atomic path rather than failing outright.
  it('falls back to the client-side path when the function is missing', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.record_inventory_change' }
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const selectSingle = vi.fn().mockResolvedValue({ data: { quantity: 4 }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { ...wineRow, quantity: 3 }, error: null });

    from.mockImplementation((table: string) => {
      if (table === 'wines') {
        return {
          select: () => ({ eq: () => ({ is: () => ({ single: selectSingle }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: updateSingle }) }) })
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    await storageService.adjustStock('w1', -1, 'dashboard');

    expect(from).toHaveBeenCalledWith('wines');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('record_inventory_change'));
  });
});
