import { memo } from 'react';
import { Wind } from 'lucide-react';
import { ACCENT_BURGUNDY } from '../colors.ts';
import type { AromaEntry } from '../wineDetailSelectors.ts';

export const AromaCard = memo(function AromaCard({ aromas }: { aromas: { primary: AromaEntry[]; secondary: AromaEntry[] } }) {
  const renderGroup = (title: string, entries: AromaEntry[]) => (
    <div>
      <h4 className="mb-3 text-xs uppercase tracking-[0.16em] text-stone-500">{title}</h4>
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <span
              key={`${title}-${entry.tag}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                title === 'Primary' ? 'border-[color:#5B1E2D]/25 bg-[color:#5B1E2D]/10 text-[color:#5B1E2D]' : 'border-stone-200 bg-white text-stone-700'
              }`}
            >
              {entry.tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">Keine Angaben</p>
      )}
    </div>
  );

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Wind className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Aromatik
      </h3>
      <div className="space-y-6">
        {renderGroup('Primary', aromas.primary)}
        {renderGroup('Secondary', aromas.secondary)}
      </div>
    </section>
  );
});
