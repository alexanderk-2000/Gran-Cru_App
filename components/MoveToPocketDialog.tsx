import React, { useEffect, useState } from 'react';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import type { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { normalizeSubcellar } from '../domain/wine/normalization.ts';

/**
 * Moves a wine to a different pocket by tapping, not dragging.
 *
 * The cellar list let you reassign a pocket only via HTML5 drag-and-drop
 * (`draggable` + `onDragStart`/`onDrop` in InventoryPage). There is no
 * `dragstart` event on touch devices, so the one action you'd actually do
 * standing in front of the shelf - "this bottle goes over there" - was
 * impossible on a phone. Drag-and-drop stays as a desktop convenience; this
 * is the way in on mobile, and now on the wine's own page too, where no
 * drag target ever existed at all.
 */
const MAIN_CELLAR_LABEL = 'Hauptkeller';

interface MoveToPocketDialogProps {
  open: boolean;
  wine: Wine | null;
  pocketOptions: string[];
  onClose: () => void;
  onMoved: (message: string) => void;
}

export const MoveToPocketDialog: React.FC<MoveToPocketDialogProps> = ({
  open,
  wine,
  pocketOptions,
  onClose,
  onMoved
}) => {
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open, wine?.id]);

  if (!open || !wine) return null;

  const currentPocket = normalizeSubcellar(wine.subcellar);
  const destinations = [
    MAIN_CELLAR_LABEL,
    ...pocketOptions.filter((name) => name.toLowerCase() !== MAIN_CELLAR_LABEL.toLowerCase())
  ];

  const handleMove = async (destination: string) => {
    const target = destination === MAIN_CELLAR_LABEL ? '' : destination;
    if (normalizeSubcellar(target) === currentPocket) return;

    setMovingTo(destination);
    setError(null);
    try {
      await storageService.transferWine(wine.id, target);
      onMoved(`${wine.name} liegt jetzt in ${destination}.`);
    } catch (err) {
      setError((err as Error)?.message || 'Verschieben fehlgeschlagen.');
    } finally {
      setMovingTo(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="In Pocket verschieben"
      onClick={(event) => {
        if (event.target === event.currentTarget && !movingTo) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-[2rem] border border-burgundy/10 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-burgundy/5 p-2.5 text-burgundy">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-xl text-charcoal">Verschieben</h3>
              <p className="truncate text-xs text-stone-gray">
                {wine.vintage} {wine.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(movingTo)}
            className="rounded-full p-2 text-stone-gray transition-colors hover:bg-alabaster hover:text-charcoal disabled:opacity-40"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-gray">
          Aktuell: {currentPocket || MAIN_CELLAR_LABEL}
        </p>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {destinations.map((destination) => {
            const isCurrent = normalizeSubcellar(destination === MAIN_CELLAR_LABEL ? '' : destination) === currentPocket;
            const isMoving = movingTo === destination;
            return (
              <button
                key={destination}
                type="button"
                onClick={() => void handleMove(destination)}
                disabled={isCurrent || Boolean(movingTo)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-all disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'border-burgundy/30 bg-burgundy/5 text-burgundy'
                    : 'border-stone-200 text-charcoal hover:border-burgundy/30 hover:bg-alabaster/60'
                }`}
              >
                <span className="truncate">{destination}</span>
                {isCurrent ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : isMoving ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : null}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
};
