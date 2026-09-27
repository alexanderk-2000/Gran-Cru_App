// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Wine } from '../../types.ts';

const saveWine = vi.fn().mockResolvedValue({});
const softDeleteWine = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/storage.ts', () => ({
  storageService: {
    saveWine: (...args: unknown[]) => saveWine(...args),
    softDeleteWine: (...args: unknown[]) => softDeleteWine(...args)
  }
}));

const { MergeDuplicatesDialog } = await import('../../components/MergeDuplicatesDialog.tsx');

const wine = (overrides: Partial<Wine> = {}): Wine =>
  ({
    id: 'w1',
    user_id: 'u1',
    name: 'Barolo Cannubi',
    vintage: 2016,
    region: 'Piemont',
    category: 'Genuss',
    quantity: 3,
    purchase_price: 60,
    format: '0.75L',
    drink_start: 2024,
    drink_end: 2038,
    wishlist: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

afterEach(() => {
  cleanup();
  saveWine.mockClear();
  softDeleteWine.mockClear();
});

describe('MergeDuplicatesDialog', () => {
  // The regression this guards: the dashboard could only warn about a
  // duplicate and link to a filtered list - fixing it meant deleting one
  // wine by hand and re-typing its quantity onto the other.
  it('sums quantities, weight-averages the price onto the kept wine, and trashes the rest', async () => {
    const group = [
      wine({ id: 'w1', quantity: 3, purchase_price: 60 }),
      wine({ id: 'w2', quantity: 1, purchase_price: 80 })
    ];
    const onMerged = vi.fn();
    render(<MergeDuplicatesDialog open group={group} onClose={vi.fn()} onMerged={onMerged} />);

    fireEvent.click(screen.getByRole('button', { name: /^Zusammenführen$/i }));

    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(saveWine).toHaveBeenCalledWith({ id: 'w1', quantity: 4, purchase_price: 65 });
    expect(softDeleteWine).toHaveBeenCalledWith('w2', expect.stringContaining('2016 Barolo Cannubi'));
  });

  it('switches the kept wine when a different row is picked', async () => {
    const group = [
      wine({ id: 'w1', quantity: 3, purchase_price: 60 }),
      wine({ id: 'w2', quantity: 1, purchase_price: 80, name: 'Barolo Cannubi Riserva' })
    ];
    const onMerged = vi.fn();
    render(<MergeDuplicatesDialog open group={group} onClose={vi.fn()} onMerged={onMerged} />);

    fireEvent.click(screen.getByText(/Barolo Cannubi Riserva/));
    fireEvent.click(screen.getByRole('button', { name: /^Zusammenführen$/i }));

    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(saveWine).toHaveBeenCalledWith({ id: 'w2', quantity: 4, purchase_price: 65 });
    expect(softDeleteWine).toHaveBeenCalledWith('w1', expect.any(String));
  });

  it('surfaces a failed merge instead of silently closing', async () => {
    saveWine.mockRejectedValueOnce(new Error('Netzwerkfehler'));
    const group = [wine({ id: 'w1' }), wine({ id: 'w2' })];
    render(<MergeDuplicatesDialog open group={group} onClose={vi.fn()} onMerged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Zusammenführen$/i }));

    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument());
    expect(softDeleteWine).not.toHaveBeenCalled();
  });

  it('renders nothing for a group smaller than two', () => {
    const { container } = render(
      <MergeDuplicatesDialog open group={[wine({ id: 'w1' })]} onClose={vi.fn()} onMerged={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
