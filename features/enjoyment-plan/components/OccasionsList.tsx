import React from 'react';
import { CalendarDays, Settings, Trash2, Wand2 } from 'lucide-react';
import { Occasion, OccasionInstance, RepeatRule } from '../../../types.ts';

const REPEAT_RULE_LABEL: Record<RepeatRule, string> = {
  none: 'Einmalig',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich'
};

interface OccasionsListProps {
  occasions: Occasion[];
  futureInstances: OccasionInstance[];
  selectedOccasionId: string | null;
  onToggleSelect: (occasionId: string) => void;
  onOpenPool: (occasion: Occasion) => void;
  onEditSeries: (occasion: Occasion) => void;
  onDeleteSeries: (occasionId: string) => void;
}

export const OccasionsList: React.FC<OccasionsListProps> = ({
  occasions,
  futureInstances,
  selectedOccasionId,
  onToggleSelect,
  onOpenPool,
  onEditSeries,
  onDeleteSeries
}) => (
  <section className="bg-white border border-burgundy/10 rounded-[2.5rem] shadow-premium p-8">
    <div className="flex items-center justify-between gap-4 mb-6">
      <h3 className="font-serif text-2xl font-bold text-charcoal">Anlässe</h3>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-gray">{occasions.length} Serien</p>
    </div>

    {occasions.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-16 bg-alabaster rounded-2xl border border-burgundy/10">
        <CalendarDays className="w-12 h-12 text-burgundy/20 mb-4" />
        <p className="text-sm text-stone-gray">Noch keine Serien vorhanden.</p>
      </div>
    ) : (
      <div className="space-y-3">
        {occasions.map((occasion) => {
          const isActive = selectedOccasionId === occasion.id;
          const count = futureInstances.filter((instance) => instance.occasion_id === occasion.id).length;
          return (
            <div
              key={occasion.id}
              className={`rounded-2xl border p-4 transition-all ${
                isActive ? 'border-burgundy/30 bg-burgundy/5 shadow-[0_8px_20px_rgba(91,30,45,0.08)]' : 'border-burgundy/10 bg-white hover:border-burgundy/20'
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-serif text-xl text-charcoal">{occasion.title}</p>
                  <p className="text-xs text-stone-gray mt-1">
                    {new Date(occasion.start_date).toLocaleDateString('de-DE')} - {new Date(occasion.end_date).toLocaleDateString('de-DE')}
                    {' · '}
                    {REPEAT_RULE_LABEL[occasion.repeat_rule]} {occasion.repeat_interval > 1 ? `(alle ${occasion.repeat_interval})` : ''}
                    {' · '}
                    {count} Termine
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleSelect(occasion.id)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                      isActive ? 'bg-burgundy text-white' : 'bg-white border border-burgundy/20 text-burgundy hover:bg-burgundy/5'
                    }`}
                  >
                    {isActive ? 'Ausblenden' : 'Termine anzeigen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPool(occasion)}
                    className="p-2 text-stone-gray/70 hover:text-burgundy transition-colors"
                    title="Wein-Pool"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditSeries(occasion)}
                    className="p-2 text-stone-gray/70 hover:text-burgundy transition-colors"
                    title="Serie bearbeiten"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSeries(occasion.id)}
                    className="p-2 text-stone-gray/40 hover:text-red-500 transition-colors"
                    title="Serie löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </section>
);
