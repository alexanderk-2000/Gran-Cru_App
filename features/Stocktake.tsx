import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, Loader2, Search } from 'lucide-react';
import { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';

interface StocktakeProps {
  wines: Wine[];
  onUpdate: () => void;
}

export const Stocktake: React.FC<StocktakeProps> = ({ wines, onUpdate }) => {
  const navigate = useNavigate();
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

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-stone-gray hover:text-burgundy uppercase text-[10px] font-black tracking-widest transition-all mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück zum Keller
          </button>
          <h2 className="font-serif text-4xl font-bold text-charcoal">Inventur</h2>
          <p className="text-stone-gray font-medium tracking-wide">
            Gezählten Bestand eintragen und Abweichungen als Korrektur übernehmen. Funktioniert vollständig offline.
          </p>
        </div>
        <button
          onClick={handleApply}
          disabled={discrepancies.length === 0 || isApplying}
          className="px-5 py-3 bg-burgundy text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-burgundy-light transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {discrepancies.length > 0 ? `${discrepancies.length} Korrektur(en) übernehmen` : 'Keine Abweichungen'}
        </button>
      </header>

      {lastAppliedCount !== null && (
        <div className="bg-sage-light border border-sage/30 text-sage px-4 py-3 rounded-xl text-sm">
          {lastAppliedCount} Korrektur(en) wurden als Bestandsereignis gespeichert.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
        <input
          type="text"
          placeholder="Kollektion durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-burgundy/5 rounded-2xl text-sm focus:border-burgundy/20 focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-[2rem] border border-burgundy/5 shadow-premium overflow-hidden">
        {filteredWines.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-alabaster text-[10px] font-black uppercase tracking-widest text-stone-gray">
                <th className="text-left px-6 py-4">Wein</th>
                <th className="text-right px-6 py-4">Soll-Bestand</th>
                <th className="text-right px-6 py-4">Gezählt</th>
                <th className="text-right px-6 py-4">Differenz</th>
              </tr>
            </thead>
            <tbody>
              {filteredWines.map((wine) => {
                const counted = getCounted(wine);
                const delta = counted - wine.quantity;
                return (
                  <tr key={wine.id} className={`border-b border-alabaster last:border-0 ${delta !== 0 ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-6 py-4">
                      <p className="font-serif font-bold text-charcoal">{wine.vintage} {wine.name}</p>
                      <p className="text-xs text-stone-gray">{wine.producer}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-stone-gray">{wine.quantity}</td>
                    <td className="px-6 py-4 text-right">
                      <input
                        type="number"
                        min={0}
                        value={counts[wine.id] ?? String(wine.quantity)}
                        onChange={(e) => handleCountChange(wine.id, e.target.value)}
                        disabled={isApplying}
                        className="w-20 text-right rounded-lg border border-stone-200 px-2 py-1.5 text-sm font-medium focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className={`px-6 py-4 text-right font-black ${delta > 0 ? 'text-sage' : delta < 0 ? 'text-red-600' : 'text-stone-gray/40'}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-32 flex flex-col items-center justify-center text-center">
            <ClipboardList className="w-20 h-20 text-burgundy/10 mb-6" />
            <h3 className="text-2xl font-serif text-charcoal mb-2">Keine Weine gefunden</h3>
            <p className="text-stone-gray text-sm">Keine Bestände für eine Inventur vorhanden.</p>
          </div>
        )}
      </div>
    </div>
  );
};
