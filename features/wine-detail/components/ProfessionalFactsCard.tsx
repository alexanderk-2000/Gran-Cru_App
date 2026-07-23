import { memo } from 'react';
import { extractFactOrder, normalizeFactLabel, professionalFactGroups, type FactItem } from '../wineDetailSelectors.ts';
import { FactValue } from './FactValue.tsx';

export const ProfessionalFactsCard = memo(function ProfessionalFactsCard({ items }: { items: FactItem[] }) {
  const grouped = professionalFactGroups.map((group) => ({
    ...group,
    items: items.filter((item) => {
      const order = extractFactOrder(item.label);
      return order >= group.min && order <= group.max;
    })
  }));

  const ungrouped = items.filter((item) => extractFactOrder(item.label) === Number.MAX_SAFE_INTEGER);

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Professionelles Weinprofil</h3>
      <p className="mb-6 text-xs uppercase tracking-[0.14em] text-stone-500">Strukturiert nach Herkunft, Ausbau und Reife</p>
      <div className="space-y-6">
        {grouped
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <article key={group.title} className="rounded-2xl border border-stone-200 bg-white">
              <header className="border-b border-stone-100 px-4 py-3">
                <h4 className="font-serif text-lg text-stone-900">{group.title}</h4>
                <p className="text-xs text-stone-500">{group.subtitle}</p>
              </header>
              <dl className="divide-y divide-stone-100 px-4">
                {group.items.map((item) => (
                  <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                      {normalizeFactLabel(item.label)}
                    </dt>
                    <dd className="min-w-0">
                      <FactValue label={item.label} value={item.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}

        {ungrouped.length > 0 ? (
          <article className="rounded-2xl border border-stone-200 bg-white">
            <header className="border-b border-stone-100 px-4 py-3">
              <h4 className="font-serif text-lg text-stone-900">Weitere Angaben</h4>
            </header>
            <dl className="divide-y divide-stone-100 px-4">
              {ungrouped.map((item) => (
                <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                    {normalizeFactLabel(item.label)}
                  </dt>
                  <dd className="min-w-0">
                    <FactValue label={item.label} value={item.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ) : null}
      </div>
    </section>
  );
});
