import React, { useEffect, useMemo, useState } from 'react';
import { Occasion, OccasionInstance, Wine } from '../../types.ts';
import { storageService } from '../../services/storage.ts';
import { CalendarDays, Clock, Plus, X } from 'lucide-react';
import { useOccasionForm } from './hooks/useOccasionForm.ts';
import { useWinePool } from './hooks/useWinePool.ts';
import { OccasionFormSection } from './components/OccasionFormSection.tsx';
import { OccasionsList } from './components/OccasionsList.tsx';
import { WinePoolModal } from './components/WinePoolModal.tsx';
import { InstanceCard } from './components/InstanceCard.tsx';

export const EnjoymentPlan: React.FC = () => {
  const [instances, setInstances] = useState<OccasionInstance[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [wines, setWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [instData, wineData, occasionData] = await Promise.all([
        storageService.getOccasionInstances(),
        storageService.getWines(),
        storageService.getOccasions()
      ]);
      setInstances(instData);
      setOccasions(occasionData);
      setSelectedOccasionId((prev) => (prev && occasionData.some((occasion) => occasion.id === prev) ? prev : null));
      setWines(wineData.filter((wine) => !wine.wishlist));
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Termine konnten nicht geladen werden.';
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pool = useWinePool(wines, loadData, setError);

  const onSavedSeries = async (saved: Occasion) => {
    setSelectedOccasionId(saved.id);
    await loadData();
    await pool.openPoolStep(saved);
  };

  const form = useOccasionForm(onSavedSeries, setError);

  const handleAssignWine = async (instanceId: string, wineId: string | null) => {
    try {
      await storageService.updateInstanceWine(instanceId, wineId);
      setInstances((prev) =>
        prev.map((inst) => (inst.id === instanceId ? { ...inst, wine_id: wineId, auto_assigned: false } : inst))
      );
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Wein konnte nicht zugewiesen werden.';
      setError(message);
      alert(message);
    }
  };

  const handleStatusUpdate = async (instance: OccasionInstance, status: 'planned' | 'consumed' | 'skipped') => {
    try {
      await storageService.updateInstanceStatus(instance.id, status);
      setInstances((prev) => prev.map((row) => (row.id === instance.id ? { ...row, status } : row)));
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Status konnte nicht aktualisiert werden.';
      setError(message);
      alert(message);
    }
  };

  const handleDeleteSeries = async (occasionId: string) => {
    if (!window.confirm('Ganze Serie und alle nicht-konsumierten Instanzen löschen?')) return;
    try {
      await storageService.deleteOccasion(occasionId);
      await loadData();
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Serie konnte nicht gelöscht werden.';
      setError(message);
      alert(message);
    }
  };

  const futureInstances = useMemo(() => {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    return instances
      .filter((instance) => new Date(instance.instance_date) >= today)
      .sort((a, b) => a.instance_date.localeCompare(b.instance_date));
  }, [instances]);

  const occasionMap = useMemo(() => {
    const map = new Map<string, Occasion>();
    for (const occasion of occasions) {
      map.set(occasion.id, occasion);
    }
    return map;
  }, [occasions]);

  const sortedOccasions = useMemo(() => [...occasions].sort((a, b) => a.start_date.localeCompare(b.start_date)), [occasions]);

  const selectedOccasion = useMemo(
    () => (selectedOccasionId ? occasionMap.get(selectedOccasionId) ?? null : null),
    [selectedOccasionId, occasionMap]
  );

  const selectedOccasionInstances = useMemo(() => {
    if (!selectedOccasionId) return [];
    return futureInstances.filter((instance) => instance.occasion_id === selectedOccasionId);
  }, [futureInstances, selectedOccasionId]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-4xl font-bold text-charcoal">Anlass-Planung</h2>
          <p className="text-stone-gray font-medium tracking-wide">
            Verwalten Sie Ihre Verkostungs-Termine und weisen Sie edle Tropfen zu.
          </p>
        </div>

        <button
          onClick={() => (form.showForm ? form.setShowForm(false) : form.openCreateForm())}
          className="flex items-center gap-2 px-6 py-3 bg-burgundy hover:bg-burgundy-light text-white font-black rounded-xl transition-all shadow-premium uppercase tracking-wider text-sm"
        >
          {form.showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span>{form.showForm ? 'Abbrechen' : 'Serie planen'}</span>
        </button>
      </header>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {form.showForm && <OccasionFormSection form={form} />}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Clock className="w-12 h-12 text-burgundy animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-gray">Lade Termin-Instanzen...</p>
        </div>
      ) : (
        <div className="space-y-8 pb-40">
          <OccasionsList
            occasions={sortedOccasions}
            futureInstances={futureInstances}
            selectedOccasionId={selectedOccasionId}
            onToggleSelect={(occasionId) => setSelectedOccasionId((prev) => (prev === occasionId ? null : occasionId))}
            onOpenPool={pool.openPoolStep}
            onEditSeries={form.openEditForm}
            onDeleteSeries={handleDeleteSeries}
          />

          <section>
            {!selectedOccasion ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-burgundy/10 shadow-premium">
                <CalendarDays className="w-14 h-14 text-burgundy/20 mb-4" />
                <h3 className="text-xl font-serif text-charcoal mb-2">Wählen Sie einen Anlass</h3>
                <p className="text-stone-gray text-sm">Die Terminliste wird erst nach Klick auf eine Serie angezeigt.</p>
              </div>
            ) : selectedOccasionInstances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-burgundy/10 shadow-premium">
                <CalendarDays className="w-14 h-14 text-burgundy/20 mb-4" />
                <h3 className="text-xl font-serif text-charcoal mb-2">{selectedOccasion.title}</h3>
                <p className="text-stone-gray text-sm">Für diese Serie sind keine zukünftigen Termine vorhanden.</p>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-gray">
                  Termine für: {selectedOccasion.title}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {selectedOccasionInstances.map((instance) => (
                    <InstanceCard
                      key={instance.id}
                      instance={{ ...instance, occasion: instance.occasion || occasionMap.get(instance.occasion_id) }}
                      wines={wines.filter((wine) => wine.quantity > 0)}
                      onAssign={handleAssignWine}
                      onStatusChange={handleStatusUpdate}
                      onEditSeries={(occasion) => form.openEditForm(occasion)}
                      onDeleteSeries={handleDeleteSeries}
                      onOpenPool={(occasion) => pool.openPoolStep(occasion)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <WinePoolModal pool={pool} instances={instances} />
    </div>
  );
};
