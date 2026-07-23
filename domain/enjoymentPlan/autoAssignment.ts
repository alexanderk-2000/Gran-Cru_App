import { OccasionInstance, OccasionWinePoolEntry, OccasionWinePriority, Wine } from '../../types.ts';
import { evaluateWineDrinkability } from '../../utils.ts';

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

/**
 * How well a wine's drinking window fits a given occasion date, on a 0-1
 * scale (or -1 if it should be excluded entirely). Damped rather than
 * hard-blocked outside the window, so late instances can still be filled
 * when no better option exists.
 */
export const maturityFit = (instanceDate: string, wine: Wine, allowUnknown: boolean): number => {
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
    fit *= 0.8;
  }

  if (drinkability.status === 'too_early') fit *= 0.75;
  if (drinkability.status === 'past_peak') fit *= 0.8;
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

interface AssignmentEdge {
  instanceId: string;
  wineId: string;
  baseScore: number;
  totalScore: number;
  maturityFit: number;
  diversityDelta: number;
  fallback: boolean;
}

const byScoreDesc = (a: AssignmentEdge, b: AssignmentEdge) => b.totalScore - a.totalScore;

export interface AssignmentOptions {
  allowUnknown: boolean;
  preferRare: boolean;
  preferDaily: boolean;
}

export interface SelectedAssignment {
  instanceId: string;
  wineId: string;
  score: number;
  reason: string;
}

export interface AssignmentResult {
  selected: SelectedAssignment[];
  openInstances: OccasionInstance[];
  edges: AssignmentEdge[];
}

/**
 * Deterministically assigns wines from a pool to a set of occasion
 * instances, balancing drinking-window fit against variety (avoids
 * repeating the same wine/region/category/producer too soon) and
 * usage limits per pool entry. Instances that already carry a manual
 * (non-auto) assignment are treated as locked and count against usage
 * limits but are never reassigned.
 */
export const applyDeterministicAssignment = (
  wines: Wine[],
  fillableInstances: OccasionInstance[],
  poolRows: OccasionWinePoolEntry[],
  options: AssignmentOptions
): AssignmentResult => {
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
  const selected: SelectedAssignment[] = [];

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
      const diversityDelta = underusedBonus + jitter - sameWinePenalty - regionPenalty - categoryPenalty - producerPenalty;

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
      reason: `${edge.fallback ? 'Fallback' : 'Smart'}-Matching (Fit ${edge.maturityFit.toFixed(2)} · Variation ${
        edge.diversityDelta >= 0 ? '+' : ''
      }${edge.diversityDelta.toFixed(2)})`
    });
  }

  return {
    selected,
    openInstances,
    edges: allEdges
  };
};
