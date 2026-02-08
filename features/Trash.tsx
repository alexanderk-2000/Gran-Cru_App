
import React, { useState, useEffect } from 'react';
import { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { Trash2, RotateCcw, Wine as WineIcon, ArrowLeft, Search, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Trash: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const [deletedWines, setDeletedWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchDeleted = async () => {
    setLoading(true);
    try {
      const data = await storageService.getDeletedWines();
      setDeletedWines(data);
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
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center gap-2 text-stone-gray hover:text-burgundy uppercase text-[10px] font-black tracking-widest transition-all mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück zum Keller
          </button>
          <h2 className="font-serif text-4xl font-bold text-charcoal">Papierkorb</h2>
          <p className="text-stone-gray font-medium tracking-wide">Gelöschte Weine können hier wiederhergestellt oder endgültig entfernt werden.</p>
        </div>
        <button
          onClick={handleEmptyTrash}
          disabled={deletedWines.length === 0 || isEmptyingTrash || loading}
          className="px-5 py-3 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isEmptyingTrash ? 'Leert...' : 'Papierkorb endgültig leeren'}
        </button>
      </header>

      <div className="flex-1 relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
        <input 
          type="text" placeholder="Papierkorb durchsuchen..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-burgundy/5 rounded-2xl text-sm focus:border-burgundy/20 focus:outline-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full py-24 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-burgundy animate-spin" />
            <p className="text-xs font-black uppercase text-stone-gray tracking-widest">Synchronisiere Papierkorb...</p>
          </div>
        ) : filteredWines.length > 0 ? (
          filteredWines.map(wine => (
            <div key={wine.id} className="bg-white p-8 rounded-[2.5rem] border border-burgundy/5 shadow-premium flex flex-col justify-between">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-5">
                  <div className="p-5 bg-alabaster rounded-2xl text-stone-gray/30">
                    <WineIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-serif text-2xl font-bold text-charcoal leading-tight">{wine.vintage} {wine.name}</h3>
                    <p className="text-sm text-stone-gray font-medium">{wine.producer}</p>
                    {wine.deleted_reason && (
                      <p className="mt-2 text-xs text-stone-gray italic">Grund: {wine.deleted_reason}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-alabaster">
                <p className="text-[9px] font-black text-stone-gray/50 uppercase">Gelöscht am: {new Date(wine.deleted_at!).toLocaleDateString()}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleRestore(wine.id)} disabled={processingId === wine.id || isEmptyingTrash}
                    className="p-3 bg-sage-light text-sage hover:bg-sage hover:text-white rounded-xl transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handlePermanentDelete(wine.id)} disabled={processingId === wine.id || isEmptyingTrash}
                    className="p-3 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-center bg-white rounded-[3rem] border border-dashed border-burgundy/10">
            <Trash2 className="w-20 h-20 text-burgundy/10 mb-6" />
            <h3 className="text-2xl font-serif text-charcoal mb-2">Papierkorb leer</h3>
            <p className="text-stone-gray text-sm">Keine gelöschten Datensätze gefunden.</p>
          </div>
        )}
      </div>
    </div>
  );
};
