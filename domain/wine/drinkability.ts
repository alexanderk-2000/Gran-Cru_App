import { Wine } from '../../types.ts';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeStructureValue = (value: number | null | undefined, fallback: number): number => {
  if (!isFiniteNumber(value)) return fallback;
  return clamp((value - 1) / 4, 0, 1);
};

export type DrinkabilityStatus =
  | 'too_early'
  | 'approaching'
  | 'drinking_window'
  | 'peak'
  | 'past_peak'
  | 'unknown';
export type DrinkabilityUncertainty = 'low' | 'medium' | 'high';
export type OenologyWineType = 'red' | 'white' | 'sparkling' | 'rose' | null;

export interface OenologyDrinkabilityInput {
  wine: {
    vintage: number | null;
    drink_start: number | null;
    peak_year: number | null;
    drink_end: number | null;
    wine_type: OenologyWineType;
    structure: {
      acidity: number | null;
      tannin: number | null;
      body: number | null;
      sweetness: number | null;
      oak: number | null;
    };
  };
  today_year: number;
}

export interface OenologyDrinkabilityOutput {
  status: DrinkabilityStatus;
  drinkability_index: number;
  window_used: number | null;
  distance_to_peak_years: number | null;
  uncertainty: DrinkabilityUncertainty;
  explanation: string;
}

const buildDrinkabilityExplanation = (
  status: DrinkabilityStatus,
  index: number,
  options: {
    missingStartOrEnd: boolean;
    missingPeak: boolean;
    sparseStructure: boolean;
    insideWindow: boolean;
  }
): string => {
  let firstSentence = '';
  switch (status) {
    case 'too_early':
      firstSentence = 'Der Wein liegt vor dem Trinkfenster und ist aktuell noch zu früh.';
      break;
    case 'approaching':
      firstSentence = 'Der Wein nähert sich dem Peak und zeigt bereits gute Trinkreife.';
      break;
    case 'peak':
      firstSentence = 'Der Wein befindet sich sehr nah am Peak und ist aktuell optimal trinkbar.';
      break;
    case 'past_peak':
      firstSentence = 'Der Wein liegt rechnerisch hinter dem Trinkfenster und zeigt Abbaurisiko.';
      break;
    case 'drinking_window':
      firstSentence =
        options.insideWindow && index < 55
          ? 'Der Wein liegt zwar im Trinkfenster, ist rechnerisch aber noch nicht optimal.'
          : 'Der Wein liegt im Trinkfenster und ist gut trinkbar.';
      break;
    default:
      firstSentence =
        'Die Trinkreife kann wegen fehlender oder widersprüchlicher Fensterdaten nicht sicher bestimmt werden.';
      break;
  }

  const gaps: string[] = [];
  if (options.missingStartOrEnd) gaps.push('Start- oder Endjahr fehlt');
  if (options.missingPeak) gaps.push('Peak-Jahr fehlt');
  if (options.sparseStructure) gaps.push('Strukturdaten sind unvollständig');

  if (gaps.length === 0) return firstSentence;
  return `${firstSentence} Unsicherheit erhöht, weil ${gaps.join(', ')}.`;
};

