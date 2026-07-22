
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Wine, Category, WineStatus } from '../../types.ts';
import { WineCard } from '../../components/WineCard.tsx';
import { ScannerOverlay } from '../../components/ScannerOverlay.tsx';
import { ScanResultDialog } from '../../components/ScanResultDialog.tsx';
import type { ScanResult } from '../../services/scanner.ts';
import { Search, Plus, X, Loader2, Wand2, Upload, Copy, Check, ScanBarcode } from 'lucide-react';
import { getWineFamily, getWineStatus } from '../../utils.ts';
import { storageService } from '../../services/storage.ts';
import { parseJsonInput } from '../../domain/wine/jsonParsers.ts';
import {
  getImportCandidates,
  normalizeImportedWine,
  normalizeSubcellar,
} from '../../domain/wine/normalization.ts';
import { validateWineInput } from '../../domain/wine/validation.ts';
import { findLikelyDuplicates } from '../../domain/wine/duplicateDetection.ts';
import { loadInventoryViewPreferences, saveInventoryViewPreferences, type InventorySort } from '../../services/inventoryViewPreferences.ts';

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
  const [sort, setSort] = useState<InventorySort>('name-asc');
  const [hydratedPreferenceScope, setHydratedPreferenceScope] = useState<{
    userId: string;
    view: 'inventory' | 'wishlist';
  } | null>(null);

  // Add wine modal states
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [isJsonImporting, setIsJsonImporting] = useState(false);
  const [jsonCodeInput, setJsonCodeInput] = useState('');
  const [targetSubcellar, setTargetSubcellar] = useState('');
  const [storedPocketNames, setStoredPocketNames] = useState<string[]>([]);
  const [isPocketModalOpen, setIsPocketModalOpen] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [isPocketSaving, setIsPocketSaving] = useState(false);
  const [draggedWineId, setDraggedWineId] = useState<string | null>(null);
  const [dropTargetPocketId, setDropTargetPocketId] = useState<string | null>(null);
  const [isMovingWine, setIsMovingWine] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanResultOpen, setIsScanResultOpen] = useState(false);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    let active = true;
    const view = wishlistOnly ? 'wishlist' : 'inventory';
    setHydratedPreferenceScope(null);

    const hydratePreferences = async () => {
      let userId = 'demo-user';
      try {
        const user = await storageService.getCurrentUser();
        userId = user?.id ?? userId;
      } catch (error) {
        console.warn('Could not resolve the user for inventory preferences.', error);
      }
      if (!active) return;

      const saved = loadInventoryViewPreferences(userId, view);
      setSearch(saved.search);
      setCategoryFilter(saved.category);
      setStatusFilter(saved.status);
      setSubcellarFilter(saved.subcellar);
      setSort(saved.sort);
      setHydratedPreferenceScope({ userId, view });
    };

    void hydratePreferences();
    return () => {
      active = false;
    };
  }, [wishlistOnly]);

  useEffect(() => {
    const currentView = wishlistOnly ? 'wishlist' : 'inventory';
    if (!hydratedPreferenceScope || hydratedPreferenceScope.view !== currentView) return;
    saveInventoryViewPreferences(hydratedPreferenceScope.userId, currentView, {
      search, category: categoryFilter, status: statusFilter, subcellar: subcellarFilter, sort
    });
  }, [categoryFilter, hydratedPreferenceScope, search, sort, statusFilter, subcellarFilter, wishlistOnly]);

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


  const openJsonImportPicker = () => {
    if (isJsonImporting) return;
    jsonFileInputRef.current?.click();
  };

  const importWinesFromJsonText = async (jsonText: string) => {
    setIsJsonImporting(true);
    try {
      const parsed = parseJsonInput(jsonText);
      const candidates = getImportCandidates(parsed);
      if (candidates.length === 0) {
        throw new Error('Keine importierbaren Weindaten gefunden.');
      }

      const mapped = candidates
        .map((entry: any, index: number) =>
          normalizeImportedWine(entry, { wishlistOnly, fallbackName: `Importierter Wein ${index + 1}` })
        )
        .filter((entry: Partial<Wine> | null): entry is Partial<Wine> => Boolean(entry));

      if (mapped.length === 0) {
        throw new Error('JSON erkannt, aber keine gültigen Weinobjekte enthalten.');
      }

      let saved = 0;
      let failed = 0;
      let invalid = 0;
      let duplicateSkipped = 0;
      const normalizedTargetSubcellar = normalizeSubcellar(targetSubcellar);
      const knownWines = [...wines];
      for (const wine of mapped) {
        const wineWithTarget = {
          ...wine,
          subcellar: normalizeSubcellar(wine.subcellar) || normalizedTargetSubcellar || undefined
        };

        if (validateWineInput(wineWithTarget).length > 0) {
          invalid += 1;
          continue;
        }

        if (findLikelyDuplicates(wineWithTarget, knownWines).length > 0) {
          duplicateSkipped += 1;
          continue;
        }

        try {
          const savedWine = await storageService.saveWine(wineWithTarget);
          knownWines.push(savedWine);
          saved += 1;
        } catch {
          failed += 1;
        }
      }

      await onWineUpdate();
      setIsAiModalOpen(false);
      setAiInput('');
      setJsonCodeInput('');
      setGeneratedPrompt('');
      setPromptCopied(false);

      if (failed > 0 || invalid > 0 || duplicateSkipped > 0) {
        const parts = [`${saved} Wein(e) importiert`];
        if (invalid > 0) parts.push(`${invalid} Eintrag/Einträge waren ungültig`);
        if (duplicateSkipped > 0) parts.push(`${duplicateSkipped} Eintrag/Einträge übersprungen (bereits im Keller)`);
        if (failed > 0) parts.push(`${failed} Eintrag/Einträge konnten nicht gespeichert werden`);
        alert(`${parts.join(', ')}.`);
      } else {
        alert(`${saved} Wein(e) erfolgreich importiert und global verfügbar.`);
      }
    } catch (error: any) {
      console.error('JSON import failed:', error);
      alert(`JSON-Import fehlgeschlagen: ${error?.message || 'Ungültige Datei.'}\n\nTipp: Nur JSON einfügen oder den generierten Prompt nutzen und die Antwort 1:1 kopieren.`);
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
    }).sort((a, b) => {
      if (sort === 'vintage-desc') return b.vintage - a.vintage || a.name.localeCompare(b.name, 'de');
      if (sort === 'value-desc') return (b.market_price ?? b.purchase_price) - (a.market_price ?? a.purchase_price) || a.name.localeCompare(b.name, 'de');
      if (sort === 'quantity-desc') return b.quantity - a.quantity || a.name.localeCompare(b.name, 'de');
      return a.name.localeCompare(b.name, 'de');
    });
  }, [wines, search, categoryFilter, statusFilter, subcellarFilter, wishlistOnly, presetView, sort]);

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

  const buildPromptForWine = (wineQuery: string): string => {
    const target = wineQuery.trim();
    return `Du bist ein Wein-Daten-Assistent. Erzeuge nur valides JSON ohne Markdown und ohne Zusatztext.

Suche nach diesem Wein:
"${target}"

Liefere exakt dieses Schema:
{
  "name": string,
  "producer": string|null,
  "vintage": number|null,
  "country": string|null,
  "region": string|null,
  "appellation": string|null,
  "vineyard": string|null,
  "wine_type": string|null,
  "format": string|null,
  "quantity": number,
  "purchase_price": number,
  "market_price": number|null,
  "drink_start": number|null,
  "peak_year": number|null,
  "drink_end": number|null,
  "alcohol_percent": number|null,
  "closure_type": string|null,
  "grapes": [{"name": string, "percentage": number|null}],
  "aromas": [{"tag": string, "intensity": number|null}],
  "structure": {"acidity": number|null, "tannin": number|null, "body": number|null, "sweetness": number|null, "oak": number|null},
  "pairings": [{"item": string, "category": string|null, "note": string|null}],
  "scores": [{"critic": string, "score": number|string, "year": number|null}],
  "short_description_de": string|null,
  "sources": [{"title": string, "url": string}],
  "confidence": "high"|"medium"|"low",
  "missing_fields": string[]
}

Regeln:
- Keine Felder außerhalb des Schemas.
- Fehlende Werte als null setzen.
- "quantity" standardmäßig 1.
- Zahlen als JSON-Zahl ausgeben (nicht als String).
- Antwortsprache für Texte: Deutsch.
`;
  };

  const handleGeneratePrompt = () => {
    const query = aiInput.trim();
    if (!query) return;
    setGeneratedPrompt(buildPromptForWine(query));
    setPromptCopied(false);
  };

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      alert('Prompt konnte nicht kopiert werden.');
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
      await storageService.transferWine(
        wine.id,
        targetPocketId === MAIN_CELLAR_FILTER ? '' : targetPocketId
      );
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
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-5 py-3.5 bg-white border-2 border-burgundy/15 text-burgundy font-black rounded-2xl transition-all hover:border-burgundy/30 uppercase tracking-wider text-[10px]"
          >
            <ScanBarcode className="w-4 h-4" /> SCANNEN
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
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Kategorie" value={categoryFilter} onChange={setCategoryFilter} options={[{ label: 'Alle Kategorien', value: 'All' }, { label: 'Genuss', value: 'Genuss' }, { label: 'Investment', value: 'Investment' }, { label: 'Rarität', value: 'Rarität' }]} />
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ label: 'Jeder Status', value: 'All' }, { label: 'Trinkreif', value: WineStatus.READY }, { label: 'Lagernd', value: WineStatus.HOLD }, { label: 'Vergangen', value: WineStatus.PAST_PEAK }]} />
          <FilterSelect label="Sortierung" value={sort} onChange={setSort} options={[{ label: 'Name A–Z', value: 'name-asc' }, { label: 'Neuester Jahrgang', value: 'vintage-desc' }, { label: 'Höchster Wert', value: 'value-desc' }, { label: 'Meiste Flaschen', value: 'quantity-desc' }]} />
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
                className={`rounded-xl border px-3 py-2 text-left transition-all ${isDropTarget
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
                <h3 className="font-serif text-2xl font-bold text-charcoal">Prompt für Weinrecherche</h3>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="p-2"><X /></button>
            </div>
            <div className="p-10 space-y-10 overflow-y-auto">
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest">
                    1) Wein eingeben
                  </p>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      placeholder="Weinname & Jahrgang..."
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGeneratePrompt()}
                      className="flex-1 px-6 py-4 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-serif"
                    />
                    <button
                      onClick={handleGeneratePrompt}
                      disabled={!aiInput.trim()}
                      className="px-8 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                    >
                      PROMPT ERSTELLEN
                    </button>
                  </div>
                </div>

                {generatedPrompt ? (
                  <div className="space-y-3 rounded-2xl border border-burgundy/10 bg-alabaster/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest">
                        2) Prompt kopieren
                      </p>
                      <button
                        onClick={handleCopyPrompt}
                        className="inline-flex items-center gap-2 rounded-xl border border-burgundy/25 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-burgundy hover:bg-burgundy/5"
                      >
                        {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {promptCopied ? 'Kopiert' : 'Kopieren'}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={generatedPrompt}
                      rows={12}
                      className="w-full px-4 py-3 bg-white border-2 border-burgundy/10 rounded-2xl font-mono text-xs text-charcoal"
                    />
                    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs text-stone-600">
                      <p className="font-semibold text-stone-700">So gehst du vor:</p>
                      <ol className="mt-2 list-decimal pl-4 space-y-1">
                        <li>Prompt in ChatGPT oder ein anderes Tool einfügen.</li>
                        <li>Nur JSON als Antwort erzeugen lassen.</li>
                        <li>JSON unten einfügen und mit „JSON-Code importieren“ übernehmen.</li>
                      </ol>
                    </div>
                  </div>
                ) : null}

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

      {/* Scanner */}
      <ScannerOverlay
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onResult={(result) => {
          setIsScannerOpen(false);
          setScanResult(result);
          setIsScanResultOpen(true);
        }}
      />
      <ScanResultDialog
        open={isScanResultOpen}
        result={scanResult}
        onClose={() => { setIsScanResultOpen(false); setScanResult(null); }}
        onSaved={() => { setIsScanResultOpen(false); setScanResult(null); onWineUpdate(); }}
        wishlist={wishlistOnly}
        targetSubcellar={subcellarFilter === 'All' || subcellarFilter === MAIN_CELLAR_FILTER ? '' : subcellarFilter}
        existingWines={wines}
      />
    </div>
  );
};

interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}

const FilterSelect = <T extends string>({ label, value, onChange, options }: FilterSelectProps<T>) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="min-w-0 flex-1 px-4 sm:px-6 py-3.5 bg-alabaster border-2 border-transparent rounded-[1.25rem] text-xs font-black text-charcoal focus:outline-none appearance-none hover:border-burgundy/10">
    {options.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
  </select>
);
