import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Edit3,
  GlassWater,
  MapPin,
  Minus,
  Plus,
  Star,
  Trash2,
  Utensils,
  Wind,
  X
} from 'lucide-react';
import { Badge } from '../../components/Badge.tsx';
import { storageService } from '../../services/storage.ts';
import { imageStorageService, type ImageSlot } from '../../services/imageStorage.ts';
import { formatCurrency } from '../../utils.ts';
import { Tasting, Wine } from '../../types.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { WineCaptureForm } from '../wine-capture/WineCaptureForm.tsx';
import {
  type WindowMetrics,
  type NormalizedRating,
  type SourceLink,
  type FactItem,
  type AromaEntry,
  type PairingItem,
  type StructureRows,
  toNullableString,
  toNullableNumber,
  normalizeError,
  computeWindowMetrics,
  buildRatings,
  buildSourceLinks,
  buildAromas,
  buildStructureRows,
  buildQuickFacts,
  buildProfessionalFacts,
  buildHeaderDescription,
  formatYearDelta,
  pairingIconLabel,
  toneClass,
  extractFactOrder,
  normalizeFactLabel,
  splitByDelimiter,
  professionalFactGroups
} from './wineDetailSelectors.ts';

const LUXURY_BG = '#FDFBF7';
const ACCENT_BURGUNDY = '#5B1E2D';
const ACCENT_GOLD = '#C8A24A';

const TAB_ITEMS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'terroir', label: 'Terroir & Ausbau' },
  { id: 'sensory', label: 'Sensorik & Pairing' },
  { id: 'cellar', label: 'Keller' },
  { id: 'notes', label: 'Verkostungen' }
] as const;

type TabId = (typeof TAB_ITEMS)[number]['id'];
type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

const InlineToast = memo(function InlineToast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const colorClass =
    message.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : message.tone === 'info'
        ? 'border-stone-300 bg-white text-stone-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className="fixed left-1/2 top-6 z-[80] w-[min(92vw,560px)] -translate-x-1/2">
      <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${colorClass}`}>
        <p className="text-sm leading-5">{message.text}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-current/70 hover:bg-black/5"
          aria-label="Hinweis schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

const DetailSkeleton = memo(function DetailSkeleton() {
  return (
    <div className="min-h-screen px-6 pb-14 pt-8" style={{ backgroundColor: LUXURY_BG }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-44 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        <div className="h-12 animate-pulse rounded-2xl border border-stone-200 bg-white" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white md:col-span-2" />
          <div className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white" />
        </div>
      </div>
    </div>
  );
});

const StickyTabNav = memo(function StickyTabNav({
  active,
  onChange,
  tastingCount
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  tastingCount: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const activeButton = buttonRefs.current[active];
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  return (
    <div className="sticky top-3 z-20 mt-6">
      <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
        <div ref={containerRef} className="-mx-1 flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAB_ITEMS.map((tab) => {
            const label = tab.id === 'notes' ? `${tab.label} (${tastingCount})` : tab.label;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                ref={(node) => {
                  buttonRefs.current[tab.id] = node;
                }}
                onClick={() => onChange(tab.id)}
                className={`relative mx-1 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${isActive ? 'bg-[#5B1E2D] text-white shadow-[0_8px_18px_rgba(91,30,45,0.25)]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const HeaderCard = memo(function HeaderCard({
  wine,
  isSaving,
  onBack,
  onOpenEdit,
  onOpenPurchase,
  onDelete,
  onDrink,
  onAdjust
}: {
  wine: Wine;
  isSaving: boolean;
  onBack: () => void;
  onOpenEdit: () => void;
  onOpenPurchase: () => void;
  onDelete: () => void;
  onDrink: () => void;
  onAdjust: (delta: number) => void;
}) {
  const disabled = isSaving;

  return (
    <header className="px-6 pt-7">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-[#5B1E2D]/10 bg-gradient-to-br from-white via-[#fdfaf5] to-[#f6efe6] p-6 shadow-[0_18px_42px_rgba(48,20,24,0.08)] md:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#c8a24a]/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-20 h-40 w-40 rounded-full bg-[#5B1E2D]/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900"
              >
                <ArrowLeft className="h-4 w-4" /> Zurück
              </button>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 p-2">
                <button
                  type="button"
                  onClick={onOpenEdit}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
                >
                  <Edit3 className="h-4 w-4" />
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={onOpenPurchase}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#c8a24a] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Nachkauf
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-stone-300 bg-white/80 px-3 py-1 font-serif text-lg text-stone-700">{wine.vintage || 'NV'}</span>
                  {wine.region ? <Badge variant="sage">{wine.region}</Badge> : null}
                  {wine.wine_type ? <Badge variant="gold">{wine.wine_type}</Badge> : null}
                  {wine.category ? <Badge variant="bordeaux">{wine.category}</Badge> : null}
                </div>

                <h1 className="font-serif text-[2rem] leading-[1.05] text-stone-900 md:text-[3.25rem]">{wine.name}</h1>

                <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-600 md:text-lg">
                  <span>{wine.producer || 'Produzent unbekannt'}</span>
                  {wine.appellation ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-stone-300" />
                      <span>{wine.appellation}</span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="w-full rounded-3xl border border-[#5B1E2D]/15 bg-white/95 p-5 shadow-[0_10px_26px_rgba(0,0,0,0.08)]">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Bestand</p>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    onClick={() => onAdjust(-1)}
                    disabled={disabled || wine.quantity <= 0}
                    aria-label="Bestand reduzieren"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <p className="font-serif text-4xl leading-none text-stone-900">{wine.quantity}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Flaschen</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    onClick={() => onAdjust(1)}
                    disabled={disabled}
                    aria-label="Bestand erhöhen"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onDrink}
                  disabled={disabled || wine.quantity <= 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: ACCENT_BURGUNDY }}
                >
                  <GlassWater className="h-4 w-4" /> Flasche trinken
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </header>
  );
});