export const evaluateWineDrinkability = (
  input: OenologyDrinkabilityInput
): OenologyDrinkabilityOutput => {
  const todayYear = Number.isInteger(input.today_year) ? input.today_year : new Date().getFullYear();
  const rawStart = isFiniteNumber(input.wine.drink_start) ? input.wine.drink_start : null;
  const rawEnd = isFiniteNumber(input.wine.drink_end) ? input.wine.drink_end : null;
  const rawPeak = isFiniteNumber(input.wine.peak_year) ? input.wine.peak_year : null;

  const hasStart = rawStart !== null;
  const hasEnd = rawEnd !== null;
  const hasPeak = rawPeak !== null;
  const softWindow = !hasStart || !hasEnd;

  const distanceToPeak = hasPeak ? todayYear - rawPeak : null;

  if (!hasStart && !hasEnd) {
    return {
      status: 'unknown',
      drinkability_index: 35,
      window_used: null,
      distance_to_peak_years: distanceToPeak,
      uncertainty: 'high',
      explanation: buildDrinkabilityExplanation('unknown', 35, {
        missingStartOrEnd: true,
        missingPeak: !hasPeak,
        sparseStructure: true,
        insideWindow: false,
      }),
    };
  }

  const effectiveStart = hasStart ? rawStart : todayYear;
  const effectiveEnd = hasEnd ? rawEnd : todayYear + 1;

  if (effectiveStart > effectiveEnd) {
    return {
      status: 'unknown',
      drinkability_index: 35,
      window_used: null,
      distance_to_peak_years: distanceToPeak,
      uncertainty: 'high',
      explanation:
        'Die Trinkreife kann nicht bestimmt werden, weil drink_start nach drink_end liegt.',
    };
  }

  const windowLen = Math.max(1, effectiveEnd - effectiveStart);
  const x = clamp((todayYear - effectiveStart) / windowLen, 0, 1);
  const windowUsed = hasStart && hasEnd ? x : null;
  const peakX = hasPeak ? clamp((rawPeak - effectiveStart) / windowLen, 0, 1) : 0.6;

  const structure = input.wine.structure;
  const t = normalizeStructureValue(structure.tannin, 0.5);
  const a = normalizeStructureValue(structure.acidity, 0.5);
  const b = normalizeStructureValue(structure.body, 0.5);
  const o = normalizeStructureValue(structure.oak, 0.5);
  const sweetnessValue = isFiniteNumber(structure.sweetness) ? structure.sweetness : null;
  const s = normalizeStructureValue(sweetnessValue, 0.3);

  const lBase = clamp(0.35 + 0.25 * t + 0.15 * a + 0.15 * b + 0.1 * o + 0.1 * s, 0, 1);

  let longevity = lBase;
  if (input.wine.wine_type === 'rose') {
    longevity -= 0.2;
  } else if (input.wine.wine_type === 'sparkling') {
    longevity -= 0.05;
    if (sweetnessValue !== null && sweetnessValue >= 3) longevity += 0.1;
  } else if (input.wine.wine_type === 'white') {
    longevity -= 0.05;
    if (sweetnessValue !== null && sweetnessValue >= 3) longevity += 0.1;
  } else if (input.wine.wine_type === 'red') {
    longevity += 0.05;
  }
  longevity = clamp(longevity, 0, 1);

  const sigma = 0.1 + 0.18 * longevity;
  const sigmaLeft = clamp(sigma * (0.85 - 0.25 * (1 - longevity)), 0.06, 0.4);
  const sigmaRight = clamp(sigma * (1.1 + 0.35 * longevity), 0.06, 0.4);

  let score =
    x <= peakX
      ? Math.exp(-((x - peakX) ** 2) / (2 * sigmaLeft ** 2))
      : Math.exp(-((x - peakX) ** 2) / (2 * sigmaRight ** 2));

  if (todayYear < effectiveStart) {
    const yearsEarly = effectiveStart - todayYear;
    score *= Math.max(0, 1 - 0.22 * yearsEarly);
  } else if (todayYear > effectiveEnd) {
    const yearsLate = todayYear - effectiveEnd;
    score *= Math.max(0, 1 - (0.12 + 0.1 * longevity) * yearsLate);
  }

  const drinkabilityIndex = Math.round(clamp(score, 0, 1) * 100);

  let status: DrinkabilityStatus;
  if (todayYear < effectiveStart) {
    status = 'too_early';
  } else if (todayYear > effectiveEnd) {
    status = 'past_peak';
  } else if (Math.abs(x - peakX) <= 0.1 && drinkabilityIndex >= 80) {
    status = 'peak';
  } else if (x < peakX && drinkabilityIndex >= 55) {
    status = 'approaching';
  } else {
    status = 'drinking_window';
  }

  const structureFields = [
    structure.acidity,
    structure.tannin,
    structure.body,
    structure.sweetness,
    structure.oak,
  ];
  const structureCount = structureFields.filter((value) => isFiniteNumber(value)).length;

  let points = 0;
  if (hasStart) points += 1;
  if (hasEnd) points += 1;
  if (hasPeak) points += 1;
  if (structureCount >= 3) points += 1;

  let uncertainty: DrinkabilityUncertainty = 'high';
  if (points >= 3) uncertainty = 'low';
  else if (points === 2) uncertainty = 'medium';
  if (softWindow) uncertainty = 'high';

  return {
    status,
    drinkability_index: drinkabilityIndex,
    window_used: windowUsed,
    distance_to_peak_years: distanceToPeak,
    uncertainty,
    explanation: buildDrinkabilityExplanation(status, drinkabilityIndex, {
      missingStartOrEnd: softWindow,
      missingPeak: !hasPeak,
      sparseStructure: structureCount < 3,
      insideWindow: todayYear >= effectiveStart && todayYear <= effectiveEnd,
    }),
  };
};

export interface DrinkabilityResult {
  score: number;
  status: string;
  wu: number;
}

const mapWineTypeToOenologyType = (wineType: Wine['wine_type']): OenologyWineType => {
  if (wineType === 'Rot') return 'red';
  if (wineType === 'Weiß') return 'white';
  if (wineType === 'Rosé') return 'rose';
  if (wineType === 'Schaumwein') return 'sparkling';
  return null;
};

export const calculateDrinkability = (wine: Wine): DrinkabilityResult => {
  const evaluation = evaluateWineDrinkability({
    today_year: new Date().getFullYear(),
    wine: {
      vintage: isFiniteNumber(wine.vintage) ? wine.vintage : null,
      drink_start: isFiniteNumber(wine.drink_start) ? wine.drink_start : null,
      peak_year: isFiniteNumber(wine.peak_year) ? wine.peak_year : null,
      drink_end: isFiniteNumber(wine.drink_end) ? wine.drink_end : null,
      wine_type: mapWineTypeToOenologyType(wine.wine_type),
      structure: {
        acidity: isFiniteNumber(wine.structure?.acidity) ? wine.structure?.acidity ?? null : null,
        tannin: isFiniteNumber(wine.structure?.tannin) ? wine.structure?.tannin ?? null : null,
        body: isFiniteNumber(wine.structure?.body) ? wine.structure?.body ?? null : null,
        sweetness: isFiniteNumber(wine.structure?.sweetness)
          ? wine.structure?.sweetness ?? null
          : null,
        oak: isFiniteNumber(wine.structure?.oak) ? wine.structure?.oak ?? null : null,
      },
    },
  });

  const statusLabelMap: Record<DrinkabilityStatus, string> = {
    too_early: 'Zu früh',
    approaching: 'Anlaufphase',
    drinking_window: 'Trinkreif',
    peak: 'Optimal',
    past_peak: 'Über Fenster',
    unknown: 'Unbekannt',
  };

  const windowUsed = evaluation.window_used;
  const fallbackWu = evaluation.status === 'past_peak' ? 1 : evaluation.status === 'too_early' ? 0 : 0;

  return {
    score: evaluation.drinkability_index,
    status: statusLabelMap[evaluation.status],
    wu: typeof windowUsed === 'number' ? windowUsed : fallbackWu,
  };
};
