import React, { useEffect, useState } from 'react';
import { GlassWater, Loader2, Star, X } from 'lucide-react';
import type { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';

/**
 * One dialog for "I opened this bottle": stock, rating and note in a single
 * step.
 *
 * Before this existed, drinking a bottle was a bare `quantity - 1` and a
 * tasting note could not be written at all - `storageService.addTasting` had
 * no caller anywhere in the UI, and the "Notiz erfassen" button in the wine
 * detail actually drank a bottle. Opening a bottle is the moment a private
 * collection is about, so it produces a memory, not just a decrement.
 *
 * Note and consumption are independent on purpose: tasting somewhere else, or
 * a second glass from a bottle already counted, are both normal.
 */
interface OpenBottleDialogProps {
  open: boolean;
  wine: Wine | null;
  /** Where the event came from - shows up in the drink history. */
  source?: string;
  /** false pre-selects "note only" (e.g. when opened from the notes timeline). */
  defaultConsume?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const todayInputValue = (): string => {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

/** A date input gives a local calendar day; keep the time-of-day for today. */
const toIsoDate = (inputValue: string): string => {
  if (!inputValue) return new Date().toISOString();
  if (inputValue === todayInputValue()) return new Date().toISOString();
  return new Date(`${inputValue}T12:00:00`).toISOString();
};

export const OpenBottleDialog: React.FC<OpenBottleDialogProps> = ({
  open,
  wine,
  source = 'detail',
  defaultConsume = true,
  onClose,
  onSaved
}) => {
  const [consume, setConsume] = useState(defaultConsume);
  const [date, setDate] = useState(todayInputValue());
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConsume(defaultConsume && (wine?.quantity ?? 0) > 0);
      setDate(todayInputValue());
      setRating(0);
      setNote('');
      setError(null);
    }
  }, [open, defaultConsume, wine]);

  if (!open || !wine) return null;

  const hasNote = rating > 0 || note.trim().length > 0;
  const outOfStock = (wine.quantity ?? 0) <= 0;
  const canSave = (consume && !outOfStock) || hasNote;

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      if (consume && !outOfStock) {
        await storageService.consumeBottle(wine.id, source);
      }

      if (hasNote) {
        await storageService.addTasting({
          wine_id: wine.id,
          date: toIsoDate(date),
          // The DB constrains rating to 1-5, so "no rating" must stay unset.
          ...(rating > 0 ? { rating } : {}),
          note: note.trim()
        });
      }

      const parts: string[] = [];
      if (consume && !outOfStock) parts.push('Flasche gebucht');
      if (hasNote) parts.push('Notiz gespeichert');
      onSaved(`${parts.join(' · ')}.`);
    } catch (err) {
      setError((err as Error)?.message || 'Konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Flasche öffnen"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-burgundy/10 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-alabaster px-6 py-5">
          <div className="min-w-0">
            <h3 className="font-serif text-2xl text-charcoal">Flasche öffnen</h3>
            <p className="truncate text-sm text-stone-gray">
              {wine.vintage} {wine.name}
            </p>
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

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <label className="flex items-start gap-3 rounded-2xl border border-stone-200 p-4">
            <input
              type="checkbox"
              checked={consume}
              disabled={isSaving || outOfStock}
              onChange={(event) => setConsume(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-burgundy"
            />
            <span className="text-sm">
              <span className="block font-bold text-charcoal">Flasche vom Bestand abziehen</span>
              <span className="block text-stone-gray">
                {outOfStock
                  ? 'Keine Flasche mehr im Bestand – Notiz ist trotzdem möglich.'
                  : `Bestand danach: ${Math.max(0, (wine.quantity ?? 0) - 1)} Fl.`}
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="open-bottle-date"
              className="mb-1 block text-[10px] font-black uppercase tracking-widest text-stone-gray"
            >
              Wann
            </label>
            <input
              id="open-bottle-date"
              type="date"
              value={date}
              max={todayInputValue()}
              disabled={isSaving}
              onChange={(event) => setDate(event.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-stone-gray">
              Bewertung
            </span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={isSaving}
                  onClick={() => setRating(rating === value ? 0 : value)}
                  aria-label={`${value} von 5`}
                  aria-pressed={rating >= value}
                  className="rounded-lg p-1 transition-transform hover:scale-110 disabled:opacity-40"
                >
                  <Star
                    className={`h-6 w-6 ${rating >= value ? 'fill-gold text-gold' : 'text-stone-300'}`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <button
                  type="button"
                  onClick={() => setRating(0)}
                  className="ml-1 text-[10px] font-black uppercase tracking-[0.14em] text-stone-gray hover:text-burgundy"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="open-bottle-note"
              className="mb-1 block text-[10px] font-black uppercase tracking-widest text-stone-gray"
            >
              Notiz
            </label>
            <textarea
              id="open-bottle-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSaving}
              rows={4}
              placeholder="Wie war er? Mit wem, zu welchem Anlass, zu welchem Essen?"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-alabaster px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-stone-600 transition-all hover:border-stone-300 disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-premium transition-all hover:bg-burgundy-light disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GlassWater className="h-4 w-4" />}
            {consume ? 'Öffnen & speichern' : 'Notiz speichern'}
          </button>
        </div>
      </div>
    </div>
  );
};