const DrinkingWindowCard = memo(function DrinkingWindowCard({ metrics }: { metrics: WindowMetrics }) {
  const peakTimingLabel =
    metrics.yearsToPeak === null
      ? '—'
      : metrics.yearsToPeak === 0
        ? 'Peak jetzt'
        : metrics.yearsToPeak > 0
          ? `in ${formatYearDelta(metrics.yearsToPeak)}`
          : `seit ${formatYearDelta(metrics.yearsToPeak)} vorbei`;

  const endTimingLabel =
    metrics.yearsToEnd === null
      ? '—'
      : metrics.yearsToEnd === 0
        ? 'endet dieses Jahr'
        : metrics.yearsToEnd > 0
          ? `in ${formatYearDelta(metrics.yearsToEnd)}`
          : `seit ${formatYearDelta(metrics.yearsToEnd)} überschritten`;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl text-stone-900">Trinkreife</h3>
          <p className="mt-1 text-sm text-stone-500">
            {metrics.known && metrics.start !== null && metrics.end !== null
              ? `${metrics.start} bis ${metrics.end}`
              : 'Fensterdaten unvollständig'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-stone-200 px-3 py-1 text-xs uppercase tracking-[0.16em] text-stone-600">
            Index {metrics.drinkabilityIndex}/100
          </span>
          <span className="rounded-full border border-stone-200 px-3 py-1 text-xs uppercase tracking-[0.16em] text-stone-600">
            Unsicherheit {metrics.uncertaintyLabel}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${toneClass[metrics.statusTone]}`}>
            {metrics.statusLabel}
          </span>
        </div>
      </div>

      {metrics.known && metrics.start !== null && metrics.end !== null && metrics.currentPosition !== null ? (
        <>
          <div className="relative rounded-full bg-stone-100">
            <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${ACCENT_GOLD}22 0%, ${ACCENT_BURGUNDY} 50%, ${ACCENT_GOLD}22 100%)` }} />

            <span
              className="absolute -top-2 h-6 w-[3px] -translate-x-1/2 rounded-full bg-stone-900"
              style={{ left: `${metrics.currentPosition * 100}%` }}
              aria-label={`Aktuelles Jahr ${metrics.currentYear}`}
            />

            {metrics.peakPosition !== null ? (
              <span
                className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full"
                style={{ left: `${metrics.peakPosition * 100}%`, backgroundColor: ACCENT_GOLD }}
                aria-label={`Peak ${metrics.peak}`}
              />
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-stone-500">
            <span>Start {metrics.start}</span>
            <span>Heute {metrics.currentYear}</span>
            <span>Ende {metrics.end}</span>
          </div>

          {metrics.peak !== null ? <p className="mt-3 text-xs text-stone-500">Peak: {metrics.peak}</p> : null}
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 text-sm text-stone-500">
          Für diesen Wein fehlen vollständige Start-/Enddaten des Trinkfensters.
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Fenster-Fortschritt</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">
            {metrics.windowProgressPercent !== null ? `${metrics.windowProgressPercent}%` : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Bis Peak</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">{peakTimingLabel}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Bis Fensterende</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">{endTimingLabel}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Fensterlänge</p>
          <p className="mt-1 text-sm font-semibold text-stone-800">
            {metrics.windowLengthYears !== null ? `${metrics.windowLengthYears} Jahre` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Nächster Schritt</p>
        <p className="mt-1 text-sm text-stone-700">{metrics.nextAction}</p>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-stone-600">{metrics.explanation}</p>
    </section>
  );
});

const ShortDescriptionCard = memo(function ShortDescriptionCard({ description }: { description?: string | null }) {
  const cleaned = (description ?? '').trim();
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="font-serif text-xl text-stone-900">Kurzbeschreibung</h3>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        {cleaned || 'Für diesen Wein ist noch keine Kurzbeschreibung hinterlegt.'}
      </p>
    </section>
  );
});

const FactValue = memo(function FactValue({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === '—') {
    return <p className="text-sm text-stone-400">—</p>;
  }

  const piped = splitByDelimiter(cleaned, '|');
  if (piped.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {piped.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  const commaSeparated = splitByDelimiter(cleaned, ',');
  if (normalizeFactLabel(label).toLowerCase().includes('aromenprofil') && commaSeparated.length > 1) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {commaSeparated.map((chunk) => (
          <span
            key={`${label}-${chunk}`}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-700"
          >
            {chunk}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className={`${compact ? 'text-sm' : 'text-[15px]'} leading-6 text-stone-800 break-words`}>
      {cleaned}
    </p>
  );
});

const FactsDefinitionList = memo(function FactsDefinitionList({ items }: { items: FactItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Quick Facts</h3>
      <p className="mb-4 text-xs uppercase tracking-[0.14em] text-stone-500">Kernwerte auf einen Blick</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="grid grid-cols-1 gap-1 rounded-2xl border border-stone-100 bg-stone-50/60 px-3 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">{item.label}</p>
            <FactValue label={item.label} value={item.value} compact />
          </li>
        ))}
      </ul>
    </section>
  );
});

const ProfessionalFactsCard = memo(function ProfessionalFactsCard({ items }: { items: FactItem[] }) {
  const grouped = professionalFactGroups.map((group) => ({
    ...group,
    items: items.filter((item) => {
      const order = extractFactOrder(item.label);
      return order >= group.min && order <= group.max;
    })
  }));

  const ungrouped = items.filter((item) => extractFactOrder(item.label) === Number.MAX_SAFE_INTEGER);

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-1 font-serif text-xl text-stone-900">Professionelles Weinprofil</h3>
      <p className="mb-6 text-xs uppercase tracking-[0.14em] text-stone-500">Strukturiert nach Herkunft, Ausbau und Reife</p>
      <div className="space-y-6">
        {grouped
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <article key={group.title} className="rounded-2xl border border-stone-200 bg-white">
              <header className="border-b border-stone-100 px-4 py-3">
                <h4 className="font-serif text-lg text-stone-900">{group.title}</h4>
                <p className="text-xs text-stone-500">{group.subtitle}</p>
              </header>
              <dl className="divide-y divide-stone-100 px-4">
                {group.items.map((item) => (
                  <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                      {normalizeFactLabel(item.label)}
                    </dt>
                    <dd className="min-w-0">
                      <FactValue label={item.label} value={item.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}

        {ungrouped.length > 0 ? (
          <article className="rounded-2xl border border-stone-200 bg-white">
            <header className="border-b border-stone-100 px-4 py-3">
              <h4 className="font-serif text-lg text-stone-900">Weitere Angaben</h4>
            </header>
            <dl className="divide-y divide-stone-100 px-4">
              {ungrouped.map((item) => (
                <div key={item.label} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
                    {normalizeFactLabel(item.label)}
                  </dt>
                  <dd className="min-w-0">
                    <FactValue label={item.label} value={item.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ) : null}
      </div>
    </section>
  );
});

const RatingsCard = memo(function RatingsCard({ ratings }: { ratings: NormalizedRating[] }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [ratings]);

  if (ratings.length === 0) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <h3 className="font-serif text-xl text-stone-900">Bewertungen</h3>
        <p className="mt-3 text-sm text-stone-500">Noch keine externen Bewertungen vorhanden.</p>
      </section>
    );
  }

  const visible = expanded ? ratings : ratings.slice(0, 8);
  const hasMore = ratings.length > 8;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-4 font-serif text-xl text-stone-900">Bewertungen</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((rating) => (
          <div key={`${rating.critic}-${rating.scoreLabel}`} className="rounded-2xl border border-stone-200 bg-stone-50/50 p-3 text-center">
            <p className="font-serif text-2xl text-stone-900">{rating.scoreLabel}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-stone-500">{rating.critic}</p>
            {rating.year ? <p className="mt-0.5 text-[10px] text-stone-400">Jg. {rating.year}</p> : null}
          </div>
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-4"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Weniger anzeigen' : `Mehr anzeigen (${ratings.length - 8})`}
        </button>
      ) : null}
    </section>
  );
});

const AromaCard = memo(function AromaCard({ aromas }: { aromas: { primary: AromaEntry[]; secondary: AromaEntry[] } }) {
  const renderGroup = (title: string, entries: AromaEntry[]) => (
    <div>
      <h4 className="mb-3 text-xs uppercase tracking-[0.16em] text-stone-500">{title}</h4>
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <span
              key={`${title}-${entry.tag}`}
              className={`rounded-full border px-3 py-1.5 text-sm ${title === 'Primary' ? 'border-[color:#5B1E2D]/25 bg-[color:#5B1E2D]/10 text-[color:#5B1E2D]' : 'border-stone-200 bg-white text-stone-700'
                }`}
            >
              {entry.tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">Keine Angaben</p>
      )}
    </div>
  );

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Wind className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Aromatik
      </h3>
      <div className="space-y-6">
        {renderGroup('Primary', aromas.primary)}
        {renderGroup('Secondary', aromas.secondary)}
      </div>
    </section>
  );
});

const StructureCard = memo(function StructureCard({ rows }: { rows: StructureRows }) {
  const bars = [
    { label: 'Säure', value: rows.acidity, description: null as string | null },
    { label: 'Tannin', value: rows.tannin, description: null as string | null },
    { label: 'Körper', value: rows.body, description: null as string | null },
    { label: 'Süße', value: rows.sweetness, description: rows.sweetnessText },
    { label: 'Holz', value: rows.oak, description: null as string | null }
  ];

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Activity className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Struktur
      </h3>

      <div className="space-y-5">
        {bars.map((bar) => {
          const barValue = bar.value;
          return (
            <div key={bar.label}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-xs uppercase tracking-[0.16em] text-stone-500">{bar.label}</span>
                <span className="text-xs text-stone-500">{barValue ?? bar.description ?? '—'}</span>
              </div>
              {barValue === null ? (
                <div className="h-1.5 rounded-full bg-stone-100" />
              ) : (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <span
                      key={`${bar.label}-${idx}`}
                      className={`h-1.5 flex-1 rounded-full ${idx <= barValue ? 'bg-[color:#5B1E2D]' : 'bg-stone-100'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

const PairingsCard = memo(function PairingsCard({ pairings }: { pairings: PairingItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Utensils className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Pairing
      </h3>

      {pairings.length === 0 ? (
        <p className="text-sm text-stone-500">Keine Pairing-Daten vorhanden.</p>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => (
            <article key={`${pairing.item}-${pairing.category ?? ''}`} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-900">{pairing.item}</p>
                <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{pairingIconLabel(pairing.category)}</span>
              </div>
              {pairing.note ? <p className="text-sm leading-6 text-stone-600">{pairing.note}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});

const NotesTimeline = memo(function NotesTimeline({ tastings, onCreateNote, disabled }: { tastings: Tasting[]; onCreateNote: () => void; disabled: boolean }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="font-serif text-xl text-stone-900">Verkostungen</h3>
        <button
          type="button"
          onClick={onCreateNote}
          disabled={disabled}
          className="rounded-full border border-stone-300 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          Flasche trinken
        </button>
      </div>

      {tastings.length === 0 ? (
        <p className="text-sm text-stone-500">Noch keine Verkostungen vorhanden.</p>
      ) : (
        <ol className="space-y-5">
          {tastings.map((tasting) => (
            <li key={tasting.id} className="rounded-2xl border border-stone-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <time className="text-xs uppercase tracking-[0.16em] text-stone-500">
                  {new Date(tasting.date).toLocaleDateString('de-DE')}
                </time>
                <div className="flex items-center gap-0.5" aria-label={`Bewertung ${tasting.rating} von 5`}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={`${tasting.id}-${star}`}
                      className={`h-3.5 w-3.5 ${star <= tasting.rating ? 'fill-current text-[color:#C8A24A]' : 'text-stone-300'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="font-serif text-base leading-relaxed text-stone-800">“{tasting.note}”</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

const SourceFooter = memo(function SourceFooter({ sources }: { sources: SourceLink[] }) {
  if (sources.length === 0) return null;

  return (
    <footer className="mx-auto mt-10 max-w-6xl border-t border-stone-200 px-6 pt-8">
      <h4 className="mb-4 text-xs uppercase tracking-[0.18em] text-stone-500">Quellen</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-stone-300"
          >
            <p className="line-clamp-2 text-sm text-stone-800">{source.title}</p>
            <p className="mt-1 text-xs text-stone-500">{source.domain}</p>
          </a>
        ))}
      </div>
    </footer>
  );
});

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

const TerroirRow = memo(function TerroirRow({ label, value }: { label: string; value: string | null | undefined }) {
  const safeValue = toNullableString(value) ?? '—';
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-stone-100 pb-2 last:border-none last:pb-0">
      <dt className="text-xs uppercase tracking-[0.16em] text-stone-500">{label}</dt>
      <dd className="text-sm leading-6 text-stone-800">{safeValue}</dd>
    </div>
  );
});

