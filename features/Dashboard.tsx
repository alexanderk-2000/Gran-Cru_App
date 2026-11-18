import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Plus, ScanLine, Wine as WineIcon } from 'lucide-react';
import { OccasionInstance, Wine, WineStatus } from '../types.ts';
import { formatCurrency, getWineFamily, getWineStatus, type WineFamily } from '../utils.ts';
import { storageService } from '../services/storage.ts';
import { PageHeader, buttonClass, cardClass } from '../components/PageHeader.tsx';

interface RecommendationRow {
  wine: Wine;
  reason: string;
  statusLabel: string;
  urgency: number;
}

interface AlertRow {
  id: string;
  title: string;
  detail: string;
  ctaLabel: string;
  to: string;
}

const ratio = (value: number, total: number): number => (total <= 0 ? 0 : value / total);

const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

const normalizeKey = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const buildWindowText = (wine: Wine): string => `${wine.drink_start ?? '—'}–${wine.drink_end ?? '—'}`;

const viewPath = (view: 'ready' | 'holding' | 'past' | 'red' | 'white' | 'sparkling' | 'fortified'): string =>
  `/inventory?view=${view}`;

const familyLabel: Record<Exclude<WineFamily, 'unknown'>, string> = {
  red: 'Rot',
  white: 'Weiß',
  sparkling: 'Schaumwein',
  fortified: 'Portwein'
};

