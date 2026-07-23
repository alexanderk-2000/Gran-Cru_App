import { memo } from 'react';
import type { StructureFormState } from '../../features/wine-capture/wineCaptureMapping.ts';

const STRUCTURE_SLIDER_FIELDS: {
  key: keyof StructureFormState;
  label: string;
  lowLabel: string;
  highLabel: string;
}[] = [
  { key: 'acidity', label: 'Säure', lowLabel: 'mild', highLabel: 'straff' },
  { key: 'tannin', label: 'Tannin', lowLabel: 'weich', highLabel: 'kräftig' },
  { key: 'body', label: 'Körper', lowLabel: 'leicht', highLabel: 'voll' },
  { key: 'sweetness', label: 'Süße', lowLabel: 'trocken', highLabel: 'süß' },
  { key: 'oak', label: 'Holzausbau', lowLabel: 'kein Holz', highLabel: 'stark geprägt' }
];

export const StructureSlidersField = memo(function StructureSlidersField({
  value,
  onChange
}: {
  value: StructureFormState;
  onChange: (next: StructureFormState) => void;
}) {
  return (
    <div className="space-y-4">
      {STRUCTURE_SLIDER_FIELDS.map(({ key, label, lowLabel, highLabel }) => {
        const current = value[key];
        const isSet = current !== null;
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">{label}</span>
              <label className="flex items-center gap-2 text-xs text-stone-500">
                <input
                  type="checkbox"
                  checked={isSet}
                  onChange={(event) =>
                    onChange({ ...value, [key]: event.target.checked ? current ?? 3 : null })
                  }
                />
                erfasst
              </label>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={current ?? 3}
              disabled={!isSet}
              onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
              className="w-full accent-[#5B1E2D] disabled:opacity-40"
            />
            <div className="flex justify-between text-[10px] uppercase tracking-[0.1em] text-stone-400">
              <span>{lowLabel}</span>
              <span>{isSet ? current : '—'}</span>
              <span>{highLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
