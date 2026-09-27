import { Wine } from '../../types.ts';
import { toText } from './normalization.ts';

const normalizeToken = (value: unknown): string => toText(value).toLowerCase().trim();

/**
 * Finds existing wines that are likely duplicates of the given candidate,
 * checked before saving a new wine. A match is either an exact barcode hit,
 * or producer + name + vintage + format all matching (case-insensitively).
 */
export const findLikelyDuplicates = (
  candidate: Partial<Wine>,
  existingWines: Wine[],
  options: { excludeId?: string } = {}
): Wine[] => {
  const candidateBarcode = normalizeToken(candidate.barcode);
  const candidateName = normalizeToken(candidate.name);
  const candidateProducer = normalizeToken(candidate.producer);
  const candidateVintage = candidate.vintage;
  const candidateFormat = candidate.format;

  return existingWines.filter((wine) => {
    if (wine.deleted_at) return false;
    if (options.excludeId && wine.id === options.excludeId) return false;

    if (candidateBarcode && normalizeToken(wine.barcode) === candidateBarcode) {
      return true;
    }

    if (!candidateName || candidateVintage === undefined || !candidateFormat) {
      return false;
    }

    return (
      normalizeToken(wine.name) === candidateName &&
      normalizeToken(wine.producer) === candidateProducer &&
      wine.vintage === candidateVintage &&
      wine.format === candidateFormat
    );
  });
};

/**
 * Clusters wines into duplicate groups (usually pairs) for a "merge" action.
 * Same one-hop matching as the flat duplicate-warning set the Dashboard
 * already builds from findLikelyDuplicates - a merge UI needs the grouping,
 * not just "is this wine part of some duplicate".
 */
export const groupLikelyDuplicates = (wines: Wine[]): Wine[][] => {
  const activeWines = wines.filter((wine) => !wine.deleted_at);
  const visited = new Set<string>();
  const groups: Wine[][] = [];

  for (const wine of activeWines) {
    if (visited.has(wine.id)) continue;
    const matches = findLikelyDuplicates(wine, activeWines, { excludeId: wine.id });
    if (matches.length === 0) continue;

    const group = [wine, ...matches];
    for (const member of group) visited.add(member.id);
    groups.push(group);
  }

  return groups;
};
