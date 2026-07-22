import React from 'react';

export const KpiCard = ({
  icon: Icon,
  label,
  value,
  subline,
  accent
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subline?: string;
  accent?: string;
}) => (
  <article className="h-full min-h-[148px] rounded-2xl bg-white p-5 shadow-[0_10px_24px_rgba(40,35,37,0.06)]">
    <div className="mb-3 inline-flex rounded-xl bg-alabaster p-2.5">
      <Icon className={`h-4 w-4 ${accent || 'text-stone-gray'}`} />
    </div>
    <p className="text-xs text-stone-gray">{label}</p>
    <p className={`mt-1 font-serif text-3xl leading-none text-charcoal [font-variant-numeric:tabular-nums] ${accent || ''}`}>{value}</p>
    {subline ? <p className="mt-2 text-xs text-stone-500">{subline}</p> : null}
  </article>
);
