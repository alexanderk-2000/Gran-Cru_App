import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, GlassWater, Loader2, RefreshCw } from 'lucide-react';
import { storageService } from '../services/storage.ts';
import type { Tasting } from '../types.ts';

/**
 * The cellar log: everything that happened to the collection.
 *
 * This screen used to show consumption only - purchases, losses, stocktake
 * corrections and transfers were all recorded as events and visible nowhere,
 * and tasting notes could not even be created. It also leaked internals into
 * the UI ("Alle konsumierten Flaschen aus inventory_events", "Quelle: detail").
 */
interface InventoryEvent {
  id: string;
  wine_id: string;
  type: string;
  delta: number;
  source: string;
  note?: string | null;
  created_at: string;
  wines: { name: string; producer?: string; vintage?: number } | null;
}

type EntryKind = 'consume' | 'purchase' | 'adjustment' | 'loss' | 'transfer' | 'note' | 'other';

interface LogEntry {
  id: string;
  kind: EntryKind;
  wineId: string;
  wineLabel: string;
  producer?: string;
  at: string;
  delta?: number;
  note?: string | null;
  rating?: number;
}

const KIND_LABELS: Record<EntryKind, string> = {
  consume: 'Getrunken',
  purchase: 'Zugang',
  adjustment: 'Korrektur',
  loss: 'Verlust',
  transfer: 'Umgelagert',
  note: 'Notiz',
  other: 'Ereignis'
};

const KIND_TONES: Record<EntryKind, string> = {
  consume: 'bg-sage-light text-sage border-sage/40',
  purchase: 'bg-alabaster text-burgundy border-burgundy/25',
  adjustment: 'bg-amber-50 text-amber-700 border-amber-200',
  loss: 'bg-red-50 text-red-700 border-red-200',
  transfer: 'bg-stone-100 text-stone-600 border-stone-300',
  note: 'bg-gold/10 text-gold-dim border-gold/30',
  other: 'bg-stone-100 text-stone-600 border-stone-300'
};

const FILTERS: Array<{ id: 'all' | EntryKind; label: string }> = [
  { id: 'all', label: 'Alles' },
  { id: 'consume', label: 'Getrunken' },
  { id: 'note', label: 'Notizen' },
  { id: 'purchase', label: 'Zugänge' },
  { id: 'adjustment', label: 'Korrekturen' },
  { id: 'loss', label: 'Verluste' }
];

const toKind = (type: string): EntryKind => {
  if (type === 'consume' || type === 'purchase' || type === 'adjustment' || type === 'loss' || type === 'transfer') {
    return type;
  }
  return 'other';
};

