import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassWater, Loader2, RefreshCw } from 'lucide-react';
import { storageService } from '../services/storage.ts';
import { PageHeader, buttonClass, cardClass } from '../components/PageHeader.tsx';

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
      const message = err?.message || 'Trinkhistorie konnte nicht geladen werden.';
      setError(message);
      alert(message);
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
      const month = new Date(event.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month)!.push(event);
    }
    return [...groups.entries()];
  }, [events]);

  const currentYear = new Date().getFullYear();
  const bottlesThisYear = useMemo(
    () =>
      events
        .filter((event) => new Date(event.created_at).getFullYear() === currentYear)
        .reduce((sum, event) => sum + Math.abs(event.delta || 0), 0),
    [events, currentYear]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      <PageHeader
        eyebrow="Historie"
        title="Trinkhistorie"
        description="Jede geöffnete Flasche, chronologisch."
        actions={
          <button onClick={() => load(true)} disabled={loading || refreshing} className={buttonClass.secondary}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Aktualisieren
          </button>
        }
      />

      {!loading && events.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`${cardClass} px-[22px] py-5 flex flex-col gap-1.5`}>
            <span className="text-[13px] text-stone-gray">Geöffnet {currentYear}</span>
            <span className="font-serif text-[32px] font-semibold leading-tight tabular-nums">{bottlesThisYear} Fl.</span>
          </div>
          <div className={`${cardClass} px-[22px] py-5 flex flex-col gap-1.5`}>
            <span className="text-[13px] text-stone-gray">Einträge gesamt</span>
            <span className="font-serif text-[32px] font-semibold leading-tight tabular-nums">{events.length}</span>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="bg-burgundy-tint text-burgundy-dark px-4 py-3 rounded-[10px] text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center gap-3" role="status">
          <Loader2 className="w-8 h-8 text-burgundy animate-spin" />
          <p className="text-sm text-stone-gray">Lade Trinkhistorie …</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className={`${cardClass} py-20 px-6 flex flex-col items-center gap-2 text-center border-dashed border-line-strong`}>
          <span aria-hidden="true" className="w-14 h-14 rounded-full bg-sand flex items-center justify-center text-stone-gray mb-1">
            <GlassWater className="w-6 h-6" />
          </span>
          <h2 className="text-lg font-semibold text-charcoal">Noch keine Einträge</h2>
          <p className="text-charcoal-soft text-sm">Sobald du „Flasche trinken“ nutzt, erscheinen die Flaschen hier.</p>
        </div>
      ) : (
        grouped.map(([month, monthEvents]) => (
          <section key={month} className="flex flex-col gap-2.5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-stone-gray">{month}</h2>
            <ol className={`${cardClass} overflow-hidden`}>
              {monthEvents.map((event, index) => {
                const date = new Date(event.created_at);
                return (
                  <li
                    key={event.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 ${index > 0 ? 'border-t border-line-soft' : ''}`}
                  >
                    <span className="w-14 shrink-0 text-[13px] font-semibold tabular-nums text-charcoal-soft">
                      {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </span>
                    {event.wine_id ? (
                      <Link to={`/wine/${event.wine_id}`} className="flex-1 min-w-[220px] flex flex-col hover:text-burgundy">
                        <span className="font-semibold text-charcoal">
                          {event.wines?.vintage ? `${event.wines.vintage} ` : ''}
                          {event.wines?.name || 'Unbekannter Wein'}
                        </span>
                        <span className="text-[13px] text-charcoal-soft">{event.wines?.producer || 'Produzent unbekannt'}</span>
                      </Link>
                    ) : (
                      <span className="flex-1 min-w-[220px] font-semibold">{event.wines?.name || 'Unbekannter Wein'}</span>
                    )}
                    <span className="h-[26px] px-2.5 rounded-full inline-flex items-center bg-sand text-xs font-semibold text-charcoal-soft">
                      {event.source}
                    </span>
                    <span className="min-w-[48px] text-right text-[13px] tabular-nums text-stone-gray">
                      {date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-[44px] text-right font-bold tabular-nums">{Math.abs(event.delta)} Fl.</span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
};
