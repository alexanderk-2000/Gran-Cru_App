
import React, { useState, useEffect } from 'react';
import { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { Trash2, RotateCcw, Search, Loader2 } from 'lucide-react';
import { PageHeader, cardClass } from '../components/PageHeader.tsx';
import { TRASH_RETENTION_DAYS, getDaysRemaining, isExpired } from '../domain/wine/trashRetention.ts';

export const Trash: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const [deletedWines, setDeletedWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoPurgedCount, setAutoPurgedCount] = useState(0);

  const fetchDeleted = async () => {
    setLoading(true);
    try {
      const data = await storageService.getDeletedWines();

      // Enforce the retention period: anything past its expiry gets purged
      // for good, traceably (permanentlyDeleteWine's own event trail records
      // when a wine was soft-deleted before this happens).
      const expired = data.filter((wine) => wine.deleted_at && isExpired(wine.deleted_at));
      const active = data.filter((wine) => !wine.deleted_at || !isExpired(wine.deleted_at));

      if (expired.length > 0) {
        await Promise.all(expired.map((wine) => storageService.permanentlyDeleteWine(wine.id).catch(() => {})));
        setAutoPurgedCount(expired.length);
      }

      setDeletedWines(active);
      setError(null);
    } catch (err) {
      console.error(err);
      const message = (err as Error)?.message || 'Papierkorb konnte nicht geladen werden.';
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeleted();
  }, []);

  const handleRestore = async (id: string) => {
    setProcessingId(id);
    try {
      await storageService.restoreWine(id);
      await fetchDeleted();
      onUpdate();
    } catch (err) {
      const message = (err as Error)?.message || "Wiederherstellung fehlgeschlagen.";
      setError(message);
      alert(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm("Diese Aktion löscht den Wein unwiderruflich aus der Datenbank. Fortfahren?")) return;
    setProcessingId(id);
    try {
      await storageService.permanentlyDeleteWine(id);
      await fetchDeleted();
    } catch (err) {
      const message = (err as Error)?.message || "Löschen fehlgeschlagen.";
      setError(message);
      alert(message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (deletedWines.length === 0 || isEmptyingTrash) return;
    if (!window.confirm(`Papierkorb endgültig leeren? (${deletedWines.length} Weine werden dauerhaft gelöscht)`)) return;

    setIsEmptyingTrash(true);
    try {
      await storageService.emptyTrash();
      await fetchDeleted();
      onUpdate();
    } catch (err) {
      const message = (err as Error)?.message || 'Papierkorb konnte nicht geleert werden.';
      setError(message);
      alert(message);
    } finally {
      setIsEmptyingTrash(false);
    }
  };

  const filteredWines = deletedWines.filter(w => 
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.producer?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 max-w-[880px]">
      <PageHeader
        eyebrow="Keller"
        title="Papierkorb"
        description={`Gelöschte Weine wiederherstellen oder endgültig entfernen. Einträge werden nach ${TRASH_RETENTION_DAYS} Tagen automatisch gelöscht.`}
        actions={
          <button
            onClick={handleEmptyTrash}
            disabled={deletedWines.length === 0 || isEmptyingTrash || loading}
            className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] border border-burgundy bg-white text-burgundy font-semibold text-sm hover:bg-burgundy-tint transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEmptyingTrash ? 'Leert …' : 'Papierkorb leeren'}
          </button>
        }
      />

      {deletedWines.length > 3 && (
        <label className="relative block max-w-md">
          <span className="sr-only">Papierkorb durchsuchen</span>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
          <input
            type="text" placeholder="Papierkorb durchsuchen..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-line-strong rounded-[10px] text-sm focus:border-burgundy focus:ring-2 focus:ring-burgundy/15 focus:outline-none"
          />
        </label>
      )}

      {error && (
        <div role="alert" className="bg-burgundy-tint text-burgundy-dark px-4 py-3 rounded-[10px] text-sm">
          {error}
        </div>
      )}

      {autoPurgedCount > 0 && (
        <div role="status" className="bg-white border border-line text-charcoal-soft px-4 py-3 rounded-[10px] text-sm">
          {autoPurgedCount} Eintrag/Einträge wurden nach Ablauf der {TRASH_RETENTION_DAYS}-tägigen Aufbewahrungsfrist endgültig gelöscht.
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center gap-3" role="status">
          <Loader2 className="w-8 h-8 text-burgundy animate-spin" />
          <p className="text-sm text-stone-gray">Synchronisiere Papierkorb …</p>
        </div>
      ) : filteredWines.length > 0 ? (
        <ul className={`${cardClass} overflow-hidden`}>
          {filteredWines.map((wine, index) => {
            const busy = processingId === wine.id || isEmptyingTrash;
            const daysLeft = wine.deleted_at ? Math.max(0, getDaysRemaining(wine.deleted_at)) : null;
            return (
              <li
                key={wine.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 ${index > 0 ? 'border-t border-line-soft' : ''}`}
              >
                <span className="flex-1 min-w-[240px] flex flex-col">
                  <span className="font-semibold text-charcoal">{wine.vintage} {wine.name}</span>
                  <span className="text-[13px] text-stone-gray">
                    {[wine.producer, wine.deleted_at ? `gelöscht am ${new Date(wine.deleted_at).toLocaleDateString('de-DE')}` : null, wine.deleted_reason ? `Grund: ${wine.deleted_reason}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {daysLeft !== null && (
                  <span className={`h-[26px] px-2.5 rounded-full inline-flex items-center text-xs font-semibold ${daysLeft <= 3 ? 'bg-burgundy-tint text-burgundy' : 'bg-sand text-charcoal-soft'}`}>
                    noch {daysLeft} {daysLeft === 1 ? 'Tag' : 'Tage'}
                  </span>
                )}
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(wine.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-line-strong bg-white text-[13px] font-semibold text-charcoal hover:bg-alabaster disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" /> Wiederherstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePermanentDelete(wine.id)}
                    disabled={busy}
                    aria-label={`${wine.name} endgültig löschen`}
                    className="inline-flex items-center h-10 px-3.5 rounded-lg text-[13px] font-semibold text-burgundy hover:bg-burgundy-tint disabled:opacity-50"
                  >
                    Endgültig löschen
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={`${cardClass} border-dashed border-line-strong py-16 px-6 flex flex-col items-center gap-2 text-center`}>
          <span aria-hidden="true" className="w-14 h-14 rounded-full bg-sand flex items-center justify-center text-stone-gray mb-1">
            <Trash2 className="w-6 h-6" />
          </span>
          <h2 className="text-lg font-semibold text-charcoal">Papierkorb leer</h2>
          <p className="text-charcoal-soft text-sm">Keine gelöschten Weine vorhanden.</p>
        </div>
      )}
    </div>
  );
};
