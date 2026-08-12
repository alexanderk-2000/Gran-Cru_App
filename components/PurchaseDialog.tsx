import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShoppingCart, X } from 'lucide-react';
import type { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { formatCurrency } from '../utils.ts';

/**
 * Records a repeat purchase for a wine already in the cellar.
 *
 * The dashboard's "Einkauf erfassen" button used to link to the plain cellar
 * list, where no purchase flow exists - the only way in was the `?action=buy`
 * link on a single wine card. This gives that entry point a real target: pick
 * the wine, enter bottles and price, done. `recordPurchase` keeps the weighted
 * average purchase price up to date and writes the inventory event.
 */
interface PurchaseDialogProps {
  open: boolean;
  wines: Wine[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const PurchaseDialog: React.FC<PurchaseDialogProps> = ({ open, wines, onClose, onSaved }) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [pricePerBottle, setPricePerBottle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const inventory = wines.filter((wine) => !wine.wishlist && !wine.deleted_at);
    const term = search.trim().toLowerCase();
    const matches = term
      ? inventory.filter(
          (wine) =>
            wine.name.toLowerCase().includes(term) ||
            (wine.producer || '').toLowerCase().includes(term) ||
            String(wine.vintage).includes(term)
        )
      : inventory;
    return [...matches].sort((a, b) => a.name.localeCompare(b.name, 'de')).slice(0, 40);
  }, [wines, search]);

  const selected = useMemo(() => wines.find((wine) => wine.id === selectedId) || null, [wines, selectedId]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedId(null);
      setQuantity('1');
      setPricePerBottle('');
      setError(null);
    }
  }, [open]);

  // Pre-fill with the wine's current average purchase price as the most
  // likely value, but leave it editable - prices change between purchases.
  useEffect(() => {
    if (selected) setPricePerBottle(String(selected.purchase_price ?? 0));
  }, [selected]);

  if (!open) return null;

  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 0));
  const parsedPrice = Math.max(0, Number(pricePerBottle) || 0);

  const handleSave = async () => {
    if (!selected || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await storageService.recordPurchase({
        wine_id: selected.id,
        quantity: parsedQuantity,
        price_per_bottle: parsedPrice,
        date: new Date().toISOString()
      });
      onSaved(`${parsedQuantity} Flasche(n) ${selected.name} als Nachkauf erfasst.`);
    } catch (err) {
      setError((err as Error)?.message || 'Nachkauf konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-burgundy/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-alabaster px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-burgundy/5 p-2.5 text-burgundy">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Nachkauf erfassen</h3>
              <p className="text-sm text-stone-gray">Flaschen zu einem Wein im Keller hinzufügen.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-full p-2 text-stone-gray transition-colors hover:bg-alabaster hover:text-charcoal disabled:opacity-40"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!selected ? (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-gray" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Wein suchen…"
                  autoFocus
                  className="w-full rounded-2xl border-2 border-burgundy/10 bg-alabaster py-3 pl-11 pr-4 text-sm focus:border-burgundy/30 focus:outline-none"
                />
              </div>

              {candidates.length === 0 ? (
                <p className="rounded-2xl border border-stone-200 bg-alabaster/40 p-4 text-sm text-stone-gray">
                  Kein passender Wein im Keller. Neue Weine legst du über „Wein hinzufügen“ an.
                </p>
              ) : (
                <ul className="space-y-2">
                  {candidates.map((wine) => (
                    <li key={wine.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(wine.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left transition-colors hover:border-burgundy/30 hover:bg-alabaster/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-serif text-base text-charcoal">
                            {wine.vintage} {wine.name}
                          </span>
                          <span className="block truncate text-xs text-stone-gray">
                            {wine.producer || 'Produzent unbekannt'}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-stone-gray">{wine.quantity} Fl.</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-burgundy/15 bg-alabaster/50 p-4">
                <p className="font-serif text-xl text-charcoal">
                  {selected.vintage} {selected.name}
                </p>
                <p className="text-sm text-stone-gray">
                  {selected.producer || 'Produzent unbekannt'} · aktuell {selected.quantity} Fl. · Einstand{' '}
                  {formatCurrency(selected.purchase_price || 0)}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="mt-2 text-[11px] font-black uppercase tracking-[0.14em] text-burgundy"
                >
                  Anderen Wein wählen
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-stone-gray">
                    Flaschen
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    disabled={isSaving}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-widest text-stone-gray">
                    Preis je Flasche (€)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={pricePerBottle}
                    onChange={(event) => setPricePerBottle(event.target.value)}
                    disabled={isSaving}
                    className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
                  />
                </label>
              </div>

              <p className="text-sm text-stone-gray">
                Neuer Bestand: <span className="font-bold text-charcoal">{selected.quantity + parsedQuantity} Fl.</span>{' '}
                · Summe {formatCurrency(parsedPrice * parsedQuantity)}
              </p>
            </>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-alabaster px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-stone-600 transition-all hover:border-stone-300 disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!selected || isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-premium transition-all hover:bg-burgundy-light disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Nachkauf speichern
          </button>
        </div>
      </div>
    </div>
  );
};
