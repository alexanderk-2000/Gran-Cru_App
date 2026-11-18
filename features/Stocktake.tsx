import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Loader2, Minus, Plus, Search } from 'lucide-react';
import { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { PageHeader, buttonClass, cardClass } from '../components/PageHeader.tsx';

interface StocktakeProps {
  wines: Wine[];
  onUpdate: () => void;
}

export const Stocktake: React.FC<StocktakeProps> = ({ wines, onUpdate }) => {
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAppliedCount, setLastAppliedCount] = useState<number | null>(null);

  const inventoryWines = useMemo(
    () => wines.filter((wine) => !wine.wishlist && !wine.deleted_at),
    [wines]
  );

  const filteredWines = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return inventoryWines;
    return inventoryWines.filter(
      (wine) =>
        wine.name.toLowerCase().includes(term) ||
        (wine.producer || '').toLowerCase().includes(term)
    );
  }, [inventoryWines, search]);

  const getCounted = (wine: Wine): number => {
    const raw = counts[wine.id];
    if (raw === undefined || raw === '') return wine.quantity;
    const parsed = Math.round(Number(raw));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : wine.quantity;
  };

  const discrepancies = useMemo(() => {
    return inventoryWines.filter((wine) => {
      const raw = counts[wine.id];
      if (raw === undefined || raw === '') return false;
      const parsed = Math.round(Number(raw));
      if (!Number.isFinite(parsed) || parsed < 0) return false;
      return parsed !== wine.quantity;
    });
  }, [inventoryWines, counts]);

  const handleCountChange = (wineId: string, value: string) => {
    setCounts((prev) => ({ ...prev, [wineId]: value }));
  };

  const handleApply = async () => {
    if (discrepancies.length === 0 || isApplying) return;
    if (!window.confirm(`${discrepancies.length} Abweichung(en) als Bestandskorrektur übernehmen?`)) return;

    setIsApplying(true);
    setError(null);
    let applied = 0;
    try {
      for (const wine of discrepancies) {
        const counted = getCounted(wine);
        const delta = counted - wine.quantity;
        if (delta === 0) continue;
        await storageService.adjustStock(wine.id, delta, 'stocktake');
        applied += 1;
      }
      setCounts({});
      setLastAppliedCount(applied);
      onUpdate();
    } catch (err) {
      setError((err as Error)?.message || 'Korrekturen konnten nicht vollständig übernommen werden.');
    } finally {
      setIsApplying(false);
    }
  };

  const countedCount = inventoryWines.filter((wine) => counts[wine.id] !== undefined && counts[wine.id] !== '').length;
  const saldo = discrepancies.reduce((sum, wine) => sum + (getCounted(wine) - wine.quantity), 0);
  const stepCount = (wine: Wine, delta: number) => {
    handleCountChange(wine.id, String(Math.max(0, getCounted(wine) + delta)));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      <PageHeader
        eyebrow="Keller"
        title="Inventur"
        description="Gezählte Flaschen eintragen, Abweichungen prüfen, dann übernehmen. Funktioniert auch offline."
        actions={
          <button onClick={handleApply} disabled={discrepancies.length === 0 || isApplying} className={buttonClass.primary}>
            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {discrepancies.length > 0 ? `${discrepancies.length} Korrektur(en) übernehmen` : 'Keine Abweichungen'}
          </button>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${cardClass} px-[22px] py-5 flex flex-col gap-2.5`}>
          <span className="text-[13px] text-stone-gray">Fortschritt</span>
          <span className="text-[26px] font-bold leading-tight tabular-nums">
            {countedCount} <span className="text-[15px] font-medium text-stone-gray">von {inventoryWines.length} Weinen</span>
          </span>
          <span
            role="progressbar"
            aria-label="Fortschritt"
            aria-valuenow={countedCount}
            aria-valuemin={0}
            aria-valuemax={inventoryWines.length}
            className="block h-1.5 rounded-full bg-sand overflow-hidden"
          >
            <span className="block h-full bg-charcoal" style={{ width: `${inventoryWines.length ? (countedCount / inventoryWines.length) * 100 : 0}%` }} />
          </span>
        </div>
        <div className={`${cardClass} px-[22px] py-5 flex flex-col gap-1.5`}>
          <span className="text-[13px] text-stone-gray">Mit Differenz</span>
          <span className={`text-[26px] font-bold leading-tight tabular-nums ${discrepancies.length ? 'text-burgundy' : 'text-charcoal'}`}>{discrepancies.length}</span>
          <span className="text-[13px] text-charcoal-soft">Weine weichen vom Soll ab</span>
        </div>
        <div className={`${cardClass} px-[22px] py-5 flex flex-col gap-1.5`}>
          <span className="text-[13px] text-stone-gray">Saldo</span>
          <span className="text-[26px] font-bold leading-tight tabular-nums">{saldo > 0 ? `+${saldo}` : saldo} Fl.</span>
          <span className="text-[13px] text-charcoal-soft">gegenüber Soll-Bestand</span>
        </div>
      </section>

      {lastAppliedCount !== null && (
        <div role="status" className="bg-sage-light text-sage px-4 py-3 rounded-[10px] text-sm font-medium">
          {lastAppliedCount} Korrektur(en) wurden als Bestandsereignis gespeichert.
        </div>
      )}

      {error && (
        <div role="alert" className="bg-burgundy-tint text-burgundy-dark px-4 py-3 rounded-[10px] text-sm">
          {error}
        </div>
      )}

      <label className="relative block max-w-md">
        <span className="sr-only">Kollektion durchsuchen</span>
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
        <input
          type="text"
          placeholder="Kollektion durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-white border border-line-strong rounded-[10px] text-sm focus:border-burgundy focus:ring-2 focus:ring-burgundy/15 focus:outline-none"
        />
      </label>

      <div className={`${cardClass} overflow-x-auto`}>
        {filteredWines.length > 0 ? (
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-[0.06em] text-stone-gray">
                <th scope="col" className="text-left px-5 py-3.5 font-semibold">Wein</th>
                <th scope="col" className="text-right px-3 py-3.5 font-semibold">Soll</th>
                <th scope="col" className="text-center px-3 py-3.5 font-semibold">Gezählt</th>
                <th scope="col" className="text-right px-5 py-3.5 font-semibold">Differenz</th>
              </tr>
            </thead>
            <tbody>
              {filteredWines.map((wine) => {
                const counted = getCounted(wine);
                const delta = counted - wine.quantity;
                const touched = counts[wine.id] !== undefined && counts[wine.id] !== '';
                return (
                  <tr key={wine.id} className={`border-t border-line-soft ${delta !== 0 ? 'bg-burgundy-wash' : ''}`}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-charcoal">{wine.vintage} {wine.name}</p>
                      <p className="text-xs text-stone-gray">{wine.producer || wine.subcellar || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{wine.quantity}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => stepCount(wine, -1)}
                          disabled={isApplying}
                          aria-label={`${wine.name}: eine Flasche weniger`}
                          className="w-9 h-9 rounded-lg border border-line-strong bg-white flex items-center justify-center hover:bg-alabaster disabled:opacity-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`${wine.name}: gezählte Flaschen`}
                          value={counts[wine.id] ?? String(wine.quantity)}
                          onChange={(e) => handleCountChange(wine.id, e.target.value)}
                          disabled={isApplying}
                          className={`w-14 h-9 text-center rounded-lg border border-line-strong text-base font-bold tabular-nums focus:border-burgundy focus:outline-none disabled:opacity-50 ${touched ? 'text-charcoal' : 'text-stone-gray'}`}
                        />
                        <button
                          type="button"
                          onClick={() => stepCount(wine, 1)}
                          disabled={isApplying}
                          aria-label={`${wine.name}: eine Flasche mehr`}
                          className="w-9 h-9 rounded-lg border border-line-strong bg-white flex items-center justify-center hover:bg-alabaster disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className={`px-5 py-3 text-right font-bold tabular-nums ${delta === 0 ? 'text-sage' : 'text-burgundy'}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-20 px-6 flex flex-col items-center justify-center gap-2 text-center">
            <span aria-hidden="true" className="w-14 h-14 rounded-full bg-sand flex items-center justify-center text-stone-gray mb-1">
              <ClipboardList className="w-6 h-6" />
            </span>
            <h2 className="text-lg font-semibold text-charcoal">Keine Weine gefunden</h2>
            <p className="text-charcoal-soft text-sm">Keine Bestände für eine Inventur vorhanden.</p>
          </div>
        )}
      </div>
    </div>
  );
};
