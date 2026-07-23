import { memo } from 'react';
import { ACCENT_BURGUNDY, ACCENT_GOLD } from '../colors.ts';
import { formatYearDelta, toneClass, type WindowMetrics } from '../wineDetailSelectors.ts';

export const DrinkingWindowCard = memo(function DrinkingWindowCard({ metrics }: { metrics: WindowMetrics }) {
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
