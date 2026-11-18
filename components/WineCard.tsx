
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, WineStatus } from '../types.ts';
import { getWineStatus, formatCurrency } from '../utils.ts';
import { ShoppingCart, Plus, Minus, Trash2, GlassWater } from 'lucide-react';
import { storageService } from '../services/storage.ts';

interface WineCardProps {
  wine: Wine;
  onDrink?: (wine: Wine) => void;
  onEdit?: (wine: Wine) => void;
  onUpdate?: () => void;
}

export const WineCard: React.FC<WineCardProps> = ({ wine, onDrink, onUpdate }) => {
  const status = getWineStatus(wine);
  const isEmpty = wine.quantity === 0;
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDrinking, setIsDrinking] = useState(false);
  const normalizedTitle = (wine.name || '').replace(/\s+/g, ' ').trim() || 'Unbenannter Wein';

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
      alert(error?.message || 'Bestand konnte nicht aktualisiert werden.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleDrink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDrink || wine.quantity <= 0 || isDrinking) return;

    try {
      setIsDrinking(true);
      await onDrink(wine);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      alert(error?.message || 'Trinkvorgang fehlgeschlagen.');
    } finally {
      setIsDrinking(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    if (!window.confirm(`Wein "${wine.name}" in den Papierkorb verschieben?`)) return;

    try {
      setIsDeleting(true);
      await storageService.softDeleteWine(wine.id, 'Aus Kartenansicht gelöscht');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      alert(error?.message || 'Löschen fehlgeschlagen.');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusMeta = {
    [WineStatus.READY]: { label: 'Trinkreif', badge: 'bg-sage-light text-sage', bar: 'bg-sage-bar' },
    [WineStatus.HOLD]: { label: 'Lagernd', badge: 'bg-gold-tint text-gold-dim', bar: 'bg-gold-bar' },
    [WineStatus.PAST_PEAK]: { label: 'Überreif', badge: 'bg-burgundy-tint text-burgundy', bar: 'bg-burgundy' }
  }[status];

  const wineImage = (wine as any).ai_details?.app?.images?.bottle
    || (wine as any).ai_details?.app?.images?.label
    || (wine as any).ai_details?.app?.images?.case
    || null;

  // Window bar on a 30-year scale centred loosely on today (−10 … +20)
  const currentYear = new Date().getFullYear();
  const scaleFrom = currentYear - 10;
  const clampPct = (value: number) => Math.min(100, Math.max(0, value));
  const windowStart = typeof wine.drink_start === 'number' ? wine.drink_start : currentYear;
  const windowEnd = typeof wine.drink_end === 'number' ? Math.max(wine.drink_end, windowStart) : windowStart;
  const barLeft = clampPct(((windowStart - scaleFrom) / 30) * 100);
  const barRight = clampPct(((windowEnd + 1 - scaleFrom) / 30) * 100);

  const iconButton =
    'w-9 h-9 rounded-lg border border-line-strong bg-white flex items-center justify-center text-charcoal hover:bg-alabaster disabled:opacity-40 transition-colors';

  return (
    <div className={`relative h-full overflow-hidden rounded-[14px] border border-line bg-white transition-colors hover:border-line-strong ${isEmpty ? 'opacity-60' : ''}`}>
      {wineImage ? (
        <div className="h-28 w-full overflow-hidden bg-sand">
          <img src={wineImage} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-stone-gray">
            {[wine.wine_type, wine.region, wine.subcellar].filter(Boolean).join(' · ')}
          </span>
          <span className={`shrink-0 inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold ${statusMeta.badge}`}>
            {statusMeta.label}
          </span>
        </div>

        <Link to={`/wine/${wine.id}`} className="group/title flex flex-col gap-0.5">
          <h3
            className="font-serif text-[19px] font-semibold leading-tight text-charcoal group-hover/title:text-burgundy transition-colors break-words"
            title={wine.name}
          >
            {normalizedTitle}
          </h3>
          <span className="text-[13px] text-charcoal-soft break-words">
            {wine.producer || 'Unbekanntes Weingut'} · <span className="tabular-nums">{wine.vintage}</span>
          </span>
        </Link>

        <div className="flex flex-col gap-1.5">
          <span className="relative block h-1.5 rounded-full bg-sand" aria-hidden="true">
            <span className={`absolute inset-y-0 rounded-full ${statusMeta.bar}`} style={{ left: `${barLeft}%`, width: `${Math.max(2, barRight - barLeft)}%` }} />
            <span className="absolute -inset-y-1 w-0.5 bg-charcoal" style={{ left: `${(10 / 30) * 100}%` }} />
          </span>
          <span className="text-xs tabular-nums text-charcoal-soft">Fenster {wine.drink_start ?? '—'}–{wine.drink_end ?? '—'}</span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-3.5">
          <div className="flex items-center gap-2">
            <button onClick={(e) => handleAdjust(e, -1)} disabled={wine.quantity === 0 || isAdjusting} aria-label="Bestand reduzieren" className={iconButton}>
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[44px] text-center text-sm font-bold tabular-nums">{wine.quantity} Fl.</span>
            <button onClick={(e) => handleAdjust(e, 1)} disabled={isAdjusting} aria-label="Bestand erhöhen" className={iconButton}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="flex flex-col items-end">
            <span className="text-[11px] text-stone-gray">Einstand Ø</span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(wine.purchase_price)}</span>
          </span>
        </div>

        <div className="mt-auto flex items-center gap-2">
          <Link
            to={`/wine/${wine.id}`}
            className="flex-1 h-10 rounded-lg bg-burgundy hover:bg-burgundy-dark text-white text-[13px] font-semibold flex items-center justify-center transition-colors"
          >
            Details
          </Link>
          <button
            onClick={handleDrink}
            disabled={!onDrink || wine.quantity <= 0 || isDrinking}
            className="flex-1 h-10 rounded-lg border border-line-strong bg-white hover:bg-alabaster text-charcoal text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
          >
            <GlassWater className="w-3.5 h-3.5" />
            {isDrinking ? 'Trinkt …' : 'Trinken'}
          </button>
          <Link to={`/wine/${wine.id}?action=buy`} aria-label="Nachkaufen" title="Nachkaufen" className={iconButton}>
            <ShoppingCart className="w-4 h-4" />
          </Link>
          <button onClick={handleDelete} disabled={isDeleting} aria-label="In den Papierkorb" title="In den Papierkorb" className={`${iconButton} text-burgundy`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
