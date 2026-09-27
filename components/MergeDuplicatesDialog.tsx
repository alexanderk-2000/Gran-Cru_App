import React, { useState } from 'react';
import { Check, Layers, Loader2, X } from 'lucide-react';
import type { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';

/**
 * Turns a detected duplicate group into one wine.
 *
 * The dashboard could only warn about duplicates and link to a filtered
 * list - fixing one meant deleting a wine by hand and manually adding its
 * quantity to the other. This sums the bottles, recomputes a weighted
 * average purchase price (same math as a repeat purchase), and moves every
 * other member of the group to the trash rather than hard-deleting it -
 * their tasting notes and inventory events stay intact, just attached to a
 * trashed wine like any other soft delete.
 */
interface MergeDuplicatesDialogProps {
  open: boolean;
  group: Wine[] | null;
  onClose: () => void;
  onMerged: (message: string) => void;
}

export const MergeDuplicatesDialog: React.FC<MergeDuplicatesDialogProps> = ({ open, group, onClose, onMerged }) => {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useFocusTrap<HTMLDivElement>(open, () => {
    if (!isSaving) onClose();
  });

  if (!open || !group || group.length < 2) return null;

  const activeTargetId = targetId && group.some((wine) => wine.id === targetId) ? targetId : group[0].id;
  const target = group.find((wine) => wine.id === activeTargetId) ?? group[0];
  const sources = group.filter((wine) => wine.id !== target.id);
  const totalQuantity = group.reduce((sum, wine) => sum + (wine.quantity || 0), 0);
  const totalValue = group.reduce((sum, wine) => sum + (wine.quantity || 0) * (wine.purchase_price || 0), 0);
  const weightedPrice = totalQuantity > 0 ? totalValue / totalQuantity : target.purchase_price || 0;

  const handleMerge = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await storageService.saveWine({ id: target.id, quantity: totalQuantity, purchase_price: weightedPrice });
      for (const source of sources) {
        await storageService.softDeleteWine(source.id, `Zusammengeführt mit ${target.vintage} ${target.name}`);
      }
      onMerged(
        `${sources.length === 1 ? 'Dublette' : `${sources.length} Dubletten`} mit ${target.vintage} ${target.name} zusammengeführt (${totalQuantity} Fl. gesamt).`
      );
    } catch (err) {
      setError((err as Error)?.message || 'Zusammenführen fehlgeschlagen.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Dubletten zusammenführen"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-burgundy/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-alabaster px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-burgundy/5 p-2.5 text-burgundy">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Zusammenführen</h3>
              <p className="text-sm text-stone-gray">Welche Position bleibt bestehen?</p>
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

        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
          {group.map((wine) => {
            const isTarget = wine.id === target.id;
            return (
              <button
                key={wine.id}
                type="button"
                onClick={() => setTargetId(wine.id)}
                disabled={isSaving}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed ${
                  isTarget
                    ? 'border-burgundy/30 bg-burgundy/5'
                    : 'border-stone-200 hover:border-burgundy/30 hover:bg-alabaster/60'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-serif text-base text-charcoal">
                    {wine.vintage} {wine.name}
                  </span>
                  <span className="block truncate text-xs text-stone-gray">
                    {wine.producer || 'Produzent unbekannt'} · {wine.quantity} Fl. · {wine.subcellar || 'Hauptkeller'}
                  </span>
                </span>
                {isTarget && <Check className="h-4 w-4 shrink-0 text-burgundy" />}
              </button>
            );
          })}

          <div className="mt-2 rounded-xl bg-alabaster/60 p-4 text-sm text-stone-gray">
            <p>
              <span className="font-bold text-charcoal">{target.vintage} {target.name}</span> bleibt bestehen mit{' '}
              <span className="font-bold text-charcoal">{totalQuantity} Fl.</span> (Summe aller {group.length}{' '}
              Positionen) zu einem neuen Einstandspreis von{' '}
              <span className="font-bold text-charcoal">{weightedPrice.toFixed(2)} €</span> (gewichteter Durchschnitt).
            </p>
            <p className="mt-2 text-xs">
              {sources.length === 1 ? 'Die andere Position wandert' : `Die anderen ${sources.length} Positionen wandern`} in
              den Papierkorb - Verkostungsnotizen und Ereignisse bleiben erhalten, nur nicht mehr im Bestand.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
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
            onClick={() => void handleMerge()}
            disabled={isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-premium transition-all hover:bg-burgundy-light disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            Zusammenführen
          </button>
        </div>
      </div>
    </div>
  );
};
