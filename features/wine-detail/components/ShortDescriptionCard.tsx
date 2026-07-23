import { memo } from 'react';

export const ShortDescriptionCard = memo(function ShortDescriptionCard({ description }: { description?: string | null }) {
  const cleaned = (description ?? '').trim();
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="font-serif text-xl text-stone-900">Kurzbeschreibung</h3>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        {cleaned || 'Für diesen Wein ist noch keine Kurzbeschreibung hinterlegt.'}
      </p>
    </section>
  );
});
