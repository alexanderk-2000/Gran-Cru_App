import { memo } from 'react';
import { Plus, X } from 'lucide-react';
import type { ScoreFormEntry } from '../../features/wine-capture/wineCaptureMapping.ts';

export const ScoresField = memo(function ScoresField({
  value,
  onChange
}: {
  value: ScoreFormEntry[];
  onChange: (next: ScoreFormEntry[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<ScoreFormEntry>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Kritiker, z. B. Parker"
            value={row.critic}
            onChange={(event) => updateRow(index, { critic: event.target.value })}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="text"
            placeholder="Score"
            value={row.score}
            onChange={(event) => updateRow(index, { score: event.target.value })}
            className="w-20 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="number"
            placeholder="Jahr"
            value={row.year}
            onChange={(event) => updateRow(index, { year: event.target.value })}
            className="w-24 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-alabaster hover:text-burgundy"
            aria-label="Score entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { critic: '', score: '', year: '' }])}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-burgundy/40 hover:text-burgundy"
      >
        <Plus className="h-3.5 w-3.5" /> Score hinzufügen
      </button>
    </div>
  );
});
