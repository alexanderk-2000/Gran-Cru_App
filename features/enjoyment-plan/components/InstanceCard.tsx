import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Settings, Trash2, Wand2, Wine as WineIcon, X } from 'lucide-react';
import { Occasion, OccasionInstance, Wine } from '../../../types.ts';

export const InstanceCard: React.FC<{
  instance: OccasionInstance;
  wines: Wine[];
  onAssign: (instanceId: string, wineId: string | null) => void;
  onStatusChange: (instance: OccasionInstance, status: 'planned' | 'consumed' | 'skipped') => void;
  onEditSeries: (occasion: Occasion) => void;
  onDeleteSeries: (occasionId: string) => void;
  onOpenPool: (occasion: Occasion) => void;
}> = ({ instance, wines, onAssign, onStatusChange, onEditSeries, onDeleteSeries, onOpenPool }) => {
  const [isAssigning, setIsAssigning] = useState(false);
  const [search, setSearch] = useState('');
  const selectedWine = wines.find((wine) => wine.id === instance.wine_id);
  const isConsumed = instance.status === 'consumed';
  const isSkipped = instance.status === 'skipped';

  const filteredWines = useMemo(() => {
    if (!search.trim()) return wines;
    const q = search.toLowerCase();
    return wines.filter((wine) =>
      wine.name.toLowerCase().includes(q) ||
      (wine.producer || '').toLowerCase().includes(q) ||
      String(wine.vintage || '').includes(q)
    );
  }, [wines, search]);

  const statusLabel = isConsumed ? 'Genossen' : isSkipped ? 'Übersprungen' : 'Geplant';

  return (
    <div className={`
      relative group bg-white p-8 rounded-[2.5rem] border transition-all duration-500 flex flex-col h-full shadow-premium
      ${isConsumed ? 'opacity-50 grayscale' : 'hover:scale-[1.02] border-burgundy/5'}
      ${selectedWine && !isConsumed ? 'border-gold/30 ring-1 ring-gold/10' : ''}
    `}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-[10px] font-black text-burgundy uppercase tracking-[0.2em] mb-1">
            {new Date(instance.instance_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}
          </p>
          <p className="text-xs font-bold text-stone-gray uppercase tracking-widest">
            {new Date(instance.instance_date).getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {instance.occasion && (
            <>
              <button
                onClick={() => onOpenPool(instance.occasion as Occasion)}
                className="p-2 text-stone-gray/50 hover:text-burgundy transition-colors"
                title="Wein-Pool & Auto-Zuordnung"
              >
                <Wand2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEditSeries(instance.occasion as Occasion)}
                className="p-2 text-stone-gray/40 hover:text-burgundy transition-colors"
                title="Serie bearbeiten"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={() => onDeleteSeries(instance.occasion_id)} className="p-2 text-stone-gray/20 hover:text-red-500 transition-colors" title="Serie löschen">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <h4 className="font-serif text-2xl font-bold text-charcoal leading-tight mb-2">{instance.occasion?.title}</h4>
      {instance.assignment_reason && (
        <p className="text-[10px] text-stone-gray uppercase tracking-[0.14em] mb-6">
          {instance.auto_assigned ? 'Auto' : 'Manuell'} · {instance.assignment_reason}
        </p>
      )}

      <div className="flex-1 space-y-4 mb-8">
        <div className={`p-5 rounded-2xl border transition-all flex items-center gap-4 ${
          selectedWine ? 'bg-gold/5 border-gold/20' : 'bg-alabaster border-burgundy/5'
        }`}>
          <div className={`p-2 rounded-lg ${selectedWine ? 'text-gold' : 'text-stone-gray/30'}`}>
            <WineIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-widest text-stone-gray mb-0.5">Reservierter Wein</p>
            {selectedWine ? (
              <p className="text-sm font-bold text-charcoal truncate"><span className="text-burgundy opacity-70">{selectedWine.vintage}</span> {selectedWine.name}</p>
            ) : (
              <p className="text-sm font-medium text-stone-gray/50 italic">Keine Zuweisung</p>
            )}
          </div>
          {selectedWine && (
            <button onClick={() => onAssign(instance.id, null)} className="p-1.5 hover:bg-white rounded-lg transition-colors text-stone-gray">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isAssigning ? (
          <div className="space-y-2 animate-in slide-in-from-top-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche Wein..."
              className="w-full px-4 py-2 bg-white border border-burgundy/20 rounded-xl text-xs font-bold focus:outline-none"
            />
            <select
              autoFocus
              className="w-full px-4 py-3 bg-white border border-burgundy/20 rounded-xl text-xs font-bold focus:outline-none"
              onChange={(e) => {
                if (!e.target.value) {
                  setIsAssigning(false);
                  return;
                }
                onAssign(instance.id, e.target.value);
                setIsAssigning(false);
              }}
              onBlur={() => setIsAssigning(false)}
              value=""
            >
              <option value="">Wein wählen...</option>
              {filteredWines.map((wine) => (
                <option key={wine.id} value={wine.id}>{wine.vintage} {wine.name} ({wine.quantity} Fl.)</option>
              ))}
            </select>
          </div>
        ) : (
          !selectedWine && !isConsumed && (
            <button
              onClick={() => setIsAssigning(true)}
              className="w-full py-3 bg-white border-2 border-dashed border-burgundy/10 hover:border-burgundy/30 text-burgundy text-[10px] font-black rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-3 h-3" /> Wein zuordnen
            </button>
          )
        )}
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-alabaster">
        <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${isConsumed ? 'text-sage' : isSkipped ? 'text-stone-gray' : 'text-stone-gray/60'}`}>
          <CheckCircle2 className="w-4 h-4" />
          {statusLabel}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onStatusChange(instance, isSkipped ? 'planned' : 'skipped')}
            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              isSkipped ? 'bg-alabaster text-stone-gray' : 'bg-white border border-burgundy/20 text-burgundy hover:bg-burgundy/5'
            }`}
          >
            {isSkipped ? 'Geplant' : 'Überspringen'}
          </button>
          <button
            onClick={() => onStatusChange(instance, isConsumed ? 'planned' : 'consumed')}
            className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              isConsumed ? 'bg-alabaster text-stone-gray' : 'bg-burgundy text-white hover:bg-burgundy-light shadow-lg'
            }`}
          >
            {isConsumed ? 'Reaktivieren' : 'Getrunken'}
          </button>
        </div>
      </div>
    </div>
  );
};
