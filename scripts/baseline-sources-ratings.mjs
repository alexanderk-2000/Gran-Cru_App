import {
  loadEnvFiles,
  createSupabaseClient,
  authenticate,
  fetchActiveWines,
  normalizeDomain,
  writeReport
} from './baseline-utils.mjs';

const TARGET_CRITICS = [
  'James Suckling',
  'Robert Parker',
  'Wine Advocate',
  'Vinous',
  'Decanter',
  'Jancis Robinson',
  'Falstaff'
];

const criticMatch = (name, target) => name.toLowerCase().includes(target.toLowerCase());

const run = async () => {
  await loadEnvFiles();
  const supabase = createSupabaseClient();
  const authMode = await authenticate(supabase);
  const wines = await fetchActiveWines(supabase);

  const analyzed = wines.filter((wine) => Array.isArray(wine.ai_sources) && wine.ai_sources.length > 0);
  const domainCounts = {};
  let withGuteWeine = 0;
  let withWineSearcher = 0;
  let withBothRequired = 0;

  const criticCoverage = Object.fromEntries(TARGET_CRITICS.map((critic) => [critic, 0]));
  let winesWithAnyScore = 0;

  for (const wine of analyzed) {
    const domains = new Set(
      (wine.ai_sources || [])
        .map((entry) => normalizeDomain(entry?.url))
        .filter((domain) => domain.length > 0)
    );

    for (const domain of domains) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }

    const hasGuteWeine = [...domains].some((domain) => domain.includes('gute-weine.de'));
    const hasWineSearcher = [...domains].some((domain) => domain.includes('wine-searcher.com'));
    if (hasGuteWeine) withGuteWeine += 1;
    if (hasWineSearcher) withWineSearcher += 1;
    if (hasGuteWeine && hasWineSearcher) withBothRequired += 1;

    const topScores = Array.isArray(wine.scores) ? wine.scores : [];
    const detailCritics = Array.isArray(wine?.ai_details?.ratings?.critics)
      ? wine.ai_details.ratings.critics
      : [];
    const criticNames = [
      ...topScores.map((entry) => entry?.critic || ''),
      ...detailCritics.map((entry) => entry?.source || entry?.critic || '')
    ]
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (criticNames.length > 0) winesWithAnyScore += 1;

    for (const target of TARGET_CRITICS) {
      if (criticNames.some((name) => criticMatch(name, target))) {
        criticCoverage[target] += 1;
      }
    }
  }

  const totalAnalyzed = analyzed.length;
  const coverage = {
    wines_analyzed: totalAnalyzed,
    with_gute_weine: withGuteWeine,
    with_wine_searcher: withWineSearcher,
    with_both_required: withBothRequired,
    with_gute_weine_percent: totalAnalyzed === 0 ? 0 : Number(((withGuteWeine / totalAnalyzed) * 100).toFixed(1)),
    with_wine_searcher_percent: totalAnalyzed === 0 ? 0 : Number(((withWineSearcher / totalAnalyzed) * 100).toFixed(1)),
    with_both_required_percent: totalAnalyzed === 0 ? 0 : Number(((withBothRequired / totalAnalyzed) * 100).toFixed(1)),
    with_any_critic_score: winesWithAnyScore,
    with_any_critic_score_percent:
      totalAnalyzed === 0 ? 0 : Number(((winesWithAnyScore / totalAnalyzed) * 100).toFixed(1))
  };

  const criticCoverageSummary = TARGET_CRITICS.map((critic) => ({
    critic,
    wines: criticCoverage[critic],
    percent: totalAnalyzed === 0 ? 0 : Number(((criticCoverage[critic] / totalAnalyzed) * 100).toFixed(1))
  }));

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([domain, count]) => ({ domain, wines: count }));

  const report = {
    generated_at: new Date().toISOString(),
    auth_mode: authMode,
    total_wines: wines.length,
    analyzed_wines: totalAnalyzed,
    source_coverage: coverage,
    top_source_domains: topDomains,
    critic_coverage: criticCoverageSummary
  };

  const outFile = await writeReport('baseline-sources-ratings.json', report);
  console.log('Baseline sources/ratings complete.');
  console.log(`Wines analyzed: ${totalAnalyzed}`);
  console.log(`Required domain coverage: ${coverage.with_both_required_percent}%`);
  console.log(`Report: ${outFile}`);
};

run().catch((error) => {
  console.error('[baseline-sources-ratings] failed:', error.message);
  process.exitCode = 1;
});