export const DrinkHistory: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | EntryKind>('all');

  const load = async (isRefresh: boolean = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Tastings come from one query for all wines (the cursor variant with a
      // null cursor), not one query per wine.
      const [events, tastings] = await Promise.all([
        storageService.getInventoryEvents() as Promise<InventoryEvent[]>,
        storageService.getTastingsCreatedSince(null).catch(() => [] as Tasting[])
      ]);

      const wineNames = new Map<string, { label: string; producer?: string }>();
      for (const event of events) {
        if (event.wines?.name) {
          wineNames.set(event.wine_id, {
            label: `${event.wines.vintage ? `${event.wines.vintage} ` : ''}${event.wines.name}`,
            producer: event.wines.producer
          });
        }
      }

      const eventEntries: LogEntry[] = events.map((event) => ({
        id: `event-${event.id}`,
        kind: toKind(event.type),
        wineId: event.wine_id,
        wineLabel: wineNames.get(event.wine_id)?.label || 'Unbekannter Wein',
        producer: wineNames.get(event.wine_id)?.producer,
        at: event.created_at,
        delta: event.delta,
        note: event.note
      }));

      const noteEntries: LogEntry[] = tastings.map((tasting) => ({
        id: `tasting-${tasting.id}`,
        kind: 'note',
        wineId: tasting.wine_id,
        wineLabel: wineNames.get(tasting.wine_id)?.label || 'Unbekannter Wein',
        producer: wineNames.get(tasting.wine_id)?.producer,
        at: tasting.date || tasting.created_at || new Date().toISOString(),
        note: tasting.note,
        rating: tasting.rating
      }));

      setEntries(
        [...eventEntries, ...noteEntries].sort((a, b) => b.at.localeCompare(a.at))
      );
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Kellerbuch konnte nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter)),
    [entries, filter]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, LogEntry[]>();
    for (const entry of filtered) {
      const day = new Date(entry.at).toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(entry);
    }
    return [...groups.entries()];
  }, [filtered]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) map.set(entry.kind, (map.get(entry.kind) || 0) + 1);
    return map;
  }, [entries]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-stone-gray hover:text-burgundy uppercase text-[11px] font-black tracking-widest transition-all mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück
          </button>
          <h2 className="font-serif text-4xl font-bold text-charcoal">Kellerbuch</h2>
          <p className="text-stone-gray font-medium tracking-wide">
            Geöffnete Flaschen, Notizen, Zugänge und Korrekturen – nach Tagen.
          </p>
        </div>

        <button
          onClick={() => void load(true)}
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

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const count = option.id === 'all' ? entries.length : counts.get(option.id) || 0;
            if (option.id !== 'all' && count === 0) return null;
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] transition-all ${
                  active
                    ? 'border-burgundy/40 bg-burgundy/10 text-burgundy'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-burgundy/20'
                }`}
              >
                {option.label} · {count}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-burgundy animate-spin" />
          <p className="text-xs font-black uppercase text-stone-gray tracking-widest">Lade Kellerbuch ...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-24 bg-white rounded-[2.5rem] border border-burgundy/5 text-center">
          <GlassWater className="w-14 h-14 text-burgundy/20 mx-auto mb-4" />
          <h3 className="font-serif text-2xl text-charcoal mb-2">
            {entries.length === 0 ? 'Noch keine Einträge' : 'Nichts in dieser Auswahl'}
          </h3>
          <p className="text-stone-gray text-sm">
            {entries.length === 0
              ? 'Sobald du eine Flasche öffnest, nachkaufst oder eine Notiz schreibst, erscheint sie hier.'
              : 'Wähle einen anderen Filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, dayEntries]) => (
            <section key={day} className="bg-white rounded-[2rem] border border-burgundy/5 shadow-premium overflow-hidden">
              <div className="px-6 py-4 border-b border-alabaster bg-alabaster/40">
                <p className="text-[11px] font-black uppercase tracking-widest text-stone-gray">{day}</p>
              </div>

              <div className="divide-y divide-alabaster">
                {dayEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/wine/${entry.wineId}`}
                    className="block px-6 py-4 transition-colors hover:bg-alabaster/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${KIND_TONES[entry.kind]}`}
                          >
                            {KIND_LABELS[entry.kind]}
                          </span>
                          {typeof entry.rating === 'number' && entry.rating > 0 && (
                            <span className="text-xs text-gold-dim">{'★'.repeat(entry.rating)}</span>
                          )}
                        </div>
                        <p className="font-serif text-xl text-charcoal">{entry.wineLabel}</p>
                        <p className="text-sm text-stone-gray">{entry.producer || 'Produzent unbekannt'}</p>
                        {entry.note && entry.kind === 'note' && (
                          <p className="mt-1 font-serif text-sm leading-relaxed text-stone-700">„{entry.note}“</p>
                        )}
                        {entry.note && entry.kind !== 'note' && (
                          <p className="mt-1 text-xs text-stone-500">{entry.note}</p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        {typeof entry.delta === 'number' && entry.delta !== 0 && (
                          <p className={`text-sm font-black ${entry.delta > 0 ? 'text-sage' : 'text-burgundy'}`}>
                            {entry.delta > 0 ? `+${entry.delta}` : entry.delta} Fl.
                          </p>
                        )}
                        <p className="text-xs text-stone-gray">
                          {new Date(entry.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
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
