import { memo } from 'react';
import { Activity } from 'lucide-react';
import { ACCENT_BURGUNDY } from '../colors.ts';
import type { StructureRows } from '../wineDetailSelectors.ts';

export const StructureCard = memo(function StructureCard({ rows }: { rows: StructureRows }) {
  const bars = [
    { label: 'Säure', value: rows.acidity, description: null as string | null },
    { label: 'Tannin', value: rows.tannin, description: null as string | null },
    { label: 'Körper', value: rows.body, description: null as string | null },
    { label: 'Süße', value: rows.sweetness, description: rows.sweetnessText },
    { label: 'Holz', value: rows.oak, description: null as string | null }
  ];

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Activity className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Struktur
      </h3>

      <div className="space-y-5">
        {bars.map((bar) => {
          const barValue = bar.value;
          return (
            <div key={bar.label}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-xs uppercase tracking-[0.16em] text-stone-500">{bar.label}</span>
                <span className="text-xs text-stone-500">{barValue ?? bar.description ?? '—'}</span>
              </div>
              {barValue === null ? (
                <div className="h-1.5 rounded-full bg-stone-100" />
              ) : (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <span
                      key={`${bar.label}-${idx}`}
                      className={`h-1.5 flex-1 rounded-full ${idx <= barValue ? 'bg-[color:#5B1E2D]' : 'bg-stone-100'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});
