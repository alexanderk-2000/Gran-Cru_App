import { memo } from 'react';
import { Star } from 'lucide-react';
import type { Tasting } from '../../../types.ts';

export const NotesTimeline = memo(function NotesTimeline({
  tastings,
  onCreateNote,
  disabled
}: {
  tastings: Tasting[];
  onCreateNote: () => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="font-serif text-xl text-stone-900">Verkostungen</h3>
        <button
          type="button"
          onClick={onCreateNote}
          disabled={disabled}
          className="rounded-full border border-stone-300 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          Flasche trinken
        </button>
      </div>

      {tastings.length === 0 ? (
        <p className="text-sm text-stone-500">Noch keine Verkostungen vorhanden.</p>
      ) : (
        <ol className="space-y-5">
          {tastings.map((tasting) => (
            <li key={tasting.id} className="rounded-2xl border border-stone-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <time className="text-xs uppercase tracking-[0.16em] text-stone-500">
                  {new Date(tasting.date).toLocaleDateString('de-DE')}
                </time>
                <div className="flex items-center gap-0.5" aria-label={`Bewertung ${tasting.rating} von 5`}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={`${tasting.id}-${star}`}
                      className={`h-3.5 w-3.5 ${star <= tasting.rating ? 'fill-current text-[color:#C8A24A]' : 'text-stone-300'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="font-serif text-base leading-relaxed text-stone-800">“{tasting.note}”</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
