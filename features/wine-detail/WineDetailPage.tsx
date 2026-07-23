import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapPin, Minus, Plus } from 'lucide-react';
import { storageService } from '../../services/storage.ts';
import { imageStorageService, type ImageSlot } from '../../services/imageStorage.ts';
import { formatCurrency } from '../../utils.ts';
import { Tasting, Wine } from '../../types.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { WineCaptureForm } from '../wine-capture/WineCaptureForm.tsx';
import {
  type PairingItem,
  toNullableNumber,
  normalizeError,
  computeWindowMetrics,
  buildRatings,
  buildSourceLinks,
  buildAromas,
  buildStructureRows,
  buildQuickFacts,
  buildProfessionalFacts,
  buildHeaderDescription
} from './wineDetailSelectors.ts';
import { ACCENT_BURGUNDY, LUXURY_BG } from './colors.ts';
import type { TabId } from './tabs.ts';
import type { ToastMessage, ToastTone } from './toast.ts';
import { InlineToast } from './components/InlineToast.tsx';
import { DetailSkeleton } from './components/DetailSkeleton.tsx';
import { StickyTabNav } from './components/StickyTabNav.tsx';
import { HeaderCard } from './components/HeaderCard.tsx';
import { DrinkingWindowCard } from './components/DrinkingWindowCard.tsx';
import { ShortDescriptionCard } from './components/ShortDescriptionCard.tsx';
import { FactsDefinitionList } from './components/FactsDefinitionList.tsx';
import { ProfessionalFactsCard } from './components/ProfessionalFactsCard.tsx';
import { RatingsCard } from './components/RatingsCard.tsx';
import { AromaCard } from './components/AromaCard.tsx';
import { StructureCard } from './components/StructureCard.tsx';
import { PairingsCard } from './components/PairingsCard.tsx';
import { NotesTimeline } from './components/NotesTimeline.tsx';
import { SourceFooter } from './components/SourceFooter.tsx';
import { TerroirRow } from './components/TerroirRow.tsx';

