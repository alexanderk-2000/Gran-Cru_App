// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Wine } from '../../types.ts';

const saveWine = vi.fn().mockResolvedValue({ id: 'saved' });
const generateWineInfo = vi.fn();

vi.mock('../../services/storage.ts', () => ({
  storageService: { saveWine: (...args: unknown[]) => saveWine(...args) }
}));

vi.mock('../../services/ai.ts', () => ({
  aiService: { generateWineInfo: (...args: unknown[]) => generateWineInfo(...args) }
}));

const { AddWineDialog } = await import('../../components/AddWineDialog.tsx');

const existing = (overrides: Partial<Wine> = {}): Wine =>
  ({
    id: 'w1',
    user_id: 'u1',
    name: 'Barolo Cannubi',
    producer: 'Testweingut',
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

const renderDialog = (props: Partial<React.ComponentProps<typeof AddWineDialog>> = {}) => {
  const onSaved = vi.fn();
  render(<AddWineDialog open onClose={vi.fn()} onSaved={onSaved} {...props} />);
  return { onSaved };
};

afterEach(() => {
  cleanup();
  saveWine.mockClear();
  generateWineInfo.mockReset();
});

describe('AddWineDialog', () => {
  it('saves a hand-typed wine with only the required fields', async () => {
    const { onSaved } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Von Hand eintragen/i }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Riesling Kabinett' } });
    fireEvent.change(screen.getByLabelText(/^Jahrgang/), { target: { value: '2021' } });
    fireEvent.change(screen.getByLabelText(/^Flaschen \*/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /In den Keller/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveWine).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Riesling Kabinett', vintage: 2021, quantity: 6, wishlist: false })
    );
  });

  // The regression this guards: "Manuell anlegen" used to write a placeholder
  // record ("Neuer Wein", region "Unbekannt", price 0, an invented 10-year
  // window) straight into the cellar, where it distorted KPIs and alerts.
  it('does not invent a drinking window that nobody entered', async () => {
    const { onSaved } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Von Hand eintragen/i }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ohne Fenster' } });
    fireEvent.click(screen.getByRole('button', { name: /In den Keller/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const payload = saveWine.mock.calls[0][0];
    expect(payload.drink_start).toBeUndefined();
    expect(payload.drink_end).toBeUndefined();
  });

  it('pre-fills the form from AI research and marks those fields', async () => {
    generateWineInfo.mockResolvedValue({
      success: true,
      data: {
        name: 'Chablis Grand Cru Les Clos',
        producer: 'Domaine Test',
        vintage: 2019,
        region: 'Burgund',
        country: 'Frankreich',
        drink_start: 2024,
        drink_end: 2035
      }
    });

    renderDialog();

    fireEvent.change(screen.getByLabelText('Wein suchen'), {
      target: { value: 'Chablis Les Clos 2019' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Recherchieren/i }));

    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveValue('Chablis Grand Cru Les Clos'));
    expect(screen.getByLabelText(/^Jahrgang/)).toHaveValue(2019);
    // The user is told which values came from research rather than being left
    // to guess - "KI" markers next to the affected labels.
    expect(screen.getAllByText('KI').length).toBeGreaterThan(0);
  });

  it('keeps the user in the form when research finds nothing', async () => {
    generateWineInfo.mockResolvedValue({ success: false, error: 'Nichts gefunden' });

    renderDialog();

    fireEvent.change(screen.getByLabelText('Wein suchen'), { target: { value: 'Unbekannter Wein' } });
    fireEvent.click(screen.getByRole('button', { name: /Recherchieren/i }));

    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeInTheDocument());
    expect(screen.getByText(/Nichts gefunden/)).toBeInTheDocument();
  });

  it('warns when the wine looks like one already in the cellar', async () => {
    renderDialog({ existingWines: [existing()], seed: { name: 'Barolo Cannubi', producer: 'Testweingut', vintage: 2016 } });

    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveValue('Barolo Cannubi'));
    expect(screen.getByText(/schon hast/i)).toBeInTheDocument();
  });

  it('starts straight in the form when seeded by a scan', async () => {
    renderDialog({ seed: { name: 'Gescannter Wein', barcode: '4001234567890' } });

    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveValue('Gescannter Wein'));
    expect(screen.queryByRole('button', { name: /Von Hand eintragen/i })).not.toBeInTheDocument();
  });

  it('rejects an empty name instead of saving a placeholder', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Von Hand eintragen/i }));

    expect(screen.getByRole('button', { name: /In den Keller/i })).toBeDisabled();
    expect(saveWine).not.toHaveBeenCalled();
  });
});
