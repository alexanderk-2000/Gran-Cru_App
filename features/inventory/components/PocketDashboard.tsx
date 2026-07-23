import React from 'react';
import type { PocketSummary } from '../inventorySelectors.ts';

interface PocketDashboardProps {
  entries: PocketSummary[];
  totalBottleCount: number;
  onSelectPocket: (pocketId: string) => void;
}

export const PocketDashboard: React.FC<PocketDashboardProps> = ({ entries, totalBottleCount, onSelectPocket }) => (
  <section className="rounded-[2rem] border-2 border-burgundy/5 bg-white p-6 shadow-premium">
    <div className="mb-5 flex flex-col gap-1">
      <h3 className="font-serif text-3xl text-charcoal">Hauptkeller Dashboard</h3>
      <p className="text-sm text-stone-gray">Wähle eine Pocket, um deren Weine zu öffnen.</p>
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((pocket) => {
        const percentage = totalBottleCount > 0 ? Math.round((pocket.bottleCount / totalBottleCount) * 100) : 0;
        return (
          <button
            key={pocket.id}
            type="button"
            onClick={() => onSelectPocket(pocket.id)}
            className="rounded-2xl border border-burgundy/10 bg-alabaster/50 p-5 text-left transition-all hover:border-burgundy/30 hover:bg-white"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-gray">Pocket</p>
            <p className="mt-1 font-serif text-2xl text-charcoal">{pocket.label}</p>
            <p className="mt-3 text-sm text-stone-gray">{pocket.wineCount} Weine · {pocket.bottleCount} Flaschen</p>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-burgundy">{percentage}% vom Gesamtbestand</p>
            <span className="mt-4 inline-flex rounded-lg border border-burgundy/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-burgundy">
              Pocket öffnen
            </span>
          </button>
        );
      })}
    </div>
  </section>
);