export const WineDetail: React.FC<{ onDrink: (wine: Wine) => void }> = ({ onDrink }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [wine, setWine] = useState<Wine | null>(null);
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [isSaving, setIsSaving] = useState(false);

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState('0');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastTone) => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      if (!id) {
        navigate('/inventory');
        return;
      }

      setLoading(true);
      try {
        const loadedWine = await storageService.getWineById(id);
        if (!active) return;

        if (!loadedWine) {
          navigate('/inventory');
          return;
        }

        setWine(loadedWine);
        setPurchasePrice(String(loadedWine.purchase_price ?? 0));

        const history = await storageService.getTastings(id);
        if (!active) return;
        setTastings(history);
      } catch (error) {
        if (!active) return;
        showToast(normalizeError(error, 'Weindaten konnten nicht geladen werden.'), 'error');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [id, navigate, showToast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'buy') {
      setIsPurchaseModalOpen(true);
    }
  }, [location.search]);

  const aiDetails = useMemo(() => wine?.ai_details, [wine?.ai_details]);
  const metrics = useMemo(() => (wine ? computeWindowMetrics(wine) : null), [wine]);
  const ratings = useMemo(() => buildRatings(wine?.scores), [wine?.scores]);
  const sources = useMemo(() => buildSourceLinks(wine?.ai_sources), [wine?.ai_sources]);
  const aromas = useMemo(() => buildAromas(wine?.aromas), [wine?.aromas]);
  const structureRows = useMemo(() => (wine ? buildStructureRows(wine, aiDetails) : null), [wine, aiDetails]);
  const quickFacts = useMemo(() => (wine ? buildQuickFacts(wine, aiDetails) : []), [wine, aiDetails]);
  const professionalFacts = useMemo(() => (wine ? buildProfessionalFacts(wine, aiDetails) : []), [wine, aiDetails]);
  const headerDescription = useMemo(() => (wine ? buildHeaderDescription(wine, aiDetails) : null), [wine, aiDetails]);
  const pairings = useMemo<PairingItem[]>(
    () =>
      (wine?.pairings ?? []).map((item) => ({
        item: item.item,
        category: item.category,
        note: item.note
      })),
    [wine?.pairings]
  );
  const handleJumpToSection = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const target = document.getElementById(`section-${tab}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const canMutate = !isSaving;
  const openEditModal = useCallback(() => {
    if (!wine) return;
    setIsEditModalOpen(true);
  }, [wine]);

  const handleAdjustStock = useCallback(
    async (delta: number) => {
      if (!wine || !canMutate) return;

      setIsSaving(true);
      try {
        const updated = await storageService.adjustStock(wine.id, delta, 'detail');
        if (updated) {
          setWine(updated as Wine);
        }
      } catch (error) {
        showToast(normalizeError(error, 'Bestand konnte nicht aktualisiert werden.'), 'error');
      } finally {
        setIsSaving(false);
      }
    },
    [wine, canMutate, showToast]
  );

  const handleRegisterPurchase = useCallback(async () => {
    if (!wine || !canMutate) return;

    const qty = Math.max(1, Math.round(toNullableNumber(purchaseQty) ?? 1));
    const price = Math.max(0, toNullableNumber(purchasePrice) ?? 0);

    setIsSaving(true);
    try {
      const updated = await storageService.recordPurchase({
        wine_id: wine.id,
        quantity: qty,
        price_per_bottle: price,
        date: new Date().toISOString()
      });

      if (updated) {
        setWine(updated);
        setIsPurchaseModalOpen(false);
        setPurchaseQty(1);
        showToast('Nachkauf gespeichert.', 'success');
      }
    } catch (error) {
      showToast(normalizeError(error, 'Nachkauf konnte nicht gespeichert werden.'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [wine, canMutate, purchaseQty, purchasePrice, showToast]);

  const handleDelete = useCallback(async () => {
    if (!wine || !canMutate) return;
    if (!window.confirm('Diesen Wein in den Papierkorb verschieben?')) return;

    setIsSaving(true);
    try {
      await storageService.softDeleteWine(wine.id, 'Manuell gelöscht');
      showToast('Wein wurde in den Papierkorb verschoben.', 'success');
      navigate('/inventory');
    } catch (error) {
      showToast(normalizeError(error, 'Löschen fehlgeschlagen.'), 'error');
      setIsSaving(false);
    }
  }, [wine, canMutate, navigate, showToast]);

  const wineImages = useMemo<Record<ImageSlot, string | null>>(
    () => (wine ? imageStorageService.getImagesFromWine(wine) : { bottle: null, label: null, case: null }),
    [wine]
  );
  const heroImage = wineImages.bottle || wineImages.label || wineImages.case;

  if (loading) {
    return (
      <>
        <InlineToast message={toast} onClose={() => setToast(null)} />
        <DetailSkeleton />
      </>
    );
  }

  if (!wine || !metrics || !structureRows) {
    return (
      <div className="min-h-screen px-6 py-12" style={{ backgroundColor: LUXURY_BG }}>
        <InlineToast message={toast} onClose={() => setToast(null)} />
        <div className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 text-center">
          <h2 className="font-serif text-2xl text-stone-900">Wein nicht gefunden</h2>
          <p className="mt-2 text-sm text-stone-500">Der Datensatz ist nicht verfügbar oder wurde gelöscht.</p>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="mt-6 rounded-full border border-stone-300 px-5 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ backgroundColor: LUXURY_BG }}>
      <InlineToast key={toast?.id ?? 0} message={toast} onClose={() => setToast(null)} />

      {/* Hero wine image */}
      {heroImage && (
        <div className="relative w-full h-64 md:h-80 overflow-hidden">
          <img
            src={heroImage}
            alt={wine.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#FDFBF7] via-transparent to-transparent" />
        </div>
      )}

      <HeaderCard
        wine={wine}
        isSaving={isSaving}
        onBack={() => navigate(-1)}
        onOpenEdit={openEditModal}
        onOpenPurchase={() => setIsPurchaseModalOpen(true)}
        onDelete={handleDelete}
        onDrink={() => onDrink(wine)}
        onAdjust={handleAdjustStock}
      />

      <main className="mx-auto max-w-6xl px-6">
        <StickyTabNav active={activeTab} onChange={handleJumpToSection} tastingCount={tastings.length} />

        <div className="mt-8 space-y-8">
          <section id="section-overview" className="space-y-6 scroll-mt-24">
            <ShortDescriptionCard description={headerDescription} />
            <DrinkingWindowCard metrics={metrics} />
            <div className="grid gap-6 xl:grid-cols-12">
              <div className="space-y-6 xl:col-span-8">
                <ProfessionalFactsCard items={professionalFacts} />
              </div>
              <div className="space-y-6 xl:col-span-4">
                <FactsDefinitionList items={quickFacts} />
                <RatingsCard ratings={ratings} />
              </div>
            </div>
          </section>

          <section id="section-terroir" className="grid gap-6 scroll-mt-24 lg:grid-cols-2">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 flex items-center gap-2 font-serif text-xl text-stone-900">
                <MapPin className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Herkunft & Terroir
              </h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Region" value={wine.region} />
                <TerroirRow label="Subregion" value={aiDetails?.identification?.subregion} />
                <TerroirRow label="Appellation" value={wine.appellation} />
                <TerroirRow label="Boden" value={aiDetails?.terroir?.soil_types?.join(', ')} />
                <TerroirRow label="Klima" value={aiDetails?.terroir?.climate} />
                <TerroirRow label="Exposition" value={aiDetails?.terroir?.exposure} />
              </dl>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 font-serif text-xl text-stone-900">Ausbau</h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Gärung" value={wine.fermentation ?? aiDetails?.vinification?.fermentation_vessel} />
                <TerroirRow label="Ausbau" value={wine.aging_process ?? aiDetails?.vinification?.aging_vessel} />
                <TerroirRow label="Holztyp" value={aiDetails?.vinification?.oak_type} />
                <TerroirRow label="Monate" value={aiDetails?.vinification?.aging_months ? `${aiDetails.vinification.aging_months} Monate` : null} />
                <TerroirRow label="Anbau" value={wine.farming} />
              </dl>
            </section>
          </section>

          <section id="section-sensory" className="space-y-6 scroll-mt-24">
            <div className="grid gap-6 lg:grid-cols-2">
              <AromaCard aromas={aromas} />
              <StructureCard rows={structureRows} />
            </div>
            <PairingsCard pairings={pairings} />
          </section>

          <section id="section-cellar" className="scroll-mt-24">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
              <h3 className="mb-4 font-serif text-xl text-stone-900">Bestand & Einkauf</h3>
              <dl className="space-y-2 text-sm">
                <TerroirRow label="Bestand" value={`${wine.quantity} Flaschen`} />
                <TerroirRow label="Unterkeller" value={wine.subcellar} />
                <TerroirRow label="Einstand" value={formatCurrency(wine.purchase_price ?? 0)} />
                <TerroirRow label="Marktpreis" value={wine.market_price ? formatCurrency(wine.market_price) : null} />
                <TerroirRow label="Kaufquelle" value={aiDetails?.cellar?.purchase_source} />
                <TerroirRow label="Lagerort" value={aiDetails?.cellar?.storage_location} />
              </dl>
            </section>
          </section>

          <section id="section-notes" className="scroll-mt-24">
            <NotesTimeline tastings={tastings} onCreateNote={() => onDrink(wine)} disabled={!canMutate || wine.quantity <= 0} />
          </section>
        </div>
      </main>

      <SourceFooter sources={sources} />

      <Dialog open={isPurchaseModalOpen} title="Nachkauf" onClose={() => setIsPurchaseModalOpen(false)}>
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
            <button
              type="button"
              onClick={() => setPurchaseQty((prev) => Math.max(1, prev - 1))}
              className="rounded-full p-2 text-stone-700 hover:bg-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="font-serif text-2xl text-stone-900">{purchaseQty}</span>
            <button type="button" onClick={() => setPurchaseQty((prev) => prev + 1)} className="rounded-full p-2 text-stone-700 hover:bg-white">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <label className="block text-sm text-stone-700">
            Preis pro Flasche
            <input
              type="text"
              inputMode="decimal"
              placeholder="z. B. 8,99"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
            />
          </label>

          <button
            type="button"
            onClick={handleRegisterPurchase}
            disabled={!canMutate}
            className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACCENT_BURGUNDY }}
          >
            Speichern
          </button>
        </div>
      </Dialog>

      <WineCaptureForm
        open={isEditModalOpen}
        mode="edit"
        wine={wine}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={(updated) => {
          setWine(updated);
          setIsEditModalOpen(false);
          showToast('Wein wurde gespeichert.', 'success');
        }}
        onWineImagesChanged={(updated) => {
          setWine(updated);
          showToast('Bild aktualisiert.', 'success');
        }}
      />
    </div>
  );
};
