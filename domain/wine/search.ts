import { Wine } from '../../types.ts';

/**
 * The cellar search box used to match only name/region/producer/pocket
 * (InventoryPage.tsx:373 before this) - a grape variety, country,
 * appellation or vintage typed into the same box found nothing, even
 * though all four are on the wine record already.
 */
export const matchesSearchTerm = (wine: Wine, rawTerm: string): boolean => {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;

  return (
    wine.name.toLowerCase().includes(term) ||
    wine.region.toLowerCase().includes(term) ||
    Boolean(wine.producer?.toLowerCase().includes(term)) ||
    Boolean(wine.subcellar?.toLowerCase().includes(term)) ||
    Boolean(wine.country?.toLowerCase().includes(term)) ||
    Boolean(wine.appellation?.toLowerCase().includes(term)) ||
    String(wine.vintage).includes(term) ||
    (wine.grapes ?? []).some((grape) => grape.name.toLowerCase().includes(term))
  );
};
