import { memo } from 'react';
import { normalizeFactLabel, splitByDelimiter } from '../wineDetailSelectors.ts';

export const FactValue = memo(function FactValue({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === '—') {
    return <p className="text-sm text-stone-400">—</p>;
  }

  const piped = splitByDelimiter(cleaned, '|');
  if (piped.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {piped.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  const commaSeparated = splitByDelimiter(cleaned, ',');
  if (normalizeFactLabel(label).toLowerCase().includes('aromenprofil') && commaSeparated.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {commaSeparated.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className={`${compact ? 'text-sm' : 'text-[15px]'} leading-6 text-stone-800 break-words`}>
      {cleaned}
    </p>
  );
});
