import { memo } from 'react';
import type { FactItem } from '../wineDetailSelectors.ts';
import { FactValue } from './FactValue.tsx';

export const FactsDefinitionList = memo(function FactsDefinitionList({ items }: { items: FactItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Quick Facts</h3>
      <p className="mb-4 text-xs uppercase tracking-[0.14em] text-stone-500">Kernwerte auf einen Blick</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="grid grid-cols-1 gap-1 rounded-2xl border border-stone-100 bg-stone-50/60 px-3 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">{item.label}</p>
            <FactValue label={item.label} value={item.value} compact />
          </li>
        ))}
      </ul>
    </section>
  );
});
