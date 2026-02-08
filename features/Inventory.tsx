
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Wine, Category, WineStatus } from '../types.ts';
import { WineCard } from '../components/WineCard.tsx';
import { Search, Plus, X, Loader2, Wand2, Globe, ExternalLink, Upload } from 'lucide-react';
import { extractVintageFromQuery, getWineFamily, getWineStatus, handleAiOperationError } from '../utils.ts';
import { aiService } from '../services/ai.ts';
import { storageService } from '../services/storage.ts';
import { Badge } from '../components/Badge.tsx';

const MAIN_CELLAR_FILTER = '__main_cellar__';
const MAIN_CELLAR_LABEL = 'Hauptkeller';

interface InventoryProps {
  wines: Wine[];
  wishlistOnly?: boolean;
  onWineUpdate: () => void;
  onAddBottle: (wine: Partial<Wine>) => void;
  onDrink: (wine: Wine) => void;
}

export const Inventory: React.FC<InventoryProps> = ({
  wines,
  wishlistOnly = false,
  onDrink,
  onWineUpdate
}) => {
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<WineStatus | 'All'>('All');
  const [subcellarFilter, setSubcellarFilter] = useState<string>('All');

  // AI States
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isJsonImporting, setIsJsonImporting] = useState(false);
  const [jsonCodeInput, setJsonCodeInput] = useState('');
  const [aiPreview, setAiPreview] = useState<Partial<Wine> | null>(null);
  const [sources, setSources] = useState<{ title: string, uri: string }[]>([]);
  const [targetSubcellar, setTargetSubcellar] = useState('');
  const [storedPocketNames, setStoredPocketNames] = useState<string[]>([]);
  const [isPocketModalOpen, setIsPocketModalOpen] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [isPocketSaving, setIsPocketSaving] = useState(false);
  const [draggedWineId, setDraggedWineId] = useState<string | null>(null);
  const [dropTargetPocketId, setDropTargetPocketId] = useState<string | null>(null);
  const [isMovingWine, setIsMovingWine] = useState(false);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);
  const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const normalizeSubcellar = (value: unknown): string => toText(value);

  const toNumberOr = (value: unknown, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  };

  const toOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  };

  const normalizeConfidence = (value: unknown): Wine['confidence'] => {
    if (typeof value === 'number') {
      if (value >= 0.75) return 'high';
      if (value >= 0.4) return 'medium';
      return 'low';
    }
    const text = toText(value).toLowerCase();
    if (text === 'high' || text === 'hoch') return 'high';
    if (text === 'low' || text === 'niedrig') return 'low';
    return 'medium';
  };

  const normalizeWineType = (value: unknown): Wine['wine_type'] | undefined => {
    const text = toText(value).toLowerCase();
    if (!text) return undefined;
    if (text.includes('rot')) return 'Rot';
    if (text.includes('weiß') || text.includes('weiss') || text.includes('white')) return 'Weiß';
    if (text.includes('ros')) return 'Rosé';
    if (text.includes('schaum') || text.includes('sekt') || text.includes('sparkling') || text.includes('champ')) return 'Schaumwein';
    if (text.includes('süß') || text.includes('suess') || text.includes('dessert') || text.includes('sweet')) return 'Süßwein';
    return undefined;
  };

  const normalizeFormat = (value: unknown): Wine['format'] | undefined => {
    const text = toText(value).toLowerCase().replace(/\s/g, '');
    if (!text) return undefined;
    if (text.includes('0.375')) return '0.375L';
    if (text.includes('0.75')) return '0.75L';
    if (text.includes('1.5') || text.includes('magnum')) return '1.5L (Magnum)';
    if (text.includes('3.0') || text.includes('doublemagnum')) return '3.0L (Double Magnum)';
    if (text.includes('6.0') || text.includes('imperial')) return '6.0L (Imperial)';
    return undefined;
  };

  const normalizeCategory = (value: unknown, fallback: Category): Category => {
    const text = toText(value);
    if (text === 'Genuss' || text === 'Investment' || text === 'Rarität' || text === 'Daily Drinker') return text;
    return fallback;
  };

  const presetView = useMemo(() => {
    const view = new URLSearchParams(location.search).get('view');
    const allowed = new Set(['ready', 'holding', 'past', 'red', 'white', 'sparkling', 'fortified']);
    if (view && allowed.has(view)) return view;
    return null;
  }, [location.search]);

  const presetMeta = useMemo(() => {
    if (wishlistOnly) {
      return {
        title: 'Wunschliste',
        subtitle: 'Geplante Ergänzungen.'
      };
    }
    switch (presetView) {
      case 'ready':
        return { title: 'Trinkbereit', subtitle: 'Flaschen im aktiven Trinkfenster.' };
      case 'holding':
        return { title: 'Lagernd', subtitle: 'Flaschen für spätere Reife.' };
      case 'past':
        return { title: 'Überreif', subtitle: 'Flaschen über dem Trinkfenster.' };
      case 'red':
        return { title: 'Rotwein', subtitle: 'Segmentliste Rotwein.' };
      case 'white':
        return { title: 'Weißwein', subtitle: 'Segmentliste Weißwein.' };
      case 'sparkling':
        return { title: 'Schaumwein', subtitle: 'Segmentliste Schaumwein.' };
      case 'fortified':
        return { title: 'Portwein', subtitle: 'Segmentliste Fortified/Portwein.' };
      default:
        return { title: 'Hauptkeller', subtitle: 'Verwaltung Ihrer flüssigen Assets.' };
    }
  }, [presetView, wishlistOnly]);

  const refreshStoredPockets = useCallback(async () => {
    try {
      const pockets = await storageService.getCellarPockets();
      setStoredPocketNames(
        pockets
          .map((pocket) => normalizeSubcellar(pocket.name))
          .filter((name) => name.length > 0)
      );
    } catch {
      setStoredPocketNames([]);
    }
  }, []);

  useEffect(() => {
    void refreshStoredPockets();
  }, [refreshStoredPockets]);

  const availableSubcellars = useMemo(() => {
    const set = new Set<string>();
    for (const pocketName of storedPocketNames) {
      if (pocketName) set.add(pocketName);
    }
    for (const wine of wines) {
      if (wine.wishlist !== wishlistOnly) continue;
      const name = normalizeSubcellar(wine.subcellar);
      if (!name) continue;
      set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }, [storedPocketNames, wines, wishlistOnly]);

  const pocketSummaries = useMemo(() => {
    const inventory = wines.filter((wine) => wine.wishlist === wishlistOnly);
    const byPocket = new Map<string, { wineCount: number; bottleCount: number }>();

    for (const wine of inventory) {
      const key = normalizeSubcellar(wine.subcellar) || MAIN_CELLAR_FILTER;
      const stats = byPocket.get(key) ?? { wineCount: 0, bottleCount: 0 };
      stats.wineCount += 1;
      stats.bottleCount += Math.max(0, wine.quantity || 0);
      byPocket.set(key, stats);
    }

    const allWineCount = inventory.length;
    const allBottleCount = inventory.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0);

    const pockets = [
      {
        id: 'All',
        label: 'Alle Pockets',
        wineCount: allWineCount,
        bottleCount: allBottleCount
      },
      {
        id: MAIN_CELLAR_FILTER,
        label: MAIN_CELLAR_LABEL,
        wineCount: byPocket.get(MAIN_CELLAR_FILTER)?.wineCount ?? 0,
        bottleCount: byPocket.get(MAIN_CELLAR_FILTER)?.bottleCount ?? 0
      },
      ...availableSubcellars
        .filter((name) => name.toLowerCase() !== MAIN_CELLAR_LABEL.toLowerCase())
        .map((name) => ({
          id: name,
          label: name,
          wineCount: byPocket.get(name)?.wineCount ?? 0,
          bottleCount: byPocket.get(name)?.bottleCount ?? 0
        }))
    ];

    return pockets;
  }, [availableSubcellars, wines, wishlistOnly]);

  const parseImportedSources = (value: unknown): Array<{ title?: string; url?: string }> => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry: any) => {
        if (typeof entry === 'string') return { title: 'Quelle', url: toText(entry) };
        return { title: toText(entry?.title) || 'Quelle', url: toText(entry?.url) };
      })
      .filter((entry) => Boolean(entry.url));
  };

  const parseImportedGrapes = (primary: unknown, fallback: unknown): Array<{ name: string; percentage?: number }> => {
    const fromPrimary = Array.isArray(primary)
      ? primary
          .map((entry: any) => ({
            name: toText(entry?.name || entry),
            percentage: toOptionalNumber(entry?.percentage)
          }))
          .filter((entry: any) => entry.name)
      : [];

    if (fromPrimary.length > 0) return fromPrimary;

    return Array.isArray(fallback)
      ? fallback
          .map((entry: any) => ({
            name: toText(entry?.name || entry),
            percentage: toOptionalNumber(entry?.percentage)
          }))
          .filter((entry: any) => entry.name)
      : [];
  };

  const parseImportedAromas = (primary: unknown, sensoryAromatics: any): Array<{ tag: string; intensity?: number }> => {
    const fromPrimary = Array.isArray(primary)
      ? primary
          .map((entry: any) => ({
            tag: toText(entry?.tag || entry),
            intensity: toOptionalNumber(entry?.intensity)
          }))
          .filter((entry: any) => entry.tag)
      : [];
    if (fromPrimary.length > 0) return fromPrimary;

    if (!sensoryAromatics || typeof sensoryAromatics !== 'object') return [];
    const buckets = ['fruit', 'floral', 'spice', 'herbal_spice', 'wood', 'minerality', 'mineral_earth', 'tertiary'];
    const flattened: Array<{ tag: string; intensity?: number }> = [];
    for (const bucket of buckets) {
      const values = (sensoryAromatics as any)[bucket];
      if (!Array.isArray(values)) continue;
      for (const item of values) {
        const tag = toText(item);
        if (!tag) continue;
        flattened.push({ tag });
      }
    }
    return flattened;
  };

  const parseImportedScores = (primary: unknown, detailCritics: unknown) => {
    const fromPrimary = Array.isArray(primary)
      ? primary
          .map((entry: any) => {
            const rawScore = entry?.score ?? entry?.value;
            const numericScore = toOptionalNumber(rawScore);
            const stringScore = toText(rawScore);
            return {
              critic: toText(entry?.critic || entry?.source),
              score: numericScore ?? (stringScore || undefined),
              year: toOptionalNumber(entry?.year ?? entry?.vintage)
            };
          })
          .filter((entry: any) => entry.critic && entry.score !== undefined)
      : [];

    const fromDetails = Array.isArray(detailCritics)
      ? detailCritics
          .map((entry: any) => ({
            critic: toText(entry?.source || entry?.critic),
            score: toOptionalNumber(entry?.value ?? entry?.score),
            year: toOptionalNumber(entry?.vintage ?? entry?.year)
          }))
          .filter((entry: any) => entry.critic && entry.score !== undefined)
      : [];

    return [...fromPrimary, ...fromDetails].filter((entry, idx, arr) => {
      const key = `${entry.critic.toLowerCase()}::${entry.year || 'na'}`;
      return arr.findIndex((item) => `${item.critic.toLowerCase()}::${item.year || 'na'}` === key) === idx;
    });
  };

  const getImportCandidates = (payload: unknown): any[] => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as any;
    if (Array.isArray(record.wines)) return record.wines;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.data)) return record.data;
    if (record.data && typeof record.data === 'object') return [record.data];
    return [record];
  };

  const normalizeImportedWine = (candidate: any, fallbackName = 'Importierter Wein'): Partial<Wine> | null => {
    if (!candidate || typeof candidate !== 'object') return null;

    const data = (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data))
      ? candidate.data
      : candidate;
    if (!data || typeof data !== 'object') return null;

    const details = (data.details && typeof data.details === 'object') ? data.details : {};
    const detailsIdentification = (details.identification && typeof details.identification === 'object') ? details.identification : {};
    const detailsVinification = (details.vinification && typeof details.vinification === 'object') ? details.vinification : {};
    const detailsRatings = (details.ratings && typeof details.ratings === 'object') ? details.ratings : {};
    const detailsMaturity = (details.maturity && typeof details.maturity === 'object') ? details.maturity : {};
    const detailsSensory = (details.sensory && typeof details.sensory === 'object') ? details.sensory : {};
    const detailsGrapesStyle = (details.grapes_style && typeof details.grapes_style === 'object') ? details.grapes_style : {};

    const currentYear = new Date().getFullYear();
    const normalizedVintage = toNumberOr(data.vintage, currentYear);
    const normalizedDrinkStart = toNumberOr(data.drink_start ?? (detailsMaturity as any).drink_start, normalizedVintage + 2);
    const normalizedDrinkEnd = toNumberOr(data.drink_end ?? (detailsMaturity as any).drink_end, normalizedDrinkStart + 8);
    const normalizedMarketPrice = toNumberOr(data.market_price, 0);
    const shortDescription = toText(data.short_description_de);
    const normalizedName = toText(data.name) || fallbackName;

    if (!normalizedName) return null;

    const normalizedSources = parseImportedSources(data.sources);
    const normalizedGrapes = parseImportedGrapes(data.grapes, (detailsGrapesStyle as any).varieties);
    const normalizedAromas = parseImportedAromas(data.aromas, (detailsSensory as any).aromatics);
    const normalizedScores = parseImportedScores(data.scores, (detailsRatings as any).critics);

    const structureRaw = data.structure && typeof data.structure === 'object' ? data.structure : {};
    const normalizedStructure = {
      acidity: toOptionalNumber((structureRaw as any).acidity),
      tannin: toOptionalNumber((structureRaw as any).tannin),
      body: toOptionalNumber((structureRaw as any).body),
      sweetness: toOptionalNumber((structureRaw as any).sweetness),
      oak: toOptionalNumber((structureRaw as any).oak)
    };

    const normalizedPairings = Array.isArray(data.pairings)
      ? data.pairings
          .map((entry: any) => ({
            item: toText(entry?.item || entry),
            category: toText(entry?.category) || undefined,
            note: toText(entry?.note) || undefined
          }))
          .filter((entry: any) => entry.item)
      : [];

    const importSubcellar =
      toText(data.subcellar) ||
      toText(data.sub_cellar) ||
      toText((details as any)?.cellar?.storage_location);

    return {
      name: normalizedName,
      vintage: normalizedVintage,
      producer: toText(data.producer) || undefined,
      region: toText(data.region) || toText((detailsIdentification as any).region) || 'Unbekannt',
      country: toText(data.country) || toText((detailsIdentification as any).country) || undefined,
      appellation: toText(data.appellation) || toText((detailsIdentification as any).appellation) || undefined,
      vineyard: toText(data.vineyard) || toText((detailsIdentification as any).vineyard) || undefined,
      wine_type: normalizeWineType(data.wine_type) || normalizeWineType((detailsIdentification as any).wine_type),
      category: normalizeCategory(data.category, wishlistOnly ? 'Rarität' : 'Genuss'),
      format: normalizeFormat(data.format) || normalizeFormat((detailsIdentification as any).bottle_size) || '0.75L',
      quantity: Math.max(1, toNumberOr(data.quantity, 1)),
      purchase_price: toNumberOr(data.purchase_price, normalizedMarketPrice),
      market_price: normalizedMarketPrice,
      drink_start: normalizedDrinkStart,
      drink_end: normalizedDrinkEnd,
      peak_year: toOptionalNumber(data.peak_year ?? (detailsMaturity as any).peak_year),
      alcohol_percent: toOptionalNumber(data.alcohol_percent ?? (detailsGrapesStyle as any).alcohol_percent),
      closure_type: toText(data.closure_type) || toText((detailsIdentification as any).closure_type) || undefined,
      fermentation: toText((data.vinification && data.vinification.fermentation_vessel) || (detailsVinification as any).fermentation_vessel) || undefined,
      aging_process: toText((data.vinification && data.vinification.aging_vessel) || (detailsVinification as any).aging_vessel) || undefined,
      grapes: normalizedGrapes,
      aromas: normalizedAromas,
      structure: normalizedStructure,
      pairings: normalizedPairings,
      scores: normalizedScores,
      subcellar: importSubcellar || undefined,
      confidence: normalizeConfidence(data.confidence),
      missing_fields: Array.isArray(data.missing_fields) ? data.missing_fields.filter((item: any) => toText(item)) : [],
      ai_details: {
        ...details,
        extensions: {
          ...((details as any).extensions || {}),
          ...(shortDescription ? { short_description_de: shortDescription } : {})
        }
      },
      ai_sources: normalizedSources,
      wishlist: wishlistOnly
    };
  };

  const openJsonImportPicker = () => {
    if (isJsonImporting) return;
    jsonFileInputRef.current?.click();
  };

  const importWinesFromJsonText = async (jsonText: string) => {
    setIsJsonImporting(true);
    try {
      const parsed = JSON.parse(jsonText);
      const candidates = getImportCandidates(parsed);
      if (candidates.length === 0) {
        throw new Error('Keine importierbaren Weindaten gefunden.');
      }

      const mapped = candidates
        .map((entry: any, index: number) => normalizeImportedWine(entry, `Importierter Wein ${index + 1}`))
        .filter((entry: Partial<Wine> | null): entry is Partial<Wine> => Boolean(entry));

      if (mapped.length === 0) {
        throw new Error('JSON erkannt, aber keine gültigen Weinobjekte enthalten.');
      }

      let saved = 0;
      let failed = 0;
      let catalogFailed = 0;
      const normalizedTargetSubcellar = normalizeSubcellar(targetSubcellar);
      for (const wine of mapped) {
        try {
          const wineWithTarget = {
            ...wine,
            subcellar: normalizeSubcellar(wine.subcellar) || normalizedTargetSubcellar || undefined
          };
          const savedWine = await storageService.saveWine(wineWithTarget);
          try {
            await storageService.upsertWineCatalog(savedWine);
          } catch (catalogError) {
            console.warn('Catalog upsert failed for imported wine:', catalogError);
            catalogFailed += 1;
          }
          saved += 1;
        } catch {
          failed += 1;
        }
      }

      await onWineUpdate();
      setIsAiModalOpen(false);
      setAiPreview(null);
      setAiInput('');
      setJsonCodeInput('');

      if (failed > 0 || catalogFailed > 0) {
        const parts = [`${saved} Wein(e) importiert`];
        if (failed > 0) parts.push(`${failed} Eintrag/Einträge konnten nicht gespeichert werden`);
        if (catalogFailed > 0) parts.push(`${catalogFailed} Eintrag/Einträge konnten nicht in den globalen Katalog geschrieben werden`);
        alert(`${parts.join(', ')}.`);
      } else {
        alert(`${saved} Wein(e) erfolgreich importiert und global verfügbar.`);
      }
    } catch (error: any) {
      console.error('JSON import failed:', error);
      alert(`JSON-Import fehlgeschlagen: ${error?.message || 'Ungültige Datei.'}`);
    } finally {
      setIsJsonImporting(false);
    }
  };

  const handleJsonImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileText = await file.text();
    await importWinesFromJsonText(fileText);
  };

  const handleJsonCodeImport = async () => {
    if (!jsonCodeInput.trim()) return;
    await importWinesFromJsonText(jsonCodeInput);
  };

  const filteredWines = useMemo(() => {
    return wines.filter(wine => {
      if (wine.wishlist !== wishlistOnly) return false;
      if (presetView === 'ready' && getWineStatus(wine) !== WineStatus.READY) return false;
      if (presetView === 'holding' && getWineStatus(wine) !== WineStatus.HOLD) return false;
      if (presetView === 'past' && getWineStatus(wine) !== WineStatus.PAST_PEAK) return false;
      if (presetView === 'red' && getWineFamily(wine) !== 'red') return false;
      if (presetView === 'white' && getWineFamily(wine) !== 'white') return false;
      if (presetView === 'sparkling' && getWineFamily(wine) !== 'sparkling') return false;
      if (presetView === 'fortified' && getWineFamily(wine) !== 'fortified') return false;
      const matchesSearch = wine.name.toLowerCase().includes(search.toLowerCase()) ||
        wine.region.toLowerCase().includes(search.toLowerCase()) ||
        wine.producer?.toLowerCase().includes(search.toLowerCase()) ||
        wine.subcellar?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || wine.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || getWineStatus(wine) === statusFilter;
      const normalizedWineSubcellar = normalizeSubcellar(wine.subcellar);
      const matchesSubcellar =
        subcellarFilter === 'All' ||
        (subcellarFilter === MAIN_CELLAR_FILTER
          ? normalizedWineSubcellar.length === 0
          : normalizedWineSubcellar === subcellarFilter);
      return matchesSearch && matchesCategory && matchesStatus && matchesSubcellar;
    });
  }, [wines, search, categoryFilter, statusFilter, subcellarFilter, wishlistOnly, presetView]);

  const groupedWines = useMemo(() => {
    const groups = new Map<string, Wine[]>();
    for (const wine of filteredWines) {
      const normalized = normalizeSubcellar(wine.subcellar);
      const key = normalized || MAIN_CELLAR_FILTER;
      const list = groups.get(key) ?? [];
      list.push(wine);
      groups.set(key, list);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => {
        if (a === MAIN_CELLAR_FILTER) return -1;
        if (b === MAIN_CELLAR_FILTER) return 1;
        return a.localeCompare(b, 'de');
      })
      .map(([key, list]) => ({
        key,
        label: key === MAIN_CELLAR_FILTER ? MAIN_CELLAR_LABEL : key,
        wines: list,
        bottleCount: list.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0)
      }));
  }, [filteredWines]);

  const handleAiSearch = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiPreview(null);
    setSources([]);

    try {
      const currentYear = new Date().getFullYear();
      const parsedVintage = extractVintageFromQuery(aiInput);
      const result = await aiService.generateWineInfo(aiInput, '', parsedVintage ?? 0);

      if (!result.success) {
        throw new Error(result.error || 'KI-Anfrage fehlgeschlagen');
      }

      const data = result.data;
      const details = (data.details && typeof data.details === 'object') ? data.details : {};
      const detailsIdentification = (details.identification && typeof details.identification === 'object') ? details.identification : {};
      const detailsVinification = (details.vinification && typeof details.vinification === 'object') ? details.vinification : {};
      const detailsRatings = (details.ratings && typeof details.ratings === 'object') ? details.ratings : {};

      const normalizedVintage = toNumberOr(data.vintage, parsedVintage ?? currentYear);
      const normalizedDrinkStart = toNumberOr(data.drink_start, currentYear);
      const normalizedDrinkEnd = toNumberOr(data.drink_end, normalizedDrinkStart + 10);
      const normalizedMarketPrice = toNumberOr(data.market_price, 0);
      const shortDescription = toText(data.short_description_de);
      const normalizedWineType = normalizeWineType(data.wine_type) || normalizeWineType((detailsIdentification as any).wine_type);
      const normalizedFormat = normalizeFormat(data.format) || normalizeFormat((detailsIdentification as any).bottle_size) || '0.75L';
      const normalizedCategory = normalizeCategory(data.category, wishlistOnly ? 'Rarität' : 'Genuss');
      const normalizedSources = Array.isArray(data.sources)
        ? data.sources
            .map((entry: any) => ({
              title: toText(entry?.title) || 'Quelle',
              url: toText(entry?.url)
            }))
            .filter((entry: any) => entry.url)
        : [];

      const normalizedGrapes = Array.isArray(data.grapes)
        ? data.grapes
            .map((entry: any) => ({
              name: toText(entry?.name),
              percentage: toOptionalNumber(entry?.percentage)
            }))
            .filter((entry: any) => entry.name)
        : [];

      const normalizedAromas = Array.isArray(data.aromas)
        ? data.aromas
            .map((entry: any) => ({
              tag: toText(entry?.tag),
              intensity: toOptionalNumber(entry?.intensity)
            }))
            .filter((entry: any) => entry.tag)
        : [];

      const structureRaw = data.structure && typeof data.structure === 'object' ? data.structure : {};
      const normalizedStructure = {
        acidity: toOptionalNumber((structureRaw as any).acidity),
        tannin: toOptionalNumber((structureRaw as any).tannin),
        body: toOptionalNumber((structureRaw as any).body),
        sweetness: toOptionalNumber((structureRaw as any).sweetness),
        oak: toOptionalNumber((structureRaw as any).oak)
      };

      const normalizedPairings = Array.isArray(data.pairings)
        ? data.pairings
            .map((entry: any) => ({
              item: toText(entry?.item),
              category: toText(entry?.category) || undefined,
              note: toText(entry?.note) || undefined
            }))
            .filter((entry: any) => entry.item)
        : [];

      const normalizedScores = Array.isArray(data.scores)
        ? data.scores
            .map((entry: any) => ({
              critic: toText(entry?.critic || entry?.source),
              score: toOptionalNumber(entry?.score ?? entry?.value) ?? 0,
              year: toOptionalNumber(entry?.year ?? entry?.vintage)
            }))
            .filter((entry: any) => entry.critic && entry.score > 0)
        : [];
      const normalizedDetailCriticScores = Array.isArray((detailsRatings as any).critics)
        ? (detailsRatings as any).critics
            .map((entry: any) => ({
              critic: toText(entry?.source || entry?.critic),
              score: toOptionalNumber(entry?.value ?? entry?.score) ?? 0,
              year: toOptionalNumber(entry?.vintage ?? entry?.year)
            }))
            .filter((entry: any) => entry.critic && entry.score > 0)
        : [];
      const mergedScores = [...normalizedScores, ...normalizedDetailCriticScores].filter((entry, idx, arr) => {
        const key = `${entry.critic.toLowerCase()}::${entry.year || 'na'}`;
        return arr.findIndex((item) => `${item.critic.toLowerCase()}::${item.year || 'na'}` === key) === idx;
      });

      setSources(normalizedSources.map((entry: any) => ({ title: entry.title, uri: entry.url })));

      setAiPreview({
        name: data.name || aiInput,
        vintage: normalizedVintage,
        producer: toText(data.producer) || undefined,
        region: toText(data.region) || toText((detailsIdentification as any).region) || 'Unbekannt',
        country: toText(data.country) || toText((detailsIdentification as any).country) || undefined,
        appellation: toText(data.appellation) || toText((detailsIdentification as any).appellation) || undefined,
        vineyard: toText(data.vineyard) || toText((detailsIdentification as any).vineyard) || undefined,
        wine_type: normalizedWineType,
        category: normalizedCategory,
        format: normalizedFormat,
        market_price: normalizedMarketPrice,
        drink_start: normalizedDrinkStart,
        drink_end: normalizedDrinkEnd,
        peak_year: toOptionalNumber(data.peak_year),
        alcohol_percent: toOptionalNumber(data.alcohol_percent),
        closure_type: toText(data.closure_type) || toText((detailsIdentification as any).closure_type) || undefined,
        fermentation: toText((data.vinification && data.vinification.fermentation_vessel) || (detailsVinification as any).fermentation_vessel) || undefined,
        aging_process: toText((data.vinification && data.vinification.aging_vessel) || (detailsVinification as any).aging_vessel) || undefined,
        grapes: normalizedGrapes,
        aromas: normalizedAromas,
        structure: normalizedStructure,
        pairings: normalizedPairings,
        scores: mergedScores,
        confidence: normalizeConfidence(data.confidence),
        missing_fields: data.missing_fields || [],
        ai_details: {
          ...details,
          extensions: {
            ...((details as any).extensions || {}),
            ...(shortDescription ? { short_description_de: shortDescription } : {})
          }
        },
        ai_sources: normalizedSources,
        quantity: 1,
        purchase_price: normalizedMarketPrice,
        wishlist: wishlistOnly,
      });
    } catch (error) {
      handleAiOperationError(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const manualAdd = async () => {
    const currentYear = new Date().getFullYear();
    const normalizedTargetSubcellar = normalizeSubcellar(targetSubcellar);
    await storageService.saveWine({
      name: 'Neuer Wein',
      vintage: currentYear,
      region: 'Unbekannt',
      category: 'Daily Drinker',
      quantity: 1,
      purchase_price: 0,
      format: '0.75L',
      drink_start: currentYear,
      drink_end: currentYear + 10,
      subcellar: normalizedTargetSubcellar || undefined,
      wishlist: wishlistOnly
    });
    onWineUpdate();
    setIsAiModalOpen(false);
  };

  const confirmAiAddition = async () => {
    if (aiPreview) {
      const normalizedTargetSubcellar = normalizeSubcellar(targetSubcellar);
      await storageService.saveWine({
        ...aiPreview,
        subcellar: normalizeSubcellar(aiPreview.subcellar) || normalizedTargetSubcellar || undefined
      });
      onWineUpdate();
      setIsAiModalOpen(false);
      setAiPreview(null);
      setAiInput('');
    }
  };

  const createPocket = async () => {
    const normalizedName = normalizeSubcellar(newPocketName);
    if (!normalizedName || isPocketSaving) return;

    setIsPocketSaving(true);
    try {
      const created = await storageService.createCellarPocket(normalizedName);
      if (!created) {
        alert('Pocket konnte nicht gespeichert werden. Bitte Datenbank-Migration ausführen.');
        return;
      }
      await refreshStoredPockets();
      setSubcellarFilter(normalizedName);
      setTargetSubcellar(normalizedName);
      setNewPocketName('');
      setIsPocketModalOpen(false);
    } catch (error: any) {
      alert(error?.message || 'Pocket konnte nicht angelegt werden.');
    } finally {
      setIsPocketSaving(false);
    }
  };

  const getPocketIdForWine = (wine: Wine): string => normalizeSubcellar(wine.subcellar) || MAIN_CELLAR_FILTER;

  const moveWineToPocket = async (wineId: string, targetPocketId: string) => {
    if (targetPocketId === 'All') return;
    const wine = wines.find((entry) => entry.id === wineId);
    if (!wine) return;

    const currentPocketId = getPocketIdForWine(wine);
    if (currentPocketId === targetPocketId) return;

    setIsMovingWine(true);
    try {
      await storageService.saveWine({
        id: wine.id,
        subcellar: targetPocketId === MAIN_CELLAR_FILTER ? '' : targetPocketId
      });
      await onWineUpdate();
    } catch (error: any) {
      alert(error?.message || 'Verschieben in Pocket fehlgeschlagen.');
    } finally {
      setIsMovingWine(false);
    }
  };

  const handleWineDragStart = (event: React.DragEvent<HTMLDivElement>, wine: Wine) => {
    setDraggedWineId(wine.id);
    setDropTargetPocketId(getPocketIdForWine(wine));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', wine.id);
  };

  const handleWineDragEnd = () => {
    setDraggedWineId(null);
    setDropTargetPocketId(null);
  };

  const handlePocketDragOver = (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => {
    if (!draggedWineId || pocketId === 'All') return;
    event.preventDefault();
    if (dropTargetPocketId !== pocketId) {
      setDropTargetPocketId(pocketId);
    }
  };

  const handlePocketDrop = async (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => {
    event.preventDefault();
    if (!draggedWineId || pocketId === 'All') return;
    await moveWineToPocket(draggedWineId, pocketId);
    setDraggedWineId(null);
    setDropTargetPocketId(null);
  };

  const showPocketDashboard = !wishlistOnly && !presetView && subcellarFilter === 'All';
  const allPocketBottleCount = pocketSummaries.find((item) => item.id === 'All')?.bottleCount ?? 0;
  const pocketDashboardEntries = pocketSummaries.filter((item) => item.id !== 'All');

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-4xl font-bold text-charcoal">
            {presetMeta.title}
          </h2>
          <p className="text-stone-gray font-medium tracking-wide">
            {presetMeta.subtitle}
          </p>
        </div>
        <div className="flex gap-3">
          <input
            ref={jsonFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleJsonImport}
            className="hidden"
          />
          <button
            onClick={openJsonImportPicker}
            disabled={isJsonImporting}
            className="flex items-center gap-2 px-5 py-3.5 bg-white border-2 border-burgundy/15 text-burgundy font-black rounded-2xl transition-all hover:border-burgundy/30 disabled:opacity-50 uppercase tracking-wider text-[10px]"
          >
            {isJsonImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            JSON IMPORT
          </button>
          <button
            onClick={() => {
              const mappedFromFilter = subcellarFilter === 'All' || subcellarFilter === MAIN_CELLAR_FILTER ? '' : subcellarFilter;
              setTargetSubcellar(mappedFromFilter);
              setIsAiModalOpen(true);
            }}
            className="flex items-center gap-2 px-6 py-3.5 bg-burgundy hover:bg-burgundy-light text-white font-black rounded-2xl transition-all shadow-premium uppercase tracking-wider text-[10px]"
          >
            <Plus className="w-4 h-4" /> NEU ANLEGEN
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 p-4 bg-white border-2 border-burgundy/5 rounded-[2rem] shadow-premium">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray" />
          <input
            type="text" placeholder="Kollektion durchsuchen..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-alabaster border-2 border-transparent rounded-[1.25rem] text-sm focus:outline-none focus:border-burgundy/20 transition-all font-medium"
          />
        </div>
        <div className="flex gap-2">
          <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={[{ label: 'Alle Kategorien', value: 'All' }, { label: 'Genuss', value: 'Genuss' }, { label: 'Investment', value: 'Investment' }, { label: 'Rarität', value: 'Rarität' }]} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[{ label: 'Jeder Status', value: 'All' }, { label: 'Trinkreif', value: WineStatus.READY }, { label: 'Lagernd', value: WineStatus.HOLD }, { label: 'Vergangen', value: WineStatus.PAST_PEAK }]} />
        </div>
      </div>

      <section className="rounded-[1.8rem] border-2 border-burgundy/5 bg-white p-4 shadow-premium">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-gray">Pockets</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
              {draggedWineId ? 'Jetzt auf eine Pocket ziehen' : 'Wie Unterkonten im Hauptkeller'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPocketModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl border border-burgundy/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-burgundy transition-all hover:border-burgundy/40 hover:bg-burgundy/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Pocket
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pocketSummaries.map((pocket) => {
            const active = subcellarFilter === pocket.id;
            const canDrop = Boolean(draggedWineId) && pocket.id !== 'All';
            const isDropTarget = dropTargetPocketId === pocket.id && canDrop;
            return (
              <button
                key={pocket.id}
                type="button"
                onClick={() => setSubcellarFilter(pocket.id)}
                onDragOver={(event) => handlePocketDragOver(event, pocket.id)}
                onDrop={(event) => void handlePocketDrop(event, pocket.id)}
                onDragEnter={() => {
                  if (canDrop) setDropTargetPocketId(pocket.id);
                }}
                onDragLeave={() => {
                  if (isDropTarget) setDropTargetPocketId(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                  isDropTarget
                    ? 'border-burgundy bg-burgundy/15 text-burgundy shadow-sm'
                    : active
                    ? 'border-burgundy/40 bg-burgundy/10 text-burgundy'
                    : 'border-stone-200 bg-alabaster/50 text-stone-700 hover:border-burgundy/20'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.12em]">{pocket.label}</p>
                <p className="mt-1 text-[11px] text-stone-600">
                  {pocket.wineCount} Weine · {pocket.bottleCount} Fl.
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {isPocketModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-charcoal/35 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-[2rem] border border-burgundy/10 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-2xl text-charcoal">Neue Pocket</h3>
              <button
                type="button"
                onClick={() => {
                  setIsPocketModalOpen(false);
                  setNewPocketName('');
                }}
                className="rounded-full p-1 text-stone-gray transition-all hover:bg-alabaster hover:text-charcoal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-stone-gray">Lege eine Pocket wie ein Unterkonto an.</p>
            <input
              type="text"
              value={newPocketName}
              onChange={(e) => setNewPocketName(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createPocket();
                }
              }}
              placeholder="z. B. Bordeaux Collection"
              className="w-full rounded-2xl border-2 border-burgundy/10 bg-alabaster px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-burgundy/35"
              autoFocus
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsPocketModalOpen(false);
                  setNewPocketName('');
                }}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-stone-700 transition-all hover:bg-alabaster"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void createPocket()}
                disabled={isPocketSaving || !normalizeSubcellar(newPocketName)}
                className="inline-flex items-center gap-2 rounded-xl bg-burgundy px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition-all hover:bg-burgundy-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPocketSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Anlegen
              </button>
            </div>
          </div>
        </div>
      )}

      {isAiModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl border border-burgundy/5 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-alabaster flex justify-between items-center bg-alabaster/30">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-burgundy text-white rounded-2xl shadow-burgundy-glow"><Wand2 className="w-6 h-6" /></div>
                <h3 className="font-serif text-2xl font-bold text-charcoal">Smart Assistant</h3>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="p-2"><X /></button>
            </div>
            <div className="p-10 space-y-10 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <input type="text" placeholder="Weinname & Jahrgang..." value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()} className="flex-1 px-6 py-4 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-serif" />
                  <button onClick={handleAiSearch} disabled={isAiLoading || !aiInput.trim()} className="px-8 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]">
                    {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'RECHERCHIEREN'}
                  </button>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={manualAdd} className="text-[10px] font-black text-stone-gray hover:text-burgundy uppercase tracking-widest">Manuell anlegen</button>
                  <button onClick={openJsonImportPicker} disabled={isJsonImporting} className="text-[10px] font-black text-stone-gray hover:text-burgundy uppercase tracking-widest disabled:opacity-50">
                    {isJsonImporting ? 'Import läuft...' : 'JSON importieren'}
                  </button>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">
                    Unterkeller (optional)
                  </p>
                  <input
                    list="subcellar-options"
                    type="text"
                    value={targetSubcellar}
                    onChange={(e) => setTargetSubcellar(e.target.value)}
                    placeholder={`${MAIN_CELLAR_LABEL} wenn leer`}
                    className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 text-sm text-charcoal"
                  />
                  <datalist id="subcellar-options">
                    {availableSubcellars.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="pt-2 border-t border-alabaster/80 space-y-3">
                  <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">
                    Oder JSON-Code einfügen
                  </p>
                  <textarea
                    value={jsonCodeInput}
                    onChange={(e) => setJsonCodeInput(e.target.value)}
                    placeholder='{"name":"...","vintage":2024,...} oder {"success":true,"data":{...}}'
                    rows={6}
                    className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-mono text-xs text-charcoal"
                  />
                  <button
                    onClick={handleJsonCodeImport}
                    disabled={isJsonImporting || !jsonCodeInput.trim()}
                    className="w-full py-3 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                  >
                    {isJsonImporting ? 'Import läuft...' : 'JSON-Code importieren'}
                  </button>
                </div>
              </div>
              {aiPreview && (
                <div className="animate-in slide-in-from-bottom-8 duration-700 space-y-8">
                  <div className="p-8 bg-white rounded-[2.5rem] border-2 border-burgundy/10 shadow-premium">
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="gold">Confidence: {aiPreview.confidence}</Badge>
                    </div>
                    <h4 className="font-serif text-3xl font-bold text-charcoal">{aiPreview.name}</h4>
                    <p className="text-gold font-serif text-2xl">{aiPreview.vintage}</p>

                    {sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-alabaster">
                        <p className="text-[9px] font-black uppercase tracking-widest text-stone-gray mb-2 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> Recherche-Quellen
                        </p>
                        <div className="flex wrap gap-2">
                          {sources.map((src, i) => (
                            <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-burgundy hover:underline font-bold">
                              {src.title} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={confirmAiAddition} className="w-full py-5 bg-burgundy text-white font-black rounded-2xl shadow-xl uppercase tracking-widest text-xs">Kellerübernahme</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPocketDashboard ? (
        <section className="rounded-[2rem] border-2 border-burgundy/5 bg-white p-6 shadow-premium">
          <div className="mb-5 flex flex-col gap-1">
            <h3 className="font-serif text-3xl text-charcoal">Hauptkeller Dashboard</h3>
            <p className="text-sm text-stone-gray">Wähle eine Pocket, um deren Weine zu öffnen.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pocketDashboardEntries.map((pocket) => {
              const percentage = allPocketBottleCount > 0
                ? Math.round((pocket.bottleCount / allPocketBottleCount) * 100)
                : 0;
              return (
                <button
                  key={pocket.id}
                  type="button"
                  onClick={() => setSubcellarFilter(pocket.id)}
                  className="rounded-2xl border border-burgundy/10 bg-alabaster/50 p-5 text-left transition-all hover:border-burgundy/30 hover:bg-white"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-gray">Pocket</p>
                  <p className="mt-1 font-serif text-2xl text-charcoal">{pocket.label}</p>
                  <p className="mt-3 text-sm text-stone-gray">{pocket.wineCount} Weine · {pocket.bottleCount} Flaschen</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-burgundy">{percentage}% vom Gesamtbestand</p>
                  <span className="mt-4 inline-flex rounded-lg border border-burgundy/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-burgundy">
                    Pocket öffnen
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : filteredWines.length > 0 ? (
        <div className="space-y-8 pb-20">
          {groupedWines.map((group) => (
            <section key={group.key} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-2xl text-charcoal">{group.label}</h3>
                <span className="text-xs uppercase tracking-[0.14em] text-stone-gray">
                  {group.wines.length} Weine · {group.bottleCount} Flaschen
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {group.wines.map((wine) => (
                  <div
                    key={wine.id}
                    draggable={!isMovingWine}
                    onDragStart={(event) => handleWineDragStart(event, wine)}
                    onDragEnd={handleWineDragEnd}
                    className={`transition-opacity ${draggedWineId === wine.id ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <WineCard wine={wine} onDrink={onDrink} onUpdate={onWineUpdate} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-burgundy/10">
          <Search className="w-16 h-16 text-burgundy/10 mb-6" />
          <p className="text-stone-gray max-w-sm mx-auto">Starten Sie Ihre Kollektion.</p>
        </div>
      )}
    </div>
  );
};

const FilterSelect = ({ value, onChange, options }: any) => (
  <select value={value} onChange={(e) => onChange(e.target.value as any)} className="px-6 py-3.5 bg-alabaster border-2 border-transparent rounded-[1.25rem] text-xs font-black text-charcoal focus:outline-none appearance-none hover:border-burgundy/10">
    {options.map((opt: any) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
  </select>
);
