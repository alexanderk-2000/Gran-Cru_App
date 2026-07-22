import React from 'react';
import { Clock, Wand2, X } from 'lucide-react';
import { Category, OccasionInstance, OccasionWinePriority } from '../../../types.ts';
import type { UseWinePoolResult } from '../hooks/useWinePool.ts';

interface WinePoolModalProps {
  pool: UseWinePoolResult;
  instances: OccasionInstance[];
}

export const WinePoolModal: React.FC<WinePoolModalProps> = ({ pool, instances }) => {
  if (!pool.showPoolModal || !pool.poolOccasion) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-burgundy/5 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-8 border-b border-alabaster flex justify-between items-center bg-alabaster/30">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-gray font-black">Wein-Pool</p>
            <h3 className="font-serif text-2xl font-bold text-charcoal">{pool.poolOccasion.title}</h3>
          </div>
          <button onClick={() => pool.setShowPoolModal(false)} className="p-2">
            <X />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={pool.poolSearch}
              onChange={(e) => pool.setPoolSearch(e.target.value)}
              placeholder="Suche Wein"
              className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
            />
            <select
              value={pool.poolCategoryFilter}
              onChange={(e) => pool.setPoolCategoryFilter(e.target.value as Category | 'All')}
              className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
            >
              <option value="All">Alle Kategorien</option>
              <option value="Genuss">Genuss</option>
              <option value="Investment">Investment</option>
              <option value="Rarität">Rarität</option>
              <option value="Daily Drinker">Daily Drinker</option>
            </select>
            <input
              type="text"
              value={pool.poolRegionFilter}
              onChange={(e) => pool.setPoolRegionFilter(e.target.value)}
              placeholder="Region"
              className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
            />
            <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
              <input type="checkbox" checked={pool.poolOnlyInStock} onChange={(e) => pool.setPoolOnlyInStock(e.target.checked)} />
              Bestand &gt; 0
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="1900"
              max="2100"
              value={pool.poolVintageFrom}
              onChange={(e) => pool.setPoolVintageFrom(e.target.value)}
              placeholder="Jahrgang ab"
              className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
            />
            <input
              type="number"
              min="1900"
              max="2100"
              value={pool.poolVintageTo}
              onChange={(e) => pool.setPoolVintageTo(e.target.value)}
              placeholder="Jahrgang bis"
              className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
            />
            <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
              <input type="checkbox" checked={pool.poolOnlyDrinkReady} onChange={(e) => pool.setPoolOnlyDrinkReady(e.target.checked)} />
              Nur trinkreif
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
              <input type="checkbox" checked={pool.allowUnknownMaturity} onChange={(e) => pool.setAllowUnknownMaturity(e.target.checked)} />
              Unbekannte Reife zulassen
            </label>
            <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
              <input type="checkbox" checked={pool.preferRare} onChange={(e) => pool.setPreferRare(e.target.checked)} />
              Raritäten priorisieren
            </label>
            <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
              <input type="checkbox" checked={pool.preferDaily} onChange={(e) => pool.setPreferDaily(e.target.checked)} />
              Daily priorisieren
            </label>
          </div>

          {pool.assignmentNotice && (
            <div className="bg-sage-light border border-sage/30 text-sage px-4 py-3 rounded-xl text-sm">{pool.assignmentNotice}</div>
          )}

          {pool.unassignedInstanceIds.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-xs">
              <p className="font-black uppercase tracking-widest mb-2">Offene Termine ohne Wein</p>
              <div className="flex flex-wrap gap-2">
                {pool.unassignedInstanceIds
                  .map((id) => instances.find((instance) => instance.id === id))
                  .filter((instance): instance is OccasionInstance => !!instance)
                  .map((instance) => (
                    <span key={instance.id} className="px-2 py-1 bg-white border border-amber-200 rounded-lg">
                      {new Date(instance.instance_date).toLocaleDateString('de-DE')}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-burgundy/10 bg-alabaster/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-gray">
                Auswahl: {pool.selectedVisibleCount} / {pool.poolVisibleWines.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={pool.handleSelectAllVisible}
                  disabled={pool.poolVisibleWines.length === 0 || pool.allVisibleSelected}
                  className="px-3 py-2 rounded-lg border border-burgundy/20 bg-white text-[10px] font-black uppercase tracking-widest text-burgundy disabled:opacity-40"
                >
                  Alle auswählen
                </button>
                <button
                  type="button"
                  onClick={pool.handleClearVisibleSelection}
                  disabled={pool.selectedVisibleCount === 0}
                  className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-[10px] font-black uppercase tracking-widest text-stone-700 disabled:opacity-40"
                >
                  Auswahl aufheben
                </button>
              </div>
            </div>

            {pool.poolVisibleWines.map((wine) => {
              const selected = pool.poolDraft[wine.id];
              return (
                <div key={wine.id} className="grid grid-cols-1 md:grid-cols-[auto,1fr,120px,120px] items-center gap-3 p-4 bg-white border border-burgundy/10 rounded-xl">
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={(e) => {
                      pool.setPoolDraft((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) {
                          next[wine.id] = next[wine.id] || { bottles_reserved: 1, priority: 'medium' };
                        } else {
                          delete next[wine.id];
                        }
                        return next;
                      });
                    }}
                  />

                  <div>
                    <p className="font-serif text-lg text-charcoal">{wine.vintage} {wine.name}</p>
                    <p className="text-xs text-stone-gray">{wine.producer || 'Produzent unbekannt'} · {wine.region} · Bestand {wine.quantity}</p>
                  </div>

                  <input
                    type="number"
                    min="1"
                    disabled={!selected}
                    value={selected?.bottles_reserved ?? 1}
                    onChange={(e) => {
                      const value = Math.max(1, Number(e.target.value || 1));
                      pool.setPoolDraft((prev) => ({
                        ...prev,
                        [wine.id]: {
                          bottles_reserved: value,
                          priority: prev[wine.id]?.priority || 'medium'
                        }
                      }));
                    }}
                    className="px-3 py-2 bg-alabaster border border-burgundy/10 rounded-xl text-sm disabled:opacity-40"
                  />

                  <select
                    disabled={!selected}
                    value={selected?.priority ?? 'medium'}
                    onChange={(e) => {
                      pool.setPoolDraft((prev) => ({
                        ...prev,
                        [wine.id]: {
                          bottles_reserved: prev[wine.id]?.bottles_reserved || 1,
                          priority: e.target.value as OccasionWinePriority
                        }
                      }));
                    }}
                    className="px-3 py-2 bg-alabaster border border-burgundy/10 rounded-xl text-sm disabled:opacity-40"
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-alabaster flex justify-end gap-3">
          <button
            onClick={() => pool.setShowPoolModal(false)}
            className="px-6 py-3 bg-white border border-burgundy/10 text-charcoal rounded-xl font-black uppercase tracking-widest text-[10px]"
          >
            Schließen
          </button>
          <button
            onClick={pool.handleAutoAssign}
            disabled={pool.assigning}
            className="px-6 py-3 bg-burgundy text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 disabled:opacity-50"
          >
            {pool.assigning ? <Clock className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Automatisch zuordnen
          </button>
        </div>
      </div>
    </div>
  );
};
