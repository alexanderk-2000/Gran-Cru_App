import { memo } from 'react';
import { Plus, X } from 'lucide-react';
import type { GrapeFormEntry } from '../../features/wine-capture/wineCaptureMapping.ts';

export const GrapesField = memo(function GrapesField({
  value,
  onChange
}: {
  value: GrapeFormEntry[];
  onChange: (next: GrapeFormEntry[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<GrapeFormEntry>) => {
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
            placeholder="Rebsorte, z. B. Cabernet Sauvignon"
            value={row.name}
            onChange={(event) => updateRow(index, { name: event.target.value })}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <input
            type="number"
            placeholder="%"
            min={0}
            max={100}
            value={row.percentage}
            onChange={(event) => updateRow(index, { percentage: event.target.value })}
            className="w-20 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500"
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-alabaster hover:text-burgundy"
            aria-label="Rebsorte entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: '', percentage: '' }])}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-burgundy/40 hover:text-burgundy"
      >
        <Plus className="h-3.5 w-3.5" /> Rebsorte hinzufügen
      </button>
    </div>
  );
});
