import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Layers3,
  ListChecks,
  Plus,
  ShoppingCart,
  Wine as WineIcon
} from 'lucide-react';
import { OccasionInstance, Wine, WineStatus } from '../types.ts';
import { formatCurrency, getWineFamily, getWineStatus, type WineFamily } from '../utils.ts';
import { storageService } from '../services/storage.ts';

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
    overripeRiskLabel === 'niedrig' ? 'text-sage' : overripeRiskLabel === 'mittel' ? 'text-gold-dim' : 'text-burgundy';

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

  const familyTotal = Math.max(1, totalBottles);

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
        <section className="rounded-3xl bg-white p-10 shadow-[0_16px_36px_rgba(40,35,37,0.07)]">
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <WineIcon className="h-12 w-12 text-burgundy/25" />
            <h3 className="mt-4 font-serif text-3xl text-charcoal">Noch kein Wein erfasst</h3>
            <p className="mt-2 max-w-md text-sm text-stone-gray">
              Legen Sie den ersten Wein an, damit Reifeprofil, Empfehlungen und Alerts automatisch erscheinen.
            </p>
            <Link
              to="/inventory"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-burgundy px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white"
            >
              <Plus className="h-4 w-4" />
              Ersten Wein hinzufügen
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const maturityTotal = Math.max(1, readyBottles + holdingBottles + pastPeakBottles);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <DashboardHeader />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Layers3} label="Gesamtbestand (Flaschen)" value={`${totalBottles} Fl.`} />
        <KpiCard
          icon={ShoppingCart}
          label="Marktwert"
          value={pricedWineCount > 0 ? formatCurrency(marketValue) : '—'}
          subline={pricedWineCount > 0 ? undefined : 'Preise fehlen'}
        />
        <KpiCard icon={CheckCircle2} label="Trinkbereit (nächste 90 Tage)" value={`${readyBottles} Fl.`} accent="text-sage" />
        <KpiCard
          icon={AlertTriangle}
          label="Überreif-Risiko"
          value={`${overripeRiskLabel} · ${toPercent(overripeShare)}`}
          accent={overripeRiskTone}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Reife-Profil</h3>
              <p className="mt-1 text-sm text-stone-gray">Trinkbereit, Lagernd und Überreif nach Flaschenmenge.</p>
            </div>
            <Link to="/inventory" className="text-xs font-black uppercase tracking-[0.14em] text-burgundy">
              Zur Kellerliste
            </Link>
          </div>

          <div className="overflow-hidden rounded-full bg-alabaster">
            <div className="flex h-3 w-full">
              <Link
                to={viewPath('ready')}
                title="Trinkbereit"
                className="bg-sage/80 transition-opacity hover:opacity-80"
                style={{ width: toPercent(ratio(readyBottles, maturityTotal)) }}
              />
              <Link
                to={viewPath('holding')}
                title="Lagernd"
                className="bg-gold/70 transition-opacity hover:opacity-80"
                style={{ width: toPercent(ratio(holdingBottles, maturityTotal)) }}
              />
              <Link
                to={viewPath('past')}
                title="Überreif"
                className="bg-burgundy/70 transition-opacity hover:opacity-80"
                style={{ width: toPercent(ratio(pastPeakBottles, maturityTotal)) }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SegmentLinkCard to={viewPath('ready')} label="Trinkbereit" value={`${readyBottles} Fl.`} tone="text-sage" share={toPercent(ratio(readyBottles, maturityTotal))} />
            <SegmentLinkCard to={viewPath('holding')} label="Lagernd" value={`${holdingBottles} Fl.`} tone="text-gold-dim" share={toPercent(ratio(holdingBottles, maturityTotal))} />
            <SegmentLinkCard to={viewPath('past')} label="Überreif" value={`${pastPeakBottles} Fl.`} tone="text-burgundy" share={toPercent(ratio(pastPeakBottles, maturityTotal))} />
          </div>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <h3 className="font-serif text-2xl text-charcoal">Weinsorten-Verteilung</h3>
          <p className="mt-1 text-sm text-stone-gray">Rot, Weiß, Schaumwein und Portwein nach Flaschen.</p>

          <div className="mt-5 overflow-hidden rounded-full bg-alabaster">
            <div className="flex h-3 w-full">
              <DistributionBarSegment to={viewPath('red')} colorClass="bg-burgundy/80" width={toPercent(ratio(familyDistribution.red, familyTotal))} />
              <DistributionBarSegment to={viewPath('white')} colorClass="bg-gold/70" width={toPercent(ratio(familyDistribution.white, familyTotal))} />
              <DistributionBarSegment to={viewPath('sparkling')} colorClass="bg-sage/70" width={toPercent(ratio(familyDistribution.sparkling, familyTotal))} />
              <DistributionBarSegment to={viewPath('fortified')} colorClass="bg-charcoal/55" width={toPercent(ratio(familyDistribution.fortified, familyTotal))} />
              <DistributionBarSegment to="/inventory" colorClass="bg-stone-300" width={toPercent(ratio(familyDistribution.unknown, familyTotal))} />
            </div>
          </div>

          <ul className="mt-4 space-y-2.5">
            {([
              ['red', familyDistribution.red, viewPath('red')],
              ['white', familyDistribution.white, viewPath('white')],
              ['sparkling', familyDistribution.sparkling, viewPath('sparkling')],
              ['fortified', familyDistribution.fortified, viewPath('fortified')]
            ] as const).map(([id, count, to]) => {
              const share = toPercent(ratio(count, familyTotal));
              return (
                <li key={id}>
                  <Link
                    to={to}
                    className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 transition-colors hover:bg-alabaster"
                  >
                    <span className="text-sm text-charcoal">{familyLabel[id]}</span>
                    <span className="text-sm text-stone-600 [font-variant-numeric:tabular-nums]">{count} Fl. · {share}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to="/inventory"
                className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 transition-colors hover:bg-alabaster"
              >
                <span className="text-sm text-charcoal">Unklassifiziert</span>
                <span className="text-sm text-stone-600 [font-variant-numeric:tabular-nums]">
                  {familyDistribution.unknown} Fl. · {toPercent(ratio(familyDistribution.unknown, familyTotal))}
                </span>
              </Link>
            </li>
          </ul>
          {familyDistribution.unknown > 0 ? (
            <p className="mt-3 text-xs text-stone-500">
              Enthält Weine ohne eindeutige Typ-Zuordnung.
            </p>
          ) : null}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Empfohlene Öffnungen</h3>
              <p className="mt-1 text-sm text-stone-gray">Priorität für die nächsten 12 Monate.</p>
            </div>
            <span className="rounded-full bg-alabaster px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-stone-gray">
              Top {Math.max(5, recommendationRows.length)}
            </span>
          </div>

          {recommendationRows.length === 0 ? (
            <p className="rounded-2xl border border-stone-200 bg-alabaster/40 p-4 text-sm text-stone-gray">
              Aktuell keine priorisierten Öffnungen. Prüfen Sie den Kellerstatus.
            </p>
          ) : (
            <ul className="space-y-3">
              {recommendationRows.map((row) => (
                <li key={row.wine.id} className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-serif text-lg leading-tight text-charcoal">
                        {row.wine.vintage} {row.wine.name}
                      </p>
                      <p className="mt-1 text-xs text-stone-gray">
                        {row.wine.producer || 'Produzent unbekannt'} · Fenster {buildWindowText(row.wine)} · {row.statusLabel}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">{row.reason}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link
                        to={`/wine/${row.wine.id}`}
                        className="rounded-lg border border-burgundy/25 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-burgundy"
                      >
                        Öffnen
                      </Link>
                      <Link
                        to="/genussplan"
                        className="rounded-lg border border-stone-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-700"
                      >
                        Planen
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-serif text-2xl text-charcoal">Aufgaben & Alerts</h3>
              <p className="mt-1 text-sm text-stone-gray">Operative Hinweise für den nächsten Schritt.</p>
            </div>
            <ListChecks className="h-5 w-5 text-burgundy/60" />
          </div>

          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{alert.title}</p>
                    <p className="mt-1 text-sm text-stone-600">{alert.detail}</p>
                  </div>
                  <Link
                    to={alert.to}
                    className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-700"
                  >
                    {alert.ctaLabel}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <h3 className="font-serif text-2xl text-charcoal">Letzte Aktivitäten</h3>
          <p className="mt-1 text-sm text-stone-gray">Zuletzt hinzugefügt oder getrunken.</p>
          <div className="mt-4">
            {activitiesLoading ? (
              <p className="text-sm text-stone-gray">Aktivitäten werden geladen …</p>
            ) : recentDrinks.length === 0 ? (
              <p className="text-sm text-stone-gray">Noch keine Aktivität vorhanden.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentDrinks.map((item) => (
                  <li key={item.id} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5">
                    <p className="text-sm text-charcoal">
                      {(item.wines?.vintage ? `${item.wines.vintage} ` : '') + (item.wines?.name || 'Unbekannter Wein')}
                    </p>
                    <span className="text-xs text-stone-500">{new Date(item.created_at).toLocaleDateString('de-DE')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-[0_14px_34px_rgba(40,35,37,0.06)]">
          <h3 className="font-serif text-2xl text-charcoal">Nächste Anlässe</h3>
          <p className="mt-1 text-sm text-stone-gray">Geplante Termine aus Ihrer Anlass-Planung.</p>
          <div className="mt-4">
            {activitiesLoading ? (
              <p className="text-sm text-stone-gray">Anlässe werden geladen …</p>
            ) : nextOccasions.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-alabaster/40 p-4">
                <p className="text-sm text-stone-gray">Keine Anlässe vorhanden.</p>
                <Link to="/genussplan" className="mt-2 inline-flex text-xs font-black uppercase tracking-[0.14em] text-burgundy">
                  Anlass anlegen
                </Link>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {nextOccasions.map((instance) => (
                  <li key={instance.id} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5">
                    <div>
                      <p className="text-sm text-charcoal">{instance.occasion?.title || 'Anlass'}</p>
                      <p className="text-xs text-stone-500">{new Date(instance.instance_date).toLocaleDateString('de-DE')}</p>
                    </div>
                    <CalendarClock className="h-4 w-4 text-stone-500" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
    </div>
  );
};

const DashboardHeader = () => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="font-serif text-[2.1rem] leading-tight text-charcoal">Portfolio</h2>
      <p className="mt-1 text-sm text-stone-gray">Private Kellerverwaltung</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 rounded-xl bg-burgundy px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white"
      >
        <Plus className="h-4 w-4" />
        Wein hinzufügen
      </Link>
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-stone-700"
      >
        <ShoppingCart className="h-4 w-4" />
        Einkauf erfassen
      </Link>
    </div>
  </header>
);

const KpiCard = ({
  icon: Icon,
  label,
  value,
  subline,
  accent
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subline?: string;
  accent?: string;
}) => (
  <article className="h-full min-h-[148px] rounded-2xl bg-white p-5 shadow-[0_10px_24px_rgba(40,35,37,0.06)]">
    <div className="mb-3 inline-flex rounded-xl bg-alabaster p-2.5">
      <Icon className={`h-4 w-4 ${accent || 'text-stone-gray'}`} />
    </div>
    <p className="text-xs text-stone-gray">{label}</p>
    <p className={`mt-1 font-serif text-3xl leading-none text-charcoal [font-variant-numeric:tabular-nums] ${accent || ''}`}>{value}</p>
    {subline ? <p className="mt-2 text-xs text-stone-500">{subline}</p> : null}
  </article>
);

const SegmentLinkCard = ({
  to,
  label,
  value,
  tone,
  share
}: {
  to: string;
  label: string;
  value: string;
  tone: string;
  share: string;
}) => (
  <Link to={to} className="rounded-2xl border border-stone-200 bg-alabaster/40 p-3 transition-colors hover:bg-alabaster">
    <p className="text-xs text-stone-500">{label}</p>
    <p className={`mt-0.5 font-serif text-2xl ${tone}`}>{value}</p>
    <p className="mt-1 text-xs text-stone-500">{share}</p>
  </Link>
);

const DistributionBarSegment = ({
  to,
  colorClass,
  width
}: {
  to: string;
  colorClass: string;
  width: string;
}) => (
  <Link to={to} className={`${colorClass} transition-opacity hover:opacity-80`} style={{ width }} />
);
