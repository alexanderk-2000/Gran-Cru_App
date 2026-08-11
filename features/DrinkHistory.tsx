import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, GlassWater, Loader2, RefreshCw } from 'lucide-react';
import { storageService } from '../services/storage.ts';

/** Internal event sources ("detail", "dashboard", …) are not user-facing wording. */
const SOURCE_LABELS: Record<string, string> = {
  detail: 'Über die Weinseite',
  dashboard: 'Über die Kellerliste',
  stocktake: 'Bei der Inventur',
  genussplan: 'Über einen Anlass',
  manual: 'Manuell erfasst'
};

const sourceLabel = (source: string): string => SOURCE_LABELS[source] || 'Getrunken';

interface ConsumeEvent {
  id: string;
  wine_id: string;
  user_id: string;
  type: string;
  delta: number;
  source: string;
  created_at: string;
  wines: {
    name: string;
    producer?: string;
    vintage?: number;
  } | null;
}

export const DrinkHistory: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<ConsumeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh: boolean = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await storageService.getConsumptionHistory();
      setEvents(data as ConsumeEvent[]);
      setError(null);
    } catch (err: any) {
      // The banner below renders on every branch now. It used to sit inside
      // the "list is not empty" branch, so a failed load - which leaves the
      // list empty - showed nothing but a blocking alert().
      setError(err?.message || 'Trinkhistorie konnte nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, ConsumeEvent[]>();
    for (const event of events) {
      const day = new Date(event.created_at).toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(event);
    }
    return [...groups.entries()];
  }, [events]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-stone-gray hover:text-burgundy uppercase text-[10px] font-black tracking-widest transition-all mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück
          </button>
          <h2 className="font-serif text-4xl font-bold text-charcoal">Trinkhistorie</h2>
          <p className="text-stone-gray font-medium tracking-wide">Jede geöffnete Flasche, nach Tagen gruppiert.</p>
        </div>

        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-burgundy/10 rounded-xl text-xs font-black tracking-widest uppercase text-charcoal hover:border-burgundy/30 transition-all disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Aktualisieren
        </button>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-burgundy animate-spin" />
          <p className="text-xs font-black uppercase text-stone-gray tracking-widest">Lade Trinkhistorie ...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-24 bg-white rounded-[2.5rem] border border-burgundy/5 text-center">
          <GlassWater className="w-14 h-14 text-burgundy/20 mx-auto mb-4" />
          <h3 className="font-serif text-2xl text-charcoal mb-2">Noch keine Einträge</h3>
          <p className="text-stone-gray text-sm">Sobald du eine Flasche öffnest, erscheint sie hier.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayEvents]) => (
            <section key={day} className="bg-white rounded-[2rem] border border-burgundy/5 shadow-premium overflow-hidden">
              <div className="px-6 py-4 border-b border-alabaster bg-alabaster/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-gray">{day}</p>
              </div>

              <div className="divide-y divide-alabaster">
                {dayEvents.map((event) => (
                  <Link
                    key={event.id}
                    to={`/wine/${event.wine_id}`}
                    className="px-6 py-4 flex items-start justify-between gap-4 transition-colors hover:bg-alabaster/50"
                  >
                    <div>
                      <p className="font-serif text-xl text-charcoal">
                        {event.wines?.vintage ? `${event.wines.vintage} ` : ''}
                        {event.wines?.name || 'Unbekannter Wein'}
                      </p>
                      <p className="text-sm text-stone-gray">{event.wines?.producer || 'Produzent unbekannt'}</p>
                      <p className="text-[10px] mt-1 uppercase tracking-widest text-stone-gray/80">
                        {sourceLabel(event.source)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black text-burgundy">
                        {Math.abs(event.delta)} Fl.
                      </p>
                      <p className="text-xs text-stone-gray">{new Date(event.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
