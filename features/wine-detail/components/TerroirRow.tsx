import { memo } from 'react';
import { toNullableString } from '../wineDetailSelectors.ts';

export const TerroirRow = memo(function TerroirRow({ label, value }: { label: string; value: string | null | undefined }) {
  const safeValue = toNullableString(value) ?? '—';
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-stone-100 pb-2 last:border-none last:pb-0">
      <dt className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</dt>
      <dd className="text-sm leading-6 text-stone-800">{safeValue}</dd>
    </div>
  );
});
