import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Wine, WineStatus } from '../../types.ts';
import { WineCard } from '../../components/WineCard.tsx';
import { ScannerOverlay } from '../../components/ScannerOverlay.tsx';
import { ScanResultDialog } from '../../components/ScanResultDialog.tsx';
import { WineCaptureForm } from '../wine-capture/WineCaptureForm.tsx';
import { FilterSelect } from '../../components/FilterSelect.tsx';
import type { ScanResult } from '../../services/scanner.ts';
import { Plus, ScanBarcode, Search, Upload } from 'lucide-react';
import { MAIN_CELLAR_FILTER } from './constants.ts';
import { filterAndSortWines, groupWinesBySubcellar, PRESET_VIEWS, type PresetView } from './inventorySelectors.ts';
import { useInventoryViewPreferences } from './hooks/useInventoryViewPreferences.ts';
import { usePockets } from './hooks/usePockets.ts';
import { PocketBar } from './components/PocketBar.tsx';
import { CreatePocketModal } from './components/CreatePocketModal.tsx';
import { PocketDashboard } from './components/PocketDashboard.tsx';
import { JsonImportModal } from './components/JsonImportModal.tsx';

interface InventoryProps {
  wines: Wine[];
  wishlistOnly?: boolean;
  onWineUpdate: () => void;
  onAddBottle: (wine: Partial<Wine>) => void;
  onDrink: (wine: Wine) => void;
}

export const Inventory: React.FC<InventoryProps> = ({ wines, wishlistOnly = false, onDrink, onWineUpdate }) => {
  const location = useLocation();
  const { search, setSearch, categoryFilter, setCategoryFilter, statusFilter, setStatusFilter, subcellarFilter, setSubcellarFilter, sort, setSort } =
    useInventoryViewPreferences(wishlistOnly);
  const pockets = usePockets(wines, wishlistOnly, onWineUpdate);

  const [isJsonImportModalOpen, setIsJsonImportModalOpen] = useState(false);
  const [isCaptureFormOpen, setIsCaptureFormOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanResultOpen, setIsScanResultOpen] = useState(false);

  const presetView = useMemo<PresetView | null>(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view && PRESET_VIEWS.has(view)) return view as PresetView;
    return null;
  }, [location.search]);

  const presetMeta = useMemo(() => {
    if (wishlistOnly) {
      return { title: 'Wunschliste', subtitle: 'Geplante Ergänzungen.' };
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

  const filteredWines = useMemo(
    () => filterAndSortWines(wines, { wishlistOnly, presetView, search, categoryFilter, statusFilter, subcellarFilter, sort }),
    [wines, wishlistOnly, presetView, search, categoryFilter, statusFilter, subcellarFilter, sort]
  );

  const groupedWines = useMemo(() => groupWinesBySubcellar(filteredWines), [filteredWines]);

  const showPocketDashboard = !wishlistOnly && !presetView && subcellarFilter === 'All';
  const allPocketBottleCount = pockets.pocketSummaries.find((item) => item.id === 'All')?.bottleCount ?? 0;
  const pocketDashboardEntries = pockets.pocketSummaries.filter((item) => item.id !== 'All');

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-4xl font-bold text-charcoal">{presetMeta.title}</h2>
          <p className="text-stone-gray font-medium tracking-wide">{presetMeta.subtitle}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsJsonImportModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3.5 bg-white border-2 border-burgundy/15 text-burgundy font-black rounded-2xl transition-all hover:border-burgundy/30 uppercase tracking-wider text-[10px]"
          >
            <Upload className="w-4 h-4" /> JSON IMPORT
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
              pockets.setTargetSubcellar(mappedFromFilter);
              setIsCaptureFormOpen(true);
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
            type="text"
            placeholder="Kollektion durchsuchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-alabaster border-2 border-transparent rounded-[1.25rem] text-sm focus:outline-none focus:border-burgundy/20 transition-all font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Kategorie"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { label: 'Alle Kategorien', value: 'All' },
              { label: 'Genuss', value: 'Genuss' },
              { label: 'Investment', value: 'Investment' },
              { label: 'Rarität', value: 'Rarität' }
            ]}
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: 'Jeder Status', value: 'All' },
              { label: 'Trinkreif', value: WineStatus.READY },
              { label: 'Lagernd', value: WineStatus.HOLD },
              { label: 'Vergangen', value: WineStatus.PAST_PEAK }
            ]}
          />
          <FilterSelect
            label="Sortierung"
            value={sort}
            onChange={setSort}
            options={[
              { label: 'Name A–Z', value: 'name-asc' },
              { label: 'Neuester Jahrgang', value: 'vintage-desc' },
              { label: 'Höchster Wert', value: 'value-desc' },
              { label: 'Meiste Flaschen', value: 'quantity-desc' }
            ]}
          />
        </div>
      </div>

      <PocketBar
        pocketSummaries={pockets.pocketSummaries}
        subcellarFilter={subcellarFilter}
        draggedWineId={pockets.draggedWineId}
        dropTargetPocketId={pockets.dropTargetPocketId}
        onSelectPocket={setSubcellarFilter}
        onOpenCreateModal={() => pockets.setIsPocketModalOpen(true)}
        onDragOver={pockets.handlePocketDragOver}
        onDrop={pockets.handlePocketDrop}
        onDragEnter={pockets.handlePocketDragEnter}
        onDragLeave={pockets.handlePocketDragLeave}
      />

      <CreatePocketModal
        open={pockets.isPocketModalOpen}
        newPocketName={pockets.newPocketName}
        onNewPocketNameChange={pockets.setNewPocketName}
        isPocketSaving={pockets.isPocketSaving}
        onCreate={async () => {
          const created = await pockets.createPocket();
          if (created) setSubcellarFilter(created);
        }}
        onClose={() => {
          pockets.setIsPocketModalOpen(false);
          pockets.setNewPocketName('');
        }}
      />

      <JsonImportModal
        open={isJsonImportModalOpen}
        onClose={() => setIsJsonImportModalOpen(false)}
        wines={wines}
        wishlistOnly={wishlistOnly}
        onImported={onWineUpdate}
        targetSubcellar={pockets.targetSubcellar}
        onTargetSubcellarChange={pockets.setTargetSubcellar}
        availableSubcellars={pockets.availableSubcellars}
      />

      {showPocketDashboard ? (
        <PocketDashboard entries={pocketDashboardEntries} totalBottleCount={allPocketBottleCount} onSelectPocket={setSubcellarFilter} />
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
                    draggable={!pockets.isMovingWine}
                    onDragStart={(event) => pockets.handleWineDragStart(event, wine)}
                    onDragEnd={pockets.handleWineDragEnd}
                    className={`transition-opacity ${pockets.draggedWineId === wine.id ? 'opacity-50' : 'opacity-100'}`}
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
      <WineCaptureForm
        open={isCaptureFormOpen}
        mode="create"
        existingWines={wines}
        wishlist={wishlistOnly}
        targetSubcellar={pockets.targetSubcellar}
        onClose={() => setIsCaptureFormOpen(false)}
        onSaved={() => { setIsCaptureFormOpen(false); onWineUpdate(); }}
      />
    </div>
  );
};
