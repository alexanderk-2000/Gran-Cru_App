import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, Layers3, ListChecks, Plus, ShoppingCart, Wine as WineIcon } from 'lucide-react';
import { OccasionInstance, Wine } from '../../types.ts';
import { formatCurrency } from '../../utils.ts';
import { storageService } from '../../services/storage.ts';
import { buildWindowText, computeAlerts, computeDashboardKpis, computeFamilyDistribution, computeRecommendations, familyLabel, ratio, toPercent, viewPath } from './dashboardMetrics.ts';
import { DashboardHeader } from './components/DashboardHeader.tsx';
import { KpiCard } from './components/KpiCard.tsx';
import { SegmentLinkCard } from './components/SegmentLinkCard.tsx';
import { DistributionBarSegment } from './components/DistributionBarSegment.tsx';

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

  const kpis = useMemo(() => computeDashboardKpis(inventory, currentYear), [inventory, currentYear]);
  const familyDistribution = useMemo(() => computeFamilyDistribution(inventory), [inventory]);
  const recommendationRows = useMemo(() => computeRecommendations(inventory, currentYear), [inventory, currentYear]);
  const alerts = useMemo(() => computeAlerts(inventory, currentYear), [inventory, currentYear]);

  const familyTotal = Math.max(1, kpis.totalBottles);

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

  const maturityTotal = Math.max(1, kpis.readyBottles + kpis.holdingBottles + kpis.pastPeakBottles);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <DashboardHeader />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Layers3} label="Gesamtbestand (Flaschen)" value={`${kpis.totalBottles} Fl.`} />
        <KpiCard
          icon={ShoppingCart}
          label="Marktwert"
          value={kpis.pricedWineCount > 0 ? formatCurrency(kpis.marketValue) : '—'}
          subline={kpis.pricedWineCount > 0 ? undefined : 'Preise fehlen'}
        />
        <KpiCard icon={CheckCircle2} label="Trinkbereit (nächste 90 Tage)" value={`${kpis.readyBottles} Fl.`} accent="text-sage" />
        <KpiCard
          icon={AlertTriangle}
          label="Überreif-Risiko"
          value={`${kpis.overripeRiskLabel} · ${toPercent(kpis.overripeShare)}`}
          accent={kpis.overripeRiskTone}
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
                style={{ width: toPercent(ratio(kpis.readyBottles, maturityTotal)) }}
              />
              <Link
                to={viewPath('holding')}
                title="Lagernd"
                className="bg-gold/70 transition-opacity hover:opacity-80"
                style={{ width: toPercent(ratio(kpis.holdingBottles, maturityTotal)) }}
              />
              <Link
                to={viewPath('past')}
                title="Überreif"
                className="bg-burgundy/70 transition-opacity hover:opacity-80"
                style={{ width: toPercent(ratio(kpis.pastPeakBottles, maturityTotal)) }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SegmentLinkCard to={viewPath('ready')} label="Trinkbereit" value={`${kpis.readyBottles} Fl.`} tone="text-sage" share={toPercent(ratio(kpis.readyBottles, maturityTotal))} />
            <SegmentLinkCard to={viewPath('holding')} label="Lagernd" value={`${kpis.holdingBottles} Fl.`} tone="text-gold-dim" share={toPercent(ratio(kpis.holdingBottles, maturityTotal))} />
            <SegmentLinkCard to={viewPath('past')} label="Überreif" value={`${kpis.pastPeakBottles} Fl.`} tone="text-burgundy" share={toPercent(ratio(kpis.pastPeakBottles, maturityTotal))} />
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
