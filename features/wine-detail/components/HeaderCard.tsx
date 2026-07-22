import { memo } from 'react';
import { ArrowLeft, Edit3, GlassWater, Minus, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/Badge.tsx';
import type { Wine } from '../../../types.ts';
import { ACCENT_BURGUNDY } from '../colors.ts';

export const HeaderCard = memo(function HeaderCard({
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
