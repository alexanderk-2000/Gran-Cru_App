// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Wine } from '../../types.ts';

const consumeBottle = vi.fn().mockResolvedValue({});
const addTasting = vi.fn().mockResolvedValue({ id: 't1' });

vi.mock('../../services/storage.ts', () => ({
  storageService: {
    consumeBottle: (...args: unknown[]) => consumeBottle(...args),
    addTasting: (...args: unknown[]) => addTasting(...args)
  }
}));

const { OpenBottleDialog } = await import('../../components/OpenBottleDialog.tsx');

const wine = (overrides: Partial<Wine> = {}): Wine =>
  ({
    id: 'w1',
    user_id: 'u1',
    name: 'Testwein',
    vintage: 2018,
    region: 'Testregion',
    category: 'Genuss',
    quantity: 2,
    purchase_price: 20,
    format: '0.75L',
    drink_start: 2020,
    drink_end: 2030,
    wishlist: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

const renderDialog = (props: Partial<React.ComponentProps<typeof OpenBottleDialog>> = {}) => {
  const onSaved = vi.fn();
  render(
    <OpenBottleDialog
      open
      wine={wine()}
      onClose={vi.fn()}
      onSaved={onSaved}
      {...props}
    />
  );
  return { onSaved };
};

afterEach(() => {
  cleanup();
  consumeBottle.mockClear();
  addTasting.mockClear();
});

describe('OpenBottleDialog', () => {
  it('books the bottle and stores the note in one step', async () => {
    const { onSaved } = renderDialog();

    fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Wunderbar gereift.' } });
    fireEvent.click(screen.getByLabelText('4 von 5'));
    fireEvent.click(screen.getByRole('button', { name: /Öffnen & speichern/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(consumeBottle).toHaveBeenCalledWith('w1', 'detail');
    expect(addTasting).toHaveBeenCalledWith(
      expect.objectContaining({ wine_id: 'w1', rating: 4, note: 'Wunderbar gereift.' })
    );
  });

  // The regression this guards: writing a note used to be impossible without
  // drinking a bottle - the notes button called the drink handler, and
  // addTasting decremented stock as a side effect.
  it('stores a note without touching stock when consumption is unchecked', async () => {
    const { onSaved } = renderDialog({ defaultConsume: false });

    fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Beim Händler probiert.' } });
    fireEvent.click(screen.getByRole('button', { name: /Notiz speichern/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(consumeBottle).not.toHaveBeenCalled();
    expect(addTasting).toHaveBeenCalledTimes(1);
  });

  it('omits the rating entirely when none was given', async () => {
    const { onSaved } = renderDialog({ defaultConsume: false });

    fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Ohne Wertung.' } });
    fireEvent.click(screen.getByRole('button', { name: /Notiz speichern/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // The tastings table constrains rating to 1-5, so an unset rating must not
    // be sent as 0.
    expect(addTasting.mock.calls[0][0]).not.toHaveProperty('rating');
  });

  it('books a bottle without a note', async () => {
    const { onSaved } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Öffnen & speichern/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(consumeBottle).toHaveBeenCalledTimes(1);
    expect(addTasting).not.toHaveBeenCalled();
  });

  it('still allows a note when no bottle is left', async () => {
    renderDialog({ wine: wine({ quantity: 0 }) });

    const consumeCheckbox = screen.getByRole('checkbox');
    expect(consumeCheckbox).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Notiz'), { target: { value: 'Letzte Flasche war top.' } });
    fireEvent.click(screen.getByRole('button', { name: /Notiz speichern/i }));

    await waitFor(() => expect(addTasting).toHaveBeenCalledTimes(1));
    expect(consumeBottle).not.toHaveBeenCalled();
  });

  it('cannot be submitted empty', () => {
    renderDialog({ defaultConsume: false });

    expect(screen.getByRole('button', { name: /Notiz speichern/i })).toBeDisabled();
  });
});
