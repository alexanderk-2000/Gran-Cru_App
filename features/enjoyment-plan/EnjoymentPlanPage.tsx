import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Category,
  Occasion,
  OccasionInstance,
  OccasionWinePoolEntry,
  OccasionWinePriority,
  RepeatRule,
  Wine
} from '../../types.ts';
import { storageService } from '../../services/storage.ts';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Wand2,
  Wine as WineIcon,
  X
} from 'lucide-react';
import { evaluateWineDrinkability } from '../../utils.ts';
import { useToast, useConfirm } from '../../components/Feedback.tsx';

const REPEAT_RULE_LABEL: Record<RepeatRule, string> = {
  none: 'Einmalig',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich'
};

interface PoolDraftEntry {
  bottles_reserved: number;
  priority: OccasionWinePriority;
}

interface AssignmentEdge {
  instanceId: string;
  wineId: string;
  baseScore: number;
  totalScore: number;
  maturityFit: number;
  diversityDelta: number;
  fallback: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const yearOf = (dateIso: string): number => new Date(dateIso).getFullYear();
const stableNoise = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const mapWineTypeForDrinkability = (wineType: Wine['wine_type']): 'red' | 'white' | 'sparkling' | 'rose' | null => {
  if (wineType === 'Rot') return 'red';
  if (wineType === 'Weiß') return 'white';
  if (wineType === 'Schaumwein') return 'sparkling';
  if (wineType === 'Rosé') return 'rose';
  return null;
};

const maturityFit = (instanceDate: string, wine: Wine, allowUnknown: boolean): number => {
  const year = yearOf(instanceDate);
  const start = wine.drink_start;
  const end = wine.drink_end;

  if (!start || !end) {
    return allowUnknown ? 0.35 : -1;
  }
  const drinkability = evaluateWineDrinkability({
    today_year: year,
    wine: {
      vintage: typeof wine.vintage === 'number' ? wine.vintage : null,
      drink_start: typeof wine.drink_start === 'number' ? wine.drink_start : null,
      peak_year: typeof wine.peak_year === 'number' ? wine.peak_year : null,
      drink_end: typeof wine.drink_end === 'number' ? wine.drink_end : null,
      wine_type: mapWineTypeForDrinkability(wine.wine_type),
      structure: {
        acidity: typeof wine.structure?.acidity === 'number' ? wine.structure.acidity : null,
        tannin: typeof wine.structure?.tannin === 'number' ? wine.structure.tannin : null,
        body: typeof wine.structure?.body === 'number' ? wine.structure.body : null,
        sweetness: typeof wine.structure?.sweetness === 'number' ? wine.structure.sweetness : null,
        oak: typeof wine.structure?.oak === 'number' ? wine.structure.oak : null
      }
    }
  });

  if (drinkability.status === 'unknown') {
    return allowUnknown ? 0.35 : -1;
  }

  let fit = clamp(drinkability.drinkability_index / 100, 0, 1);

  // Außerhalb des Fensters wird stark gedämpft, aber nicht sofort blockiert.
  // So werden späte Instanzen nur dann noch befüllt, wenn keine besseren Optionen existieren.
  if (year < start) {
    const yearsEarly = start - year;
    if (yearsEarly > 8) return -1;
    fit *= Math.max(0.05, 1 - 0.18 * yearsEarly);
    fit *= 0.75;
  } else if (year > end) {
    const yearsLate = year - end;
    if (yearsLate > 8) return -1;
    fit *= Math.max(0.05, 1 - 0.14 * yearsLate);
    fit *= 0.80;
  }

  if (drinkability.status === 'too_early') fit *= 0.75;
  if (drinkability.status === 'past_peak') fit *= 0.80;
  return fit;
};

const priorityBonus = (priority: OccasionWinePriority): number => {
  if (priority === 'high') return 0.08;
  if (priority === 'medium') return 0.03;
  return 0;
};

const categoryBonus = (wine: Wine, preferRare: boolean, preferDaily: boolean): number => {
  let bonus = 0;
  if (preferRare && wine.category === 'Rarität') bonus += 0.05;
  if (preferDaily && wine.category === 'Daily Drinker') bonus += 0.05;
  return bonus;
};

const byScoreDesc = (a: AssignmentEdge, b: AssignmentEdge) => b.totalScore - a.totalScore;

export const EnjoymentPlan: React.FC = () => {
  const showToast = useToast();
  const confirm = useConfirm();
  const [instances, setInstances] = useState<OccasionInstance[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [wines, setWines] = useState<Wine[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingOccasionId, setEditingOccasionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [drinkAnchorDate, setDrinkAnchorDate] = useState('');
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('none');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [maxOccurrences, setMaxOccurrences] = useState('');
  const [selectedOccasionId, setSelectedOccasionId] = useState<string | null>(null);

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

  // Wrapped in useCallback (and listed as the effect's dependency) because it
  // now closes over showToast - a context value the linter can't statically
  // prove is stable, so leaving it a plain function made the mount effect
  // below fail exhaustive-deps.
  const loadData = useCallback(async () => {
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
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setEditingOccasionId(null);
    setTitle('');
    setStartDate('');
    setEndDate('');
    setDrinkAnchorDate('');
    setRepeatRule('none');
    setRepeatInterval(1);
    setMaxOccurrences('');
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (occasion: Occasion) => {
    setEditingOccasionId(occasion.id);
    setTitle(occasion.title || '');
    setStartDate(occasion.start_date || '');
    setEndDate(occasion.end_date || '');
    setDrinkAnchorDate(occasion.drink_anchor_date || occasion.start_date || '');
    setRepeatRule(occasion.repeat_rule || 'none');
    setRepeatInterval(Math.max(1, occasion.repeat_interval || 1));
    setMaxOccurrences(occasion.max_occurrences ? String(occasion.max_occurrences) : '');
    setSelectedOccasionId(occasion.id);
    setShowForm(true);
  };

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
      setSelectedOccasionId(occasion.id);
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
      showToast(message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !startDate || !endDate) {
      const message = 'Titel, Startdatum und Enddatum sind erforderlich.';
      setError(message);
      showToast(message, 'error');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      const message = 'Startdatum darf nicht nach Enddatum liegen.';
      setError(message);
      showToast(message, 'error');
      return;
    }

    if (!Number.isFinite(repeatInterval) || repeatInterval < 1) {
      const message = 'Intervall muss mindestens 1 sein.';
      setError(message);
      showToast(message, 'error');
      return;
    }

    const maxCountParsed = maxOccurrences.trim() ? Number(maxOccurrences) : null;
    if (maxCountParsed !== null && (!Number.isFinite(maxCountParsed) || maxCountParsed < 1)) {
      const message = 'Max. Wiederholungen muss größer als 0 sein.';
      setError(message);
      showToast(message, 'error');
      return;
    }

    try {
      const saved = await storageService.saveOccasion({
        id: editingOccasionId ?? undefined,
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        drink_anchor_date: drinkAnchorDate || startDate,
        repeat_rule: repeatRule,
        repeat_interval: repeatInterval,
        repeat_weekdays: null,
        max_occurrences: maxCountParsed
      });
      setSelectedOccasionId(saved.id);
      setShowForm(false);
      resetForm();
      await loadData();
      await openPoolStep(saved);
    } catch (err: any) {
      const message = err?.message || 'Fehler beim Planen der Serie.';
      setError(message);
      showToast(message, 'error');
    }
  };

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
      showToast(message, 'error');
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
      showToast(message, 'error');
    }
  };

  const handleDeleteSeries = async (occasionId: string) => {
    const confirmed = await confirm({
      title: 'Serie löschen?',
      description: 'Die ganze Serie und alle nicht-konsumierten Instanzen werden entfernt.',
      confirmLabel: 'Löschen',
      destructive: true
    });
    if (!confirmed) return;
    try {
      await storageService.deleteOccasion(occasionId);
      await loadData();
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Serie konnte nicht gelöscht werden.';
      setError(message);
      showToast(message, 'error');
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
  }, [
    wines,
    poolOnlyInStock,
    poolCategoryFilter,
    poolRegionFilter,
    poolVintageFrom,
    poolVintageTo,
    poolOnlyDrinkReady,
    poolSearch
  ]);

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

  const applyDeterministicAssignment = (
    fillableInstances: OccasionInstance[],
    poolRows: OccasionWinePoolEntry[],
    options: { allowUnknown: boolean; preferRare: boolean; preferDaily: boolean }
  ) => {
    const wineById = new Map(wines.map((wine) => [wine.id, wine]));
    const usageLimit = new Map<string, number>();
    const lockedUsageCount = new Map<string, number>();

    for (const row of poolRows) {
      const wine = row.wine || wineById.get(row.wine_id);
      if (!wine) continue;
      const limit = Math.min(row.bottles_reserved, Math.max(0, wine.quantity));
      usageLimit.set(row.wine_id, limit);
      lockedUsageCount.set(row.wine_id, 0);
    }

    const locked = fillableInstances.filter((instance) => instance.wine_id && instance.auto_assigned === false);
    for (const instance of locked) {
      const wineId = instance.wine_id as string;
      if (!usageLimit.has(wineId)) continue;
      lockedUsageCount.set(wineId, (lockedUsageCount.get(wineId) || 0) + 1);
    }

    const usageCount = new Map(lockedUsageCount);
    const openInstances = fillableInstances
      .filter((instance) => !instance.wine_id || instance.auto_assigned === true)
      .sort((a, b) => a.instance_date.localeCompare(b.instance_date));
    const history = fillableInstances
      .filter((instance) => instance.wine_id && instance.auto_assigned === false)
      .map((instance) => {
        const wine = wineById.get(instance.wine_id as string);
        return {
          date: instance.instance_date,
          wineId: instance.wine_id as string,
          category: wine?.category || null,
          region: (wine?.region || '').toLowerCase(),
          producer: (wine?.producer || '').toLowerCase()
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const allEdges: AssignmentEdge[] = [];
    const selected: Array<{ instanceId: string; wineId: string; score: number; reason: string }> = [];

    for (const instance of openInstances) {
      const recentHistory = [...history].reverse().slice(0, 3);
      const strictCandidates: AssignmentEdge[] = [];
      const fallbackCandidates: AssignmentEdge[] = [];

      for (const row of poolRows) {
        const wine = row.wine || wineById.get(row.wine_id);
        if (!wine) continue;

        const limit = usageLimit.get(row.wine_id) ?? 0;
        const used = usageCount.get(row.wine_id) ?? 0;
        if (used >= limit) continue;

        const fit = maturityFit(instance.instance_date, wine, options.allowUnknown);
        if (fit < 0.05) continue;

        const baseScore = fit + priorityBonus(row.priority) + categoryBonus(wine, options.preferRare, options.preferDaily);

        const sameWinePenalty = recentHistory.reduce((sum, entry, idx) => {
          if (entry.wineId !== row.wine_id) return sum;
          if (idx === 0) return sum + 0.24;
          if (idx === 1) return sum + 0.14;
          return sum + 0.08;
        }, 0);

        const regionKey = (wine.region || '').toLowerCase();
        const producerKey = (wine.producer || '').toLowerCase();

        const regionPenalty = recentHistory.reduce((sum, entry, idx) => {
          if (!regionKey || entry.region !== regionKey) return sum;
          return sum + (idx === 0 ? 0.06 : 0.03);
        }, 0);

        const categoryPenalty = recentHistory.reduce((sum, entry, idx) => {
          if (!wine.category || !entry.category || entry.category !== wine.category) return sum;
          return sum + (idx === 0 ? 0.06 : 0.03);
        }, 0);

        const producerPenalty = recentHistory[0]?.producer && producerKey && recentHistory[0].producer === producerKey ? 0.05 : 0;

        const usagePressure = limit > 0 ? used / limit : 1;
        const underusedBonus = (1 - usagePressure) * 0.08;
        const jitter = (stableNoise(`${instance.id}:${row.wine_id}`) - 0.5) * 0.02;
        const diversityDelta =
          underusedBonus +
          jitter -
          sameWinePenalty -
          regionPenalty -
          categoryPenalty -
          producerPenalty;

        const edge: AssignmentEdge = {
          instanceId: instance.id,
          wineId: row.wine_id,
          baseScore,
          totalScore: baseScore + diversityDelta,
          maturityFit: fit,
          diversityDelta,
          fallback: fit < 0.15
        };

        if (edge.fallback) fallbackCandidates.push(edge);
        else strictCandidates.push(edge);
      }

      const candidatePool = strictCandidates.length > 0 ? strictCandidates : fallbackCandidates;
      if (candidatePool.length === 0) continue;
      candidatePool.sort(byScoreDesc);
      const edge = candidatePool[0];
      allEdges.push(...candidatePool);

      usageCount.set(edge.wineId, (usageCount.get(edge.wineId) || 0) + 1);
      const assignedWine = wineById.get(edge.wineId);
      history.push({
        date: instance.instance_date,
        wineId: edge.wineId,
        category: assignedWine?.category || null,
        region: (assignedWine?.region || '').toLowerCase(),
        producer: (assignedWine?.producer || '').toLowerCase()
      });

      selected.push({
        instanceId: edge.instanceId,
        wineId: edge.wineId,
        score: Number(edge.totalScore.toFixed(3)),
        reason: `${edge.fallback ? 'Fallback' : 'Smart'}-Matching (Fit ${edge.maturityFit.toFixed(2)} · Variation ${edge.diversityDelta >= 0 ? '+' : ''}${edge.diversityDelta.toFixed(2)})`
      });
    }

    return {
      selected,
      openInstances,
      edges: allEdges
    };
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
      showToast(message, 'error');
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

      const deterministic = applyDeterministicAssignment(
        [...plannedInstances],
        combinedPool,
        {
          allowUnknown: allowUnknownMaturity,
          preferRare,
          preferDaily
        }
      );

      const finalAssignments = deterministic.selected;

      await storageService.clearAutoAssignmentsForOccasion(poolOccasion.id);
      await storageService.applyAutoAssignments(finalAssignments.map((item) => ({
        instanceId: item.instanceId,
        wineId: item.wineId,
        score: item.score,
        reason: item.reason
      })));

      await loadData();

      const assignedSet = new Set(finalAssignments.map((item) => item.instanceId));
      const openInstanceCount = plannedInstances.filter((instance) => !lockedInstances.some((locked) => locked.id === instance.id)).length;
      const unassignedCount = Math.max(0, openInstanceCount - finalAssignments.length);
      const unassignedIds = plannedInstances
        .filter((instance) => !lockedInstances.some((locked) => locked.id === instance.id))
        .filter((instance) => !assignedSet.has(instance.id))
        .map((instance) => instance.id);

      setAssignmentNotice(
        `Auto-Zuordnung abgeschlossen: ${finalAssignments.length} zugeordnet, ${unassignedCount} offen.`
      );
      setUnassignedInstanceIds(unassignedIds);
      setError(null);
    } catch (err: any) {
      const message = err?.message || 'Automatische Zuordnung fehlgeschlagen.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setAssigning(false);
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

  const sortedOccasions = useMemo(
    () => [...occasions].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [occasions]
  );

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
          onClick={() => (showForm ? setShowForm(false) : openCreateForm())}
          className="flex items-center gap-2 px-6 py-3 bg-burgundy hover:bg-burgundy-light text-white font-black rounded-xl transition-all shadow-premium uppercase tracking-wider text-sm"
        >
          {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span>{showForm ? 'Abbrechen' : 'Serie planen'}</span>
        </button>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <section className="bg-white border border-burgundy/10 p-10 rounded-[2.5rem] shadow-premium animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3 mb-10">
            <Sparkles className="text-gold w-6 h-6" />
            <h3 className="font-serif text-3xl font-bold text-charcoal">Event-Serie konfigurieren</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Titel der Serie</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Monatliche Raritätenprobe"
                className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-medium"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Startdatum</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartDate(nextStart);
                    setDrinkAnchorDate((prev) => (prev ? prev : nextStart));
                  }}
                  className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Enddatum</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl" required />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Immer trinken am (optional)</label>
              <input
                type="date"
                value={drinkAnchorDate}
                onChange={(e) => setDrinkAnchorDate(e.target.value)}
                className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl"
              />
              <p className="text-[11px] text-stone-gray ml-2">
                Steuert den wiederkehrenden Trinktag bei monatlicher/jährlicher Wiederholung.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Wiederholung</label>
                <select value={repeatRule} onChange={(e) => setRepeatRule(e.target.value as RepeatRule)} className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold">
                  <option value="none">Keine (Einmalig)</option>
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                  <option value="monthly">Monatlich</option>
                  <option value="yearly">Jährlich</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Intervall (Jede X-te Einheit)</label>
                <input type="number" min="1" value={repeatInterval} onChange={(e) => setRepeatInterval(Math.max(1, Number(e.target.value || 1)))} className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-stone-gray ml-2">Max. Wiederholungen (optional)</label>
              <input
                type="number"
                min="1"
                value={maxOccurrences}
                onChange={(e) => setMaxOccurrences(e.target.value)}
                placeholder="leer = bis Enddatum"
                className="w-full px-6 py-4 bg-alabaster border border-burgundy/5 rounded-2xl font-bold"
              />
            </div>

            <button type="submit" className="w-full py-5 bg-gold text-white font-black rounded-2xl shadow-xl hover:bg-gold-bright transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs">
              <span>{editingOccasionId ? 'Termine aktualisieren' : 'Termine erstellen'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </section>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Clock className="w-12 h-12 text-burgundy animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-gray">Lade Termin-Instanzen...</p>
        </div>
      ) : (
        <div className="space-y-8 pb-40">
          <section className="bg-white border border-burgundy/10 rounded-[2.5rem] shadow-premium p-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h3 className="font-serif text-2xl font-bold text-charcoal">Anlässe</h3>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-gray">
                {sortedOccasions.length} Serien
              </p>
            </div>

            {sortedOccasions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-alabaster rounded-2xl border border-burgundy/10">
                <CalendarDays className="w-12 h-12 text-burgundy/20 mb-4" />
                <p className="text-sm text-stone-gray">Noch keine Serien vorhanden.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedOccasions.map((occasion) => {
                  const isActive = selectedOccasionId === occasion.id;
                  const count = futureInstances.filter((instance) => instance.occasion_id === occasion.id).length;
                  return (
                    <div
                      key={occasion.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        isActive
                          ? 'border-burgundy/30 bg-burgundy/5 shadow-[0_8px_20px_rgba(91,30,45,0.08)]'
                          : 'border-burgundy/10 bg-white hover:border-burgundy/20'
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
                            onClick={() => setSelectedOccasionId((prev) => (prev === occasion.id ? null : occasion.id))}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                              isActive
                                ? 'bg-burgundy text-white'
                                : 'bg-white border border-burgundy/20 text-burgundy hover:bg-burgundy/5'
                            }`}
                          >
                            {isActive ? 'Ausblenden' : 'Termine anzeigen'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openPoolStep(occasion)}
                            className="p-2 text-stone-gray/70 hover:text-burgundy transition-colors"
                            title="Wein-Pool"
                          >
                            <Wand2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(occasion)}
                            className="p-2 text-stone-gray/70 hover:text-burgundy transition-colors"
                            title="Serie bearbeiten"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSeries(occasion.id)}
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
                      onEditSeries={(occasion) => openEditForm(occasion)}
                      onDeleteSeries={handleDeleteSeries}
                      onOpenPool={(occasion) => openPoolStep(occasion)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {showPoolModal && poolOccasion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-burgundy/5 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-8 border-b border-alabaster flex justify-between items-center bg-alabaster/30">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-stone-gray font-black">Wein-Pool</p>
                <h3 className="font-serif text-2xl font-bold text-charcoal">{poolOccasion.title}</h3>
              </div>
              <button onClick={() => setShowPoolModal(false)} className="p-2"><X /></button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Suche Wein"
                  className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
                />
                <select
                  value={poolCategoryFilter}
                  onChange={(e) => setPoolCategoryFilter(e.target.value as Category | 'All')}
                  className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
                >
                  <option value="All">Alle Kategorien</option>
                  <option value="Genuss">Genuss</option>
                  <option value="Investment">Investment</option>
                  <option value="Rarität">Rarität</option>
                  <option value="Daily Drinker">Daily Drinker</option>
                </select>
                <input
                  type="text"
                  value={poolRegionFilter}
                  onChange={(e) => setPoolRegionFilter(e.target.value)}
                  placeholder="Region"
                  className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
                />
                <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
                  <input type="checkbox" checked={poolOnlyInStock} onChange={(e) => setPoolOnlyInStock(e.target.checked)} />
                  Bestand &gt; 0
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  value={poolVintageFrom}
                  onChange={(e) => setPoolVintageFrom(e.target.value)}
                  placeholder="Jahrgang ab"
                  className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
                />
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  value={poolVintageTo}
                  onChange={(e) => setPoolVintageTo(e.target.value)}
                  placeholder="Jahrgang bis"
                  className="px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-sm"
                />
                <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
                  <input type="checkbox" checked={poolOnlyDrinkReady} onChange={(e) => setPoolOnlyDrinkReady(e.target.checked)} />
                  Nur trinkreif
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
                  <input type="checkbox" checked={allowUnknownMaturity} onChange={(e) => setAllowUnknownMaturity(e.target.checked)} />
                  Unbekannte Reife zulassen
                </label>
                <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
                  <input type="checkbox" checked={preferRare} onChange={(e) => setPreferRare(e.target.checked)} />
                  Raritäten priorisieren
                </label>
                <label className="flex items-center gap-2 px-4 py-3 bg-alabaster border border-burgundy/10 rounded-xl text-xs font-black uppercase tracking-widest text-stone-gray">
                  <input type="checkbox" checked={preferDaily} onChange={(e) => setPreferDaily(e.target.checked)} />
                  Daily priorisieren
                </label>
              </div>

              {assignmentNotice && (
                <div className="bg-sage-light border border-sage/30 text-sage px-4 py-3 rounded-xl text-sm">
                  {assignmentNotice}
                </div>
              )}

              {unassignedInstanceIds.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-xs">
                  <p className="font-black uppercase tracking-widest mb-2">Offene Termine ohne Wein</p>
                  <div className="flex flex-wrap gap-2">
                    {unassignedInstanceIds
                      .map((id) => instances.find((instance) => instance.id === id))
                      .filter((instance): instance is OccasionInstance => !!instance)
                      .map((instance) => (
                        <span key={instance.id} className="px-2 py-1 bg-white border border-amber-200 rounded-lg">
                          {new Date(instance.instance_date).toLocaleDateString('de-DE')}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-col gap-3 rounded-xl border border-burgundy/10 bg-alabaster/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-gray">
                    Auswahl: {selectedVisibleCount} / {poolVisibleWines.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      disabled={poolVisibleWines.length === 0 || allVisibleSelected}
                      className="px-3 py-2 rounded-lg border border-burgundy/20 bg-white text-[10px] font-black uppercase tracking-widest text-burgundy disabled:opacity-40"
                    >
                      Alle auswählen
                    </button>
                    <button
                      type="button"
                      onClick={handleClearVisibleSelection}
                      disabled={selectedVisibleCount === 0}
                      className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-[10px] font-black uppercase tracking-widest text-stone-700 disabled:opacity-40"
                    >
                      Auswahl aufheben
                    </button>
                  </div>
                </div>

                {poolVisibleWines.map((wine) => {
                  const selected = poolDraft[wine.id];
                  return (
                    <div key={wine.id} className="grid grid-cols-1 md:grid-cols-[auto,1fr,120px,120px] items-center gap-3 p-4 bg-white border border-burgundy/10 rounded-xl">
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={(e) => {
                          setPoolDraft((prev) => {
                            const next = { ...prev };
                            if (e.target.checked) {
                              next[wine.id] = next[wine.id] || { bottles_reserved: 1, priority: 'medium' };
                            } else {
                              delete next[wine.id];
                            }
                            return next;
                          });
                        }}
                      />

                      <div>
                        <p className="font-serif text-lg text-charcoal">{wine.vintage} {wine.name}</p>
                        <p className="text-xs text-stone-gray">{wine.producer || 'Produzent unbekannt'} · {wine.region} · Bestand {wine.quantity}</p>
                      </div>

                      <input
                        type="number"
                        min="1"
                        disabled={!selected}
                        value={selected?.bottles_reserved ?? 1}
                        onChange={(e) => {
                          const value = Math.max(1, Number(e.target.value || 1));
                          setPoolDraft((prev) => ({
                            ...prev,
                            [wine.id]: {
                              bottles_reserved: value,
                              priority: prev[wine.id]?.priority || 'medium'
                            }
                          }));
                        }}
                        className="px-3 py-2 bg-alabaster border border-burgundy/10 rounded-xl text-sm disabled:opacity-40"
                      />

                      <select
                        disabled={!selected}
                        value={selected?.priority ?? 'medium'}
                        onChange={(e) => {
                          setPoolDraft((prev) => ({
                            ...prev,
                            [wine.id]: {
                              bottles_reserved: prev[wine.id]?.bottles_reserved || 1,
                              priority: e.target.value as OccasionWinePriority
                            }
                          }));
                        }}
                        className="px-3 py-2 bg-alabaster border border-burgundy/10 rounded-xl text-sm disabled:opacity-40"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-alabaster flex justify-end gap-3">
              <button
                onClick={() => setShowPoolModal(false)}
                className="px-6 py-3 bg-white border border-burgundy/10 text-charcoal rounded-xl font-black uppercase tracking-widest text-[10px]"
              >
                Schließen
              </button>
              <button
                onClick={handleAutoAssign}
                disabled={assigning}
                className="px-6 py-3 bg-burgundy text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 disabled:opacity-50"
              >
                {assigning ? <Clock className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Automatisch zuordnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InstanceCard: React.FC<{
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
