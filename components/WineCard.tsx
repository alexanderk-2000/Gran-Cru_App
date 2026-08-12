
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, WineStatus } from '../types.ts';
import { getBottleUnitValue, getWineMaturity, formatCurrency, hasKnownPrice } from '../utils.ts';
import { Calendar, ShoppingCart, Plus, Minus, ChevronRight, Trash2, GlassWater, MapPin } from 'lucide-react';
import { storageService } from '../services/storage.ts';
import { useToast, useConfirm } from './Feedback.tsx';

interface WineCardProps {
  wine: Wine;
  /** Opens the "bottle opened" dialog (stock + rating + note) owned by the page. */
  onOpenBottle?: (wine: Wine) => void;
  /** Opens the "move to pocket" dialog owned by the page - the tap-based counterpart to drag-and-drop. */
  onMove?: (wine: Wine) => void;
  onEdit?: (wine: Wine) => void;
  onUpdate?: () => void;
}

export const WineCard: React.FC<WineCardProps> = ({ wine, onOpenBottle, onMove, onUpdate }) => {
  const showToast = useToast();
  const confirmDelete = useConfirm();
  const maturity = getWineMaturity(wine);
  const status = maturity.status;
  const isReady = status === WineStatus.READY;
  const isEmpty = wine.quantity === 0;
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const normalizedTitle = (wine.name || '').replace(/\s+/g, ' ').trim() || 'Unbenannter Wein';

  const getTopBarClass = () => {
    const type = (wine.wine_type || '').toLowerCase();
    if (type.includes('rot') || type.includes('red')) {
      return 'bg-gradient-to-r from-red-800/80 via-red-600/80 to-red-800/80';
    }
    if (type.includes('weiß') || type.includes('weiss') || type.includes('white')) {
      return 'bg-gradient-to-r from-amber-200/90 via-yellow-100/95 to-amber-200/90';
    }
    if (type.includes('ros')) {
      return 'bg-gradient-to-r from-rose-300/85 via-pink-200/90 to-rose-300/85';
    }
    if (type.includes('schaum') || type.includes('sparkling') || type.includes('champ')) {
      return 'bg-gradient-to-r from-yellow-300/85 via-amber-200/90 to-yellow-300/85';
    }
    return 'bg-gradient-to-r from-gold/70 via-burgundy/60 to-gold/70';
  };

  const handleAdjust = async (e: React.MouseEvent, delta: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAdjusting) return;
    if (delta < 0 && wine.quantity <= 0) return;

    try {
      setIsAdjusting(true);
      await storageService.adjustStock(wine.id, delta, 'dashboard');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      showToast(error?.message || 'Bestand konnte nicht aktualisiert werden.', 'error');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleOpenBottle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onOpenBottle || wine.quantity <= 0) return;
    onOpenBottle(wine);
  };

  const handleMove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onMove) return;
    onMove(wine);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    const confirmed = await confirmDelete({
      title: 'In den Papierkorb verschieben?',
      description: `"${wine.name}" landet im Papierkorb und lässt sich dort wiederherstellen.`,
      confirmLabel: 'Verschieben',
      destructive: true
    });
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      await storageService.softDeleteWine(wine.id, 'Aus Kartenansicht gelöscht');
      showToast(`"${wine.name}" wurde in den Papierkorb verschoben.`, 'success');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      showToast(error?.message || 'Löschen fehlgeschlagen.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // The badge shows the model's finer verdict ("Optimal", "Anlaufphase") in the
  // colour of its coarse bucket, plus a marker when the verdict rests on thin
  // data - a wine without a drinking window is no longer silently "Trinkreif".
  const getStatusBadge = () => {
    const label = maturity.label;
    const title = maturity.explanation;
    const base = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border';

    switch (status) {
      case WineStatus.READY:
        return <span title={title} className={`${base} bg-sage-light text-sage border-sage`}>{label}</span>;
      case WineStatus.HOLD:
        return <span title={title} className={`${base} bg-alabaster text-gold border-gold`}>{label}</span>;
      case WineStatus.PAST_PEAK:
        return <span title={title} className={`${base} bg-red-50 text-red-700 border-red-200`}>{label}</span>;
      case WineStatus.UNKNOWN:
      default:
        return (
          <span title={title} className={`${base} bg-stone-100 text-stone-500 border-stone-300`}>
            Kein Fenster
          </span>
        );
    }
  };

  const wineImage = (wine as any).ai_details?.app?.images?.bottle
    || (wine as any).ai_details?.app?.images?.label
    || (wine as any).ai_details?.app?.images?.case
    || null;

  return (
    <div className={`
      relative group h-full overflow-hidden rounded-3xl border transition-all duration-500 bg-white shadow-premium
      ${isReady ? 'border-gold/30 ring-1 ring-gold/10' : 'border-burgundy/5'}
      ${isEmpty ? 'opacity-60 grayscale' : 'hover:scale-[1.01] hover:shadow-xl'}
    `}>
      {/* Thumbnail hero or color accent bar */}
      {wineImage ? (
        <div className="relative h-28 w-full overflow-hidden">
          <img src={wineImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
          <div className={`absolute inset-x-0 top-0 h-1 ${getTopBarClass()}`} />
        </div>
      ) : (
        <div className={`absolute inset-x-0 top-0 h-1 ${getTopBarClass()}`} />
      )}
      <div className="flex h-full flex-col p-5">
        <div className={`mb-3 flex ${wineImage ? 'min-h-[80px]' : 'min-h-[124px]'} justify-between items-start gap-4`}>
          <Link to={`/wine/${wine.id}`} className="flex-1 min-w-0 flex flex-col group/title">
            <span className="text-xs font-medium text-stone-gray uppercase tracking-widest mb-1">{wine.region}</span>
            {wine.subcellar ? (
              <span className="mb-1 inline-flex w-fit rounded-full border border-burgundy/15 bg-burgundy/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-burgundy">
                {wine.subcellar}
              </span>
            ) : null}
            <div className="relative">
              <h3
                className="pr-6 font-serif text-xl font-bold leading-[1.15] text-charcoal group-hover/title:text-burgundy transition-colors break-words"
                title={wine.name}
              >
                {normalizedTitle}
              </h3>
              <ChevronRight className="pointer-events-none absolute right-0 top-1 h-4 w-4 opacity-0 group-hover/title:opacity-100 transition-all translate-x-[-4px] group-hover/title:translate-x-0" />
            </div>
            <span className="mt-1 min-h-[1.1rem] text-[11px] text-stone-gray break-words">{wine.producer || 'Unbekanntes Weingut'}</span>
          </Link>
          <div className="flex min-h-[76px] flex-col items-end justify-between gap-2 shrink-0">
            <span className="font-serif text-lg font-bold text-burgundy">{wine.vintage}</span>
            {getStatusBadge()}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 border-y border-alabaster py-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-stone-gray">
              <span className="text-[10px] font-black uppercase tracking-widest">Stock</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => handleAdjust(e, -1)}
                disabled={wine.quantity === 0 || isAdjusting}
                className="p-1 rounded bg-alabaster border border-burgundy/5 hover:border-burgundy/20 text-burgundy disabled:opacity-30 transition-all"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-sm font-bold text-charcoal">{wine.quantity} <span className="text-[10px] text-stone-gray font-normal">Fl.</span></span>
              <button
                onClick={(e) => handleAdjust(e, 1)}
                disabled={isAdjusting}
                className="p-1 rounded bg-alabaster border border-burgundy/5 hover:border-burgundy/20 text-burgundy disabled:opacity-30 transition-all"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-gray">
              {hasKnownPrice(wine) && wine.market_price ? 'Marktwert' : 'Einstand'}
            </span>
            <span className="text-sm font-bold text-charcoal">{formatCurrency(getBottleUnitValue(wine))}</span>
          </div>
          <div className="flex items-center gap-2 col-span-2 text-stone-gray">
            <Calendar className="w-4 h-4 text-gold" />
            <span className="text-sm">Fenster: <span className="font-medium text-charcoal">{wine.drink_start} – {wine.drink_end}</span></span>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Link
            to={`/wine/${wine.id}?action=buy`}
            className="flex-1 py-2 bg-white border border-burgundy/10 hover:border-burgundy/30 text-burgundy text-[10px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-3 h-3" />
            Kaufen
          </Link>
          <button
            onClick={handleOpenBottle}
            disabled={!onOpenBottle || wine.quantity <= 0}
            className="py-2 bg-sage-light border border-sage/30 hover:bg-sage/10 text-sage text-[10px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <GlassWater className="w-3 h-3" />
            Öffnen
          </button>
          <Link
            to={`/wine/${wine.id}`}
            className="px-4 py-2 bg-burgundy hover:bg-burgundy-light text-white text-[10px] font-black rounded-lg transition-colors flex items-center justify-center uppercase tracking-widest"
          >
            Details
          </Link>
          <button
            onClick={handleMove}
            disabled={!onMove}
            className="py-2 bg-white border border-burgundy/10 hover:border-burgundy/30 text-burgundy text-[10px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <MapPin className="w-3 h-3" />
            Verschieben
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="col-span-2 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-700 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Trash2 className="w-3 h-3" />
            {isDeleting ? 'Löscht...' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
};
