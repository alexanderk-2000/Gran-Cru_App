import { useMemo, useState } from 'react';
import { Category, Occasion, OccasionWinePriority, Wine } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';
import { applyDeterministicAssignment } from '../../../domain/enjoymentPlan/autoAssignment.ts';

interface PoolDraftEntry {
  bottles_reserved: number;
  priority: OccasionWinePriority;
}

export const useWinePool = (wines: Wine[], onAssigned: () => Promise<void>, setError: (message: string | null) => void) => {
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [poolOccasion, setPoolOccasion] = useState<Occasion | null>(null);
  const [poolDraft, setPoolDraft] = useState<Record<string, PoolDraftEntry>>({});
  const [poolSearch, setPoolSearch] = useState('');
  const [poolCategoryFilter, setPoolCategoryFilter] = useState<Category | 'All'>('All');
  const [poolRegionFilter, setPoolRegionFilter] = useState('');
  const [poolVintageFrom, setPoolVintageFrom] = useState('');
  const [poolVintageTo, setPoolVintageTo] = useState('');
  const [poolOnlyInStock, setPoolOnlyInStock] = useState(true);
  const [poolOnlyDrinkReady, setPoolOnlyDrinkReady] = useState(false);
  const [allowUnknownMaturity, setAllowUnknownMaturity] = useState(false);
  const [preferRare, setPreferRare] = useState(false);
  const [preferDaily, setPreferDaily] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState<string | null>(null);
  const [unassignedInstanceIds, setUnassignedInstanceIds] = useState<string[]>([]);

  const openPoolStep = async (occasion: Occasion) => {
    try {
      const pool = await storageService.getOccasionWinePool(occasion.id);
      const nextDraft: Record<string, PoolDraftEntry> = {};
      for (const entry of pool) {
        nextDraft[entry.wine_id] = {
          bottles_reserved: entry.bottles_reserved,
          priority: entry.priority
        };
      }
      setPoolDraft(nextDraft);
      setPoolOccasion(occasion);
      setPoolSearch('');
      setPoolCategoryFilter('All');
      setPoolRegionFilter('');
      setPoolVintageFrom('');
      setPoolVintageTo('');
      setPoolOnlyInStock(true);
      setPoolOnlyDrinkReady(false);
      setAllowUnknownMaturity(false);
      setPreferRare(false);
      setPreferDaily(false);
      setAssignmentNotice(null);
      setUnassignedInstanceIds([]);
      setShowPoolModal(true);
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Wein-Pool konnte nicht geladen werden.';
      setError(message);
      alert(message);
    }
  };

  const poolVisibleWines = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const parsedFrom = poolVintageFrom.trim() ? Number(poolVintageFrom) : null;
    const parsedTo = poolVintageTo.trim() ? Number(poolVintageTo) : null;

    return wines.filter((wine) => {
      if (poolOnlyInStock && wine.quantity <= 0) return false;
      if (poolCategoryFilter !== 'All' && wine.category !== poolCategoryFilter) return false;
      if (poolRegionFilter.trim() && !wine.region.toLowerCase().includes(poolRegionFilter.toLowerCase())) return false;
      if (Number.isFinite(parsedFrom) && wine.vintage < Number(parsedFrom)) return false;
      if (Number.isFinite(parsedTo) && wine.vintage > Number(parsedTo)) return false;
      if (
        poolOnlyDrinkReady &&
        (!wine.drink_start || !wine.drink_end || currentYear < wine.drink_start || currentYear > wine.drink_end)
      ) {
        return false;
      }
      if (!poolSearch.trim()) return true;
      const q = poolSearch.toLowerCase();
      return (
        wine.name.toLowerCase().includes(q) ||
        (wine.producer || '').toLowerCase().includes(q) ||
        String(wine.vintage || '').includes(q)
      );
    });
  }, [wines, poolOnlyInStock, poolCategoryFilter, poolRegionFilter, poolVintageFrom, poolVintageTo, poolOnlyDrinkReady, poolSearch]);

  const selectedVisibleCount = useMemo(
    () => poolVisibleWines.reduce((count, wine) => count + (poolDraft[wine.id] ? 1 : 0), 0),
    [poolVisibleWines, poolDraft]
  );

  const allVisibleSelected = poolVisibleWines.length > 0 && selectedVisibleCount === poolVisibleWines.length;

  const handleSelectAllVisible = () => {
    setPoolDraft((prev) => {
      const next = { ...prev };
      for (const wine of poolVisibleWines) {
        const existing = next[wine.id];
        next[wine.id] = {
          bottles_reserved: existing?.bottles_reserved ?? 1,
          priority: existing?.priority ?? 'medium'
        };
      }
      return next;
    });
  };

  const handleClearVisibleSelection = () => {
    setPoolDraft((prev) => {
      const next = { ...prev };
      for (const wine of poolVisibleWines) {
        delete next[wine.id];
      }
      return next;
    });
  };

  const handleAutoAssign = async () => {
    if (!poolOccasion) return;
    const wineById = new Map(wines.map((wine) => [wine.id, wine]));
    const selected = Object.entries(poolDraft)
      .map(([wine_id, config]) => {
        const wine = wineById.get(wine_id);
        if (!wine) return null;
        const reserve = Math.max(1, Math.round(config.bottles_reserved || 1));
        return {
          wine_id,
          bottles_reserved: Math.min(reserve, Math.max(1, wine.quantity)),
          priority: config.priority
        };
      })
      .filter((entry): entry is { wine_id: string; bottles_reserved: number; priority: OccasionWinePriority } => !!entry);

    if (selected.length === 0) {
      const message = 'Bitte mindestens einen Wein im Pool auswählen.';
      setError(message);
      alert(message);
      return;
    }

    setAssigning(true);
    try {
      const savedPool = await storageService.saveOccasionWinePool(poolOccasion.id, selected);
      const instancesByOccasion = await storageService.getOccasionInstancesByOccasion(poolOccasion.id);

      const plannedInstances = instancesByOccasion.filter((instance) => instance.status === 'planned');
      const lockedInstances = plannedInstances.filter((instance) => instance.wine_id && instance.auto_assigned === false);

      const combinedPool = savedPool.map((entry) => ({
        ...entry,
        wine: entry.wine || wines.find((wine) => wine.id === entry.wine_id)
      }));

      const deterministic = applyDeterministicAssignment(wines, [...plannedInstances], combinedPool, {
        allowUnknown: allowUnknownMaturity,
        preferRare,
        preferDaily
      });

      const finalAssignments = deterministic.selected;

      await storageService.clearAutoAssignmentsForOccasion(poolOccasion.id);
      await storageService.applyAutoAssignments(
        finalAssignments.map((item) => ({
          instanceId: item.instanceId,
          wineId: item.wineId,
          score: item.score,
          reason: item.reason
        }))
      );

      await onAssigned();

      const assignedSet = new Set(finalAssignments.map((item) => item.instanceId));
      const openInstanceCount = plannedInstances.filter((instance) => !lockedInstances.some((locked) => locked.id === instance.id)).length;
      const unassignedCount = Math.max(0, openInstanceCount - finalAssignments.length);
      const unassignedIds = plannedInstances
        .filter((instance) => !lockedInstances.some((locked) => locked.id === instance.id))
        .filter((instance) => !assignedSet.has(instance.id))
        .map((instance) => instance.id);

      setAssignmentNotice(`Auto-Zuordnung abgeschlossen: ${finalAssignments.length} zugeordnet, ${unassignedCount} offen.`);
      setUnassignedInstanceIds(unassignedIds);
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Automatische Zuordnung fehlgeschlagen.';
      setError(message);
      alert(message);
    } finally {
      setAssigning(false);
    }
  };

  return {
    showPoolModal,
    setShowPoolModal,
    poolOccasion,
    poolDraft,
    setPoolDraft,
    poolSearch,
    setPoolSearch,
    poolCategoryFilter,
    setPoolCategoryFilter,
    poolRegionFilter,
    setPoolRegionFilter,
    poolVintageFrom,
    setPoolVintageFrom,
    poolVintageTo,
    setPoolVintageTo,
    poolOnlyInStock,
    setPoolOnlyInStock,
    poolOnlyDrinkReady,
    setPoolOnlyDrinkReady,
    allowUnknownMaturity,
    setAllowUnknownMaturity,
    preferRare,
    setPreferRare,
    preferDaily,
    setPreferDaily,
    assigning,
    assignmentNotice,
    unassignedInstanceIds,
    openPoolStep,
    poolVisibleWines,
    selectedVisibleCount,
    allVisibleSelected,
    handleSelectAllVisible,
    handleClearVisibleSelection,
    handleAutoAssign
  };
};

export type UseWinePoolResult = ReturnType<typeof useWinePool>;
