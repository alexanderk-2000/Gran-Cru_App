import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine } from '../types.ts';
import { PageHeader, cardClass } from '../components/PageHeader.tsx';

type TimelineStatus = 'ready' | 'hold' | 'past';

const STATUS_META: Record<TimelineStatus, { label: string; bar: string; dot: string }> = {
  ready: { label: 'Optimales Fenster', bar: 'bg-sage-bar', dot: 'bg-sage-bar' },
  hold: { label: 'In Reifung', bar: 'bg-gold-bar', dot: 'bg-gold-bar' },
  past: { label: 'Peak überschritten', bar: 'bg-burgundy', dot: 'bg-burgundy' }
};

export const Timeline: React.FC<{ wines: Wine[] }> = ({ wines }) => {
  const currentYear = new Date().getFullYear();
  const [filter, setFilter] = useState<TimelineStatus | 'all'>('all');

  const rows = useMemo(() => {
    return wines
      .filter((wine) => !wine.wishlist)
      .map((wine) => {
        const start = typeof wine.drink_start === 'number' ? wine.drink_start : currentYear;
        const end = typeof wine.drink_end === 'number' ? Math.max(wine.drink_end, start) : start;
        const status: TimelineStatus = end < currentYear ? 'past' : start > currentYear ? 'hold' : 'ready';
        return { wine, start, end, status };
      })
      // Most urgent first: earliest window end
      .sort((a, b) => a.end - b.end || a.start - b.start);
  }, [wines, currentYear]);

  const visible = filter === 'all' ? rows : rows.filter((row) => row.status === filter);

  const startYear = Math.min(currentYear - 5, ...rows.map((row) => row.start));
  const endYear = Math.max(currentYear + 20, ...rows.map((row) => row.end));
  const span = Math.max(1, endYear - startYear);
  const pos = (year: number) => ((year - startYear) / span) * 100;
  const step = span > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let y = Math.ceil(startYear / step) * step; y <= endYear; y += step) {
    if (Math.abs(y - currentYear) >= 2) ticks.push(y);
  }

  const chips: Array<{ value: TimelineStatus | 'all'; label: string; dot: string }> = [
    { value: 'all', label: 'Alle', dot: 'bg-charcoal' },
    ...(['ready', 'hold', 'past'] as TimelineStatus[]).map((key) => ({ value: key, label: STATUS_META[key].label, dot: STATUS_META[key].dot }))
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      <PageHeader
        eyebrow="Planung"
        title="Zeitachse"
        description="Die Trinkfenster aller Weine auf einen Blick, sortiert nach Dringlichkeit."
        actions={
          <div role="group" aria-label="Status filtern" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const active = filter === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(chip.value)}
                  className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors ${active ? 'bg-charcoal border-charcoal text-white' : 'bg-white border-line-strong text-charcoal hover:bg-alabaster'}`}
                >
                  <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-[3px] ${active ? 'bg-white' : chip.dot}`} />
                  {chip.label}
                </button>
              );
            })}
          </div>
        }
      />

      <section className={`${cardClass} overflow-x-auto`}>
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[240px_minmax(0,1fr)] border-b border-line">
            <div className="px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-stone-gray">Wein</div>
            <div className="relative h-12 mr-6 tabular-nums">
              {ticks.map((year) => (
                <span key={year} className="absolute top-3.5 -translate-x-1/2 text-xs text-stone-gray" style={{ left: `${pos(year)}%` }}>
                  {year}
                </span>
              ))}
              <span className="absolute top-3.5 -translate-x-1/2 text-xs font-bold text-charcoal" style={{ left: `${pos(currentYear)}%` }}>
                Heute
              </span>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-charcoal-soft">Keine Weine in dieser Auswahl.</p>
          ) : (
            visible.map(({ wine, start, end, status }) => (
              <Link
                key={wine.id}
                to={`/wine/${wine.id}`}
                className="grid grid-cols-[240px_minmax(0,1fr)] items-center border-t border-sand hover:bg-alabaster/60 transition-colors"
              >
                <span className="flex flex-col min-w-0 px-5 py-3">
                  <span className="font-semibold text-charcoal truncate">{wine.vintage} {wine.name}</span>
                  <span className="text-xs tabular-nums text-stone-gray">
                    {wine.quantity} Fl. · {start}–{end}{typeof wine.peak_year === 'number' ? ` · Peak ${wine.peak_year}` : ''}
                  </span>
                </span>
                <span className="relative block h-14 mr-6">
                  <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-charcoal/80" style={{ left: `${pos(currentYear)}%` }} />
                  <span
                    role="img"
                    aria-label={`${STATUS_META[status].label}, Fenster ${start} bis ${end}`}
                    className={`absolute top-5 h-4 rounded-full ${STATUS_META[status].bar}`}
                    style={{ left: `${pos(start)}%`, width: `${Math.max(1.2, pos(end + 1) - pos(start))}%` }}
                  />
                  {typeof wine.peak_year === 'number' && wine.peak_year >= start && wine.peak_year <= end ? (
                    <span
                      aria-hidden="true"
                      className={`absolute top-4 h-6 w-[3px] rounded-sm ${status === 'past' ? 'bg-white' : 'bg-charcoal'}`}
                      style={{ left: `${pos(wine.peak_year + 0.5)}%` }}
                    />
                  ) : null}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-5 text-[13px] text-charcoal-soft">
        {(['ready', 'hold', 'past'] as TimelineStatus[]).map((key) => (
          <span key={key} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={`w-[18px] h-2.5 rounded-full ${STATUS_META[key].bar}`} />
            {STATUS_META[key].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="w-0.5 h-4 bg-charcoal" />Heute
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="w-[3px] h-4 rounded-sm bg-charcoal" />Peak-Jahr
        </span>
      </div>
    </div>
  );
};
