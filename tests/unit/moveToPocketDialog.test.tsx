// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Wine } from '../../types.ts';

const transferWine = vi.fn().mockResolvedValue({});

vi.mock('../../services/storage.ts', () => ({
  storageService: { transferWine: (...args: unknown[]) => transferWine(...args) }
}));

const { MoveToPocketDialog } = await import('../../components/MoveToPocketDialog.tsx');

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
    subcellar: 'Regal A',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }) as Wine;

afterEach(() => {
  cleanup();
  transferWine.mockClear();
});

describe('MoveToPocketDialog', () => {
  // The regression this guards: pocket reassignment only worked via HTML5
  // drag-and-drop in the cellar list, which has no touch equivalent - the one
  // action you'd do standing in front of the shelf was impossible on a phone.
  it('moves the wine with a single tap, no drag required', async () => {
    const onMoved = vi.fn();
    render(
      <MoveToPocketDialog
        open
        wine={wine()}
        pocketOptions={['Regal A', 'Regal B']}
        onClose={vi.fn()}
        onMoved={onMoved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Regal B/i }));

    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(transferWine).toHaveBeenCalledWith('w1', 'Regal B');
  });

  it('moves a wine to the main cellar', async () => {
    const onMoved = vi.fn();
    render(
      <MoveToPocketDialog
        open
        wine={wine()}
        pocketOptions={['Regal A']}
        onClose={vi.fn()}
        onMoved={onMoved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Hauptkeller/i }));

    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(transferWine).toHaveBeenCalledWith('w1', '');
  });

  it('disables the wine\'s current pocket instead of offering a no-op move', () => {
    render(
      <MoveToPocketDialog
        open
        wine={wine({ subcellar: 'Regal A' })}
        pocketOptions={['Regal A', 'Regal B']}
        onClose={vi.fn()}
        onMoved={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Regal A/i })).toBeDisabled();
    expect(transferWine).not.toHaveBeenCalled();
  });

  it('surfaces a failed move instead of silently closing', async () => {
    transferWine.mockRejectedValueOnce(new Error('Netzwerkfehler'));
    render(
      <MoveToPocketDialog
        open
        wine={wine()}
        pocketOptions={['Regal A', 'Regal B']}
        onClose={vi.fn()}
        onMoved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Regal B/i }));

    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument());
  });

  it('renders nothing when no wine is selected', () => {
    const { container } = render(
      <MoveToPocketDialog open wine={null} pocketOptions={[]} onClose={vi.fn()} onMoved={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