export const Dashboard: React.FC<{ wines: Wine[] }> = ({ wines }) => {
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [recentDrinks, setRecentDrinks] = useState<Array<{
    id: string;
    created_at: string;
    wines: { name: string; producer?: string; vintage?: number } | null;
  }>>([]);
  const [nextOccasions, setNextOccasions] = useState<OccasionInstance[]>([]);

  const inventory = useMemo(() => wines.filter((wine) => !wine.wishlist), [wines]);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    let active = true;
    const loadFooterData = async () => {
      setActivitiesLoading(true);
      try {
        const [history, occasionInstances] = await Promise.all([
          storageService.getConsumptionHistory(),
          storageService.getOccasionInstances()
        ]);

        if (!active) return;

        setRecentDrinks(
          (history || [])
            .slice(0, 5)
            .map((item) => ({
              id: item.id,
              created_at: item.created_at,
              wines: item.wines
            }))
        );

        const today = new Date(new Date().setHours(0, 0, 0, 0));
        const upcoming = (occasionInstances || [])
          .filter((instance) => instance.status === 'planned')
          .filter((instance) => new Date(instance.instance_date) >= today)
          .sort((a, b) => a.instance_date.localeCompare(b.instance_date))
          .slice(0, 5);
        setNextOccasions(upcoming);
      } catch {
        if (!active) return;
        setRecentDrinks([]);
        setNextOccasions([]);
      } finally {
        if (active) setActivitiesLoading(false);
      }
    };

    void loadFooterData();
    return () => {
      active = false;
    };
  }, []);

  const totalBottles = useMemo(
    () => inventory.reduce((sum, wine) => sum + Math.max(0, wine.quantity || 0), 0),
    [inventory]
  );

  const readyBottles = useMemo(
    () =>
      inventory.reduce((sum, wine) => {
        const qty = Math.max(0, wine.quantity || 0);
        if (qty === 0) return sum;
        const status = getWineStatus(wine);
        const entersThisYear = typeof wine.drink_start === 'number' && wine.drink_start === currentYear;
        return status === WineStatus.READY || entersThisYear ? sum + qty : sum;
      }, 0),
    [inventory, currentYear]
  );

  const pastPeakBottles = useMemo(
    () =>
      inventory.reduce((sum, wine) => {
        const qty = Math.max(0, wine.quantity || 0);
        if (qty === 0) return sum;
        return getWineStatus(wine) === WineStatus.PAST_PEAK ? sum + qty : sum;
      }, 0),
    [inventory]
  );

  const holdingBottles = Math.max(0, totalBottles - readyBottles - pastPeakBottles);

  const overripeShare = ratio(pastPeakBottles, Math.max(1, totalBottles));
  const overripeRiskLabel = overripeShare < 0.1 ? 'niedrig' : overripeShare < 0.25 ? 'mittel' : 'hoch';
  const overripeRiskTone =
    overripeRiskLabel === 'niedrig' ? 'text-charcoal' : overripeRiskLabel === 'mittel' ? 'text-gold-dim' : 'text-burgundy';

  const pricedWineCount = useMemo(
    () =>
      inventory.filter((wine) => {
        const market = typeof wine.market_price === 'number' && wine.market_price > 0;
        const purchase = typeof wine.purchase_price === 'number' && wine.purchase_price > 0;
        return market || purchase;
      }).length,
    [inventory]
  );

  const marketValue = useMemo(
    () =>
      inventory.reduce((sum, wine) => {
        const qty = Math.max(0, wine.quantity || 0);
        if (qty === 0) return sum;
        const market = typeof wine.market_price === 'number' && wine.market_price > 0 ? wine.market_price : null;
        const purchase = typeof wine.purchase_price === 'number' && wine.purchase_price > 0 ? wine.purchase_price : null;
        const unit = market ?? purchase;
        return unit ? sum + unit * qty : sum;
      }, 0),
    [inventory]
  );

  const familyDistribution = useMemo(() => {
    const base = {
      red: 0,
      white: 0,
      sparkling: 0,
      fortified: 0,
      unknown: 0
    };
    for (const wine of inventory) {
      const qty = Math.max(0, wine.quantity || 0);
      if (qty === 0) continue;
      const family = getWineFamily(wine);
      base[family] += qty;
    }
    return base;
  }, [inventory]);


  const recommendationRows = useMemo<RecommendationRow[]>(() => {
    const rows: RecommendationRow[] = inventory
      .filter((wine) => (wine.quantity || 0) > 0)
      .map((wine) => {
        const status = getWineStatus(wine);
        const end = typeof wine.drink_end === 'number' ? wine.drink_end : currentYear + 8;
        const start = typeof wine.drink_start === 'number' ? wine.drink_start : currentYear;
        const peak = typeof wine.peak_year === 'number' ? wine.peak_year : null;
        const yearsToEnd = end - currentYear;
        const yearsToStart = start - currentYear;

        let urgency = 0;
        let reason = 'Im Trinkfenster';
        if (status === WineStatus.PAST_PEAK) {
          urgency += 1.2;
          reason = 'Bereits über Trinkfenster';
        } else if (yearsToEnd <= 0) {
          urgency += 1.0;
          reason = 'Trinkfenster endet dieses Jahr';
        } else if (yearsToEnd === 1) {
          urgency += 0.9;
          reason = 'Trinkfenster endet im nächsten Jahr';
        } else if (status === WineStatus.READY) {
          urgency += 0.8;
          reason = 'Jetzt trinkreif';
        } else if (yearsToStart <= 0) {
          urgency += 0.7;
          reason = 'Eintritt ins Trinkfenster';
        } else if (yearsToStart === 1) {
          urgency += 0.5;
          reason = 'Trinkfenster startet nächstes Jahr';
        }

        if (peak !== null && Math.abs(peak - currentYear) <= 1) {
          urgency += 0.18;
          reason = `${reason} · nahe Peak`;
        }

        if (wine.category === 'Investment') {
          urgency -= 0.12;
        }

        if ((wine.quantity || 0) <= 1) urgency += 0.03;

        const statusLabel =
          status === WineStatus.READY ? 'Trinkbereit' : status === WineStatus.HOLD ? 'Lagernd' : 'Überreif';

        return {
          wine,
          reason,
          statusLabel,
          urgency
        };
      })
      .filter((row) => row.urgency > 0)
      .sort((a, b) => b.urgency - a.urgency);

    return rows.slice(0, 8);
  }, [inventory, currentYear]);

  const alerts = useMemo<AlertRow[]>(() => {
    const rows: AlertRow[] = [];

    const enteringWindowBottles = inventory.reduce((sum, wine) => {
      const qty = Math.max(0, wine.quantity || 0);
      if (!qty) return sum;
      if (typeof wine.drink_start === 'number' && wine.drink_start === currentYear) return sum + qty;
      return sum;
    }, 0);
    if (enteringWindowBottles > 0) {
      rows.push({
        id: 'window-now',
        title: 'Trinkfenster erreicht',
        detail: `${enteringWindowBottles} Flaschen erreichen dieses Jahr ihr Fenster.`,
        ctaLabel: 'Beheben',
        to: viewPath('ready')
      });
    }

    const endSoonBottles = inventory.reduce((sum, wine) => {
      const qty = Math.max(0, wine.quantity || 0);
      if (!qty) return sum;
      if (typeof wine.drink_end === 'number' && wine.drink_end <= currentYear + 1) return sum + qty;
      return sum;
    }, 0);
    if (endSoonBottles > 0) {
      rows.push({
        id: 'window-end',
        title: 'Überreif in ≤ 12 Monaten',
        detail: `${endSoonBottles} Flaschen nähern sich dem Fensterende.`,
        ctaLabel: 'Beheben',
        to: viewPath('past')
      });
    }

    const missingPriceBottles = inventory.reduce((sum, wine) => {
      const qty = Math.max(0, wine.quantity || 0);
      if (!qty) return sum;
      const hasPrice =
        (typeof wine.purchase_price === 'number' && wine.purchase_price > 0) ||
        (typeof wine.market_price === 'number' && wine.market_price > 0);
      return hasPrice ? sum : sum + qty;
    }, 0);
    if (missingPriceBottles > 0) {
      rows.push({
        id: 'missing-price',
        title: 'Preis fehlt',
        detail: `${missingPriceBottles} Flaschen ohne Preisbasis.`,
        ctaLabel: 'Beheben',
        to: '/inventory'
      });
    }

    const keyCount = new Map<string, number>();
    for (const wine of inventory) {
      const key = `${normalizeKey(wine.producer || '')}::${normalizeKey(wine.name || '')}::${wine.vintage || 'nv'}`;
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    }
    const duplicateGroups = [...keyCount.values()].filter((count) => count > 1).length;
    if (duplicateGroups > 0) {
      rows.push({
        id: 'duplicate',
        title: 'Duplikat erkannt',
        detail: `${duplicateGroups} doppelte Weinposition(en) erkannt.`,
        ctaLabel: 'Beheben',
        to: '/inventory'
      });
    }

    const lowStockWines = inventory.filter((wine) => (wine.quantity || 0) > 0 && (wine.quantity || 0) <= 1).length;
    if (lowStockWines > 0) {
      rows.push({
        id: 'low-stock',
        title: 'Bestand niedrig',
        detail: `${lowStockWines} Wein(e) nur noch mit 1 Flasche.`,
        ctaLabel: 'Beheben',
        to: '/inventory'
      });
    }

    if (rows.length === 0) {
      rows.push({
        id: 'all-clear',
        title: 'Keine akuten Alerts',
        detail: 'Ihr Keller ist aktuell sauber priorisiert.',
        ctaLabel: 'Zur Übersicht',
        to: '/inventory'
      });
    }

    return rows.slice(0, 6);
  }, [inventory, currentYear]);

  if (inventory.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-700">
        <DashboardHeader />
        <section className={`${cardClass} flex flex-col items-center justify-center gap-3 px-6 py-16 text-center`}>
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-sand text-stone-gray">
            <WineIcon className="h-6 w-6" />
          </span>
          <h2 className="font-serif text-3xl font-semibold text-charcoal">Noch kein Wein erfasst</h2>
          <p className="max-w-md text-charcoal-soft">
            Legen Sie den ersten Wein an, damit Reife-Profil, Empfehlungen und Aufgaben automatisch erscheinen.
          </p>
          <Link to="/inventory?add=1" className={`${buttonClass.primary} mt-2`}>
            <Plus className="h-4 w-4" />
            Ersten Wein erfassen
          </Link>
        </section>
      </div>
    );
  }

  const maturityTotal = Math.max(1, readyBottles + holdingBottles + pastPeakBottles);
  const familyRows = ([
    ['red', familyDistribution.red, viewPath('red')],
    ['white', familyDistribution.white, viewPath('white')],
    ['sparkling', familyDistribution.sparkling, viewPath('sparkling')],
    ['fortified', familyDistribution.fortified, viewPath('fortified')]
  ] as const).map(([id, count, to]) => ({ id, label: familyLabel[id], count, to }));
  const maxFamily = Math.max(1, ...familyRows.map((row) => row.count), familyDistribution.unknown);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <DashboardHeader />

      <section aria-label="Kennzahlen" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Flaschen im Keller" value={`${totalBottles}`} subline={`${inventory.length} Weine`} />
        <KpiCard
          label="Marktwert"
          value={pricedWineCount > 0 ? formatCurrency(marketValue) : '—'}
          subline={pricedWineCount > 0 ? `${pricedWineCount} Weine mit Preis` : 'Preise fehlen'}
        />
        <KpiCard label="Trinkbereit" value={`${readyBottles}`} unit="Fl." subline="nächste 90 Tage" />
        <KpiCard
          label="Überreif-Risiko"
          value={toPercent(overripeShare)}
          subline={`Risiko ${overripeRiskLabel}`}
          accent={overripeRiskTone}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className={`${cardClass} flex flex-col gap-5 p-6`}>
          <CardTitle title="Reife-Profil" subtitle="Flaschen nach Trinkfenster" link={{ to: '/timeline', label: 'Zur Zeitachse' }} />
          <div
            role="img"
            aria-label={`${readyBottles} trinkbereit, ${holdingBottles} lagernd, ${pastPeakBottles} überreif`}
            className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-sand"
          >
            <span className="bg-sage-bar" style={{ width: toPercent(ratio(readyBottles, maturityTotal)) }} />
            <span className="bg-gold-bar" style={{ width: toPercent(ratio(holdingBottles, maturityTotal)) }} />
            <span className="bg-burgundy" style={{ width: toPercent(ratio(pastPeakBottles, maturityTotal)) }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SegmentLink to={viewPath('ready')} label="Trinkbereit" value={readyBottles} dot="bg-sage-bar" share={toPercent(ratio(readyBottles, maturityTotal))} />
            <SegmentLink to={viewPath('holding')} label="Lagernd" value={holdingBottles} dot="bg-gold-bar" share={toPercent(ratio(holdingBottles, maturityTotal))} />
            <SegmentLink to={viewPath('past')} label="Überreif" value={pastPeakBottles} dot="bg-burgundy" share={toPercent(ratio(pastPeakBottles, maturityTotal))} />
          </div>
        </article>

        <article className={`${cardClass} flex flex-col gap-4 p-6`}>
          <CardTitle title="Weinsorten" subtitle="Flaschen nach Weinart" />
          <ul className="flex flex-col gap-1">
            {familyRows.map((row) => (
              <li key={row.id}>
                <DistributionRow to={row.to} label={row.label} count={row.count} width={toPercent(ratio(row.count, maxFamily))} />
              </li>
            ))}
            {familyDistribution.unknown > 0 ? (
              <li>
                <DistributionRow
                  to="/inventory"
                  label="Unklassifiziert"
                  count={familyDistribution.unknown}
                  width={toPercent(ratio(familyDistribution.unknown, maxFamily))}
                  muted
                />
              </li>
            ) : null}
          </ul>
          {familyDistribution.unknown > 0 ? (
            <p className="text-xs text-stone-gray">Unklassifiziert: Weine ohne eindeutige Typ-Zuordnung.</p>
          ) : null}
        </article>
      </section>

      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <article className={`${cardClass} overflow-hidden xl:col-span-3`}>
          <div className="px-6 pb-4 pt-6">
            <CardTitle title="Empfohlene Öffnungen" subtitle="Priorität für die nächsten 12 Monate" link={{ to: '/timeline', label: 'Zeitachse' }} />
          </div>
          {recommendationRows.length === 0 ? (
            <p className="border-t border-line-soft px-6 py-5 text-sm text-charcoal-soft">
              Aktuell keine priorisierten Öffnungen.
            </p>
          ) : (
            <ul>
              {recommendationRows.map((row) => (
                <li key={row.wine.id} className="border-t border-line-soft">
                  <Link
                    to={`/wine/${row.wine.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-3.5 transition-colors hover:bg-alabaster sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_56px]"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-charcoal">
                        {row.wine.name} <span className="font-medium tabular-nums text-charcoal-soft">{row.wine.vintage}</span>
                      </span>
                      <span className="truncate text-[13px] text-stone-gray">
                        {row.wine.producer || 'Produzent unbekannt'} · {row.reason}
                      </span>
                    </span>
                    <span className="hidden flex-col gap-1.5 sm:flex">
                      <WindowBar wine={row.wine} currentYear={currentYear} />
                      <span className="text-xs tabular-nums text-charcoal-soft">Fenster {buildWindowText(row.wine)}</span>
                    </span>
                    <span className="text-right text-[13px] font-semibold tabular-nums">{row.wine.quantity} Fl.</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={`${cardClass} flex flex-col gap-4 p-6 xl:col-span-2`}>
          <CardTitle title="Aufgaben" subtitle="Was als Nächstes zu tun ist" />
          <ul className="flex flex-col gap-2.5">
            {alerts.map((alert) => {
              const clear = alert.id === 'all-clear';
              return (
                <li key={alert.id} className="flex gap-3 rounded-[10px] bg-alabaster p-3.5">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white ${clear ? 'text-sage' : 'text-burgundy'}`}
                  >
                    {clear ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-charcoal">{alert.title}</span>
                    <span className="text-[13px] text-charcoal-soft">{alert.detail}</span>
                    <Link to={alert.to} className="mt-1 text-[13px] font-semibold text-burgundy hover:text-burgundy-dark">
                      {clear ? alert.ctaLabel : 'Ansehen'}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className={`${cardClass} flex flex-col gap-3 p-6`}>
          <CardTitle title="Zuletzt getrunken" link={{ to: '/drink-history', label: 'Alle ansehen' }} />
          {activitiesLoading ? (
            <p className="text-sm text-stone-gray">Aktivitäten werden geladen …</p>
          ) : recentDrinks.length === 0 ? (
            <p className="text-sm text-charcoal-soft">Noch keine Aktivität vorhanden.</p>
          ) : (
            <ul>
              {recentDrinks.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 border-t border-line-soft py-2.5">
                  <span className="truncate text-sm text-charcoal">
                    {(item.wines?.vintage ? `${item.wines.vintage} ` : '') + (item.wines?.name || 'Unbekannter Wein')}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-stone-gray">
                    {new Date(item.created_at).toLocaleDateString('de-DE')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className={`${cardClass} flex flex-col gap-3 p-6`}>
          <CardTitle title="Nächste Anlässe" link={{ to: '/genussplan', label: 'Planen' }} />
          {activitiesLoading ? (
            <p className="text-sm text-stone-gray">Anlässe werden geladen …</p>
          ) : nextOccasions.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-[10px] bg-alabaster p-4">
              <p className="text-sm text-charcoal-soft">Keine Anlässe vorhanden.</p>
              <Link to="/genussplan" className="text-[13px] font-semibold text-burgundy">Anlass anlegen</Link>
            </div>
          ) : (
            <ul>
              {nextOccasions.map((instance) => {
                const date = new Date(instance.instance_date);
                return (
                  <li key={instance.id} className="flex items-center gap-3.5 border-t border-line-soft py-3">
                    <span className="flex h-[52px] w-12 shrink-0 flex-col items-center justify-center rounded-[10px] border border-line leading-tight">
                      <span className="text-[11px] font-semibold uppercase text-burgundy">
                        {date.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}
                      </span>
                      <span className="text-lg font-bold tabular-nums">{date.getDate()}</span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-charcoal">{instance.occasion?.title || 'Anlass'}</span>
                      <span className={`truncate text-[13px] ${instance.wine_id ? 'text-charcoal-soft' : 'text-burgundy'}`}>
                        {instance.wine_id ? 'Wein zugewiesen' : 'Noch kein Wein zugewiesen'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
};

const DashboardHeader = () => (
  <PageHeader
    eyebrow="Keller · Übersicht"
    title="Dashboard"
    description="Was heute zählt: trinkreife Flaschen, offene Aufgaben und die nächsten Anlässe."
    actions={
      <>
        <Link to="/inventory?scan=1" className={buttonClass.secondary}>
          <ScanLine className="h-4 w-4" />
          Etikett scannen
        </Link>
        <Link to="/inventory?add=1" className={buttonClass.primary}>
          <Plus className="h-4 w-4" />
          Wein erfassen
        </Link>
      </>
    }
  />
);

const CardTitle = ({
  title,
  subtitle,
  link
}: {
  title: string;
  subtitle?: string;
  link?: { to: string; label: string };
}) => (
  <div className="flex items-end justify-between gap-3">
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold text-charcoal">{title}</h2>
      {subtitle ? <p className="text-[13px] text-stone-gray">{subtitle}</p> : null}
    </div>
    {link ? (
      <Link to={link.to} className="shrink-0 text-[13px] font-semibold text-burgundy hover:text-burgundy-dark">
        {link.label}
      </Link>
    ) : null}
  </div>
);

const KpiCard = ({
  label,
  value,
  unit,
  subline,
  accent
}: {
  label: string;
  value: string;
  unit?: string;
  subline?: string;
  accent?: string;
}) => (
  <article className={`${cardClass} flex flex-col gap-1.5 px-[22px] py-5`}>
    <p className="text-[13px] text-stone-gray">{label}</p>
    <p className={`font-serif text-[34px] font-semibold leading-tight tabular-nums ${accent || 'text-charcoal'}`}>
      {value}
      {unit ? <span className="ml-1 font-sans text-base font-medium text-stone-gray">{unit}</span> : null}
    </p>
    {subline ? <p className="text-[13px] text-charcoal-soft">{subline}</p> : null}
  </article>
);

const SegmentLink = ({
  to,
  label,
  value,
  dot,
  share
}: {
  to: string;
  label: string;
  value: number;
  dot: string;
  share: string;
}) => (
  <Link to={to} className="-m-2 flex flex-col gap-0.5 rounded-[10px] p-2 transition-colors hover:bg-alabaster">
    <span className="flex items-center gap-1.5 text-[13px] text-charcoal-soft">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${dot}`} />
      {label}
    </span>
    <span className="text-[22px] font-semibold tabular-nums text-charcoal">{value}</span>
    <span className="text-xs tabular-nums text-stone-gray">{share}</span>
  </Link>
);

const DistributionRow = ({
  to,
  label,
  count,
  width,
  muted
}: {
  to: string;
  label: string;
  count: number;
  width: string;
  muted?: boolean;
}) => (
  <Link
    to={to}
    className="-mx-2 grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-alabaster"
  >
    <span className="text-[13px] text-charcoal-soft">{label}</span>
    <span className="block h-2 overflow-hidden rounded-full bg-sand">
      <span className={`block h-full rounded-full ${muted ? 'bg-stone-gray' : 'bg-burgundy'}`} style={{ width }} />
    </span>
    <span className="text-right text-[13px] font-semibold tabular-nums">{count}</span>
  </Link>
);

/** Drink window on a fixed 30-year scale (current year − 10 … + 20) with a "today" marker. */
const WindowBar = ({ wine, currentYear }: { wine: Wine; currentYear: number }) => {
  const from = currentYear - 10;
  const span = 30;
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const start = typeof wine.drink_start === 'number' ? wine.drink_start : currentYear;
  const end = typeof wine.drink_end === 'number' ? wine.drink_end : start;
  const left = clamp(((start - from) / span) * 100);
  const right = clamp(((end - from) / span) * 100);
  const status = getWineStatus(wine);
  const fill = status === WineStatus.READY ? 'bg-sage-bar' : status === WineStatus.HOLD ? 'bg-gold-bar' : 'bg-burgundy';
  return (
    <span className="relative block h-1.5 rounded-full bg-sand" aria-hidden="true">
      <span className={`absolute inset-y-0 rounded-full ${fill}`} style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} />
      <span className="absolute -inset-y-1 w-0.5 bg-charcoal" style={{ left: `${(10 / span) * 100}%` }} />
    </span>
  );
};
