import { memo, useEffect, useState } from 'react';
import type { NormalizedRating } from '../wineDetailSelectors.ts';

export const RatingsCard = memo(function RatingsCard({ ratings }: { ratings: NormalizedRating[] }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [ratings]);

  if (ratings.length === 0) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <h3 className="font-serif text-xl text-stone-900">Bewertungen</h3>
        <p className="mt-3 text-sm text-stone-500">Noch keine externen Bewertungen vorhanden.</p>
      </section>
    );
  }

  const visible = expanded ? ratings : ratings.slice(0, 8);
  const hasMore = ratings.length > 8;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-4 font-serif text-xl text-stone-900">Bewertungen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((rating) => (
          <div key={`${rating.critic}-${rating.scoreLabel}`} className="rounded-2xl border border-stone-200 bg-stone-50/50 p-3 text-center">
            <p className="font-serif text-2xl text-stone-900">{rating.scoreLabel}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-stone-500">{rating.critic}</p>
            {rating.year ? <p className="mt-0.5 text-[10px] text-stone-400">Jg. {rating.year}</p> : null}
          </div>
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Weniger anzeigen' : `Mehr anzeigen (${ratings.length - 8})`}
        </button>
      ) : null}
    </section>
  );
});
