import {
  loadEnvFiles,
  createSupabaseClient,
  authenticate,
  fetchActiveWines,
  getPath,
  isFilled,
  writeReport
} from './baseline-utils.mjs';

const FIELDS = [
  { key: 'name', path: 'name' },
  { key: 'producer', path: 'producer' },
  { key: 'vintage', path: 'vintage' },
  { key: 'country', path: 'country' },
  { key: 'region', path: 'region' },
  { key: 'appellation', path: 'appellation' },
  { key: 'vineyard', path: 'vineyard' },
  { key: 'wine_type', path: 'wine_type' },
  { key: 'format', path: 'format' },
  { key: 'quantity', path: 'quantity' },
  { key: 'purchase_price', path: 'purchase_price' },
  { key: 'drink_start', path: 'drink_start' },
  { key: 'peak_year', path: 'peak_year' },
  { key: 'drink_end', path: 'drink_end' },
  { key: 'grapes', path: 'grapes' },
  { key: 'aromas', path: 'aromas' },
  { key: 'structure', path: 'structure' },
  { key: 'scores', path: 'scores' },
  { key: 'ai_details', path: 'ai_details' },
  { key: 'ai_sources', path: 'ai_sources' },
  { key: 'short_description_de', path: 'ai_details.extensions.short_description_de' }
];

const run = async () => {
  await loadEnvFiles();
  const supabase = createSupabaseClient();
  const authMode = await authenticate(supabase);
  const wines = await fetchActiveWines(supabase);

  const perField = FIELDS.map((field) => {
    const filled = wines.filter((wine) => isFilled(getPath(wine, field.path))).length;
    const total = wines.length;
    const completeness = total === 0 ? 0 : Number(((filled / total) * 100).toFixed(1));
    return {
      field: field.key,
      path: field.path,
      filled,
      total,
      completeness_percent: completeness
    };
  });

  const avgCompleteness =
    perField.length === 0
      ? 0
      : Number((perField.reduce((sum, item) => sum + item.completeness_percent, 0) / perField.length).toFixed(1));

  const report = {
    generated_at: new Date().toISOString(),
    auth_mode: authMode,
    wine_count: wines.length,
    average_completeness_percent: avgCompleteness,
    fields: perField
  };

  const outFile = await writeReport('baseline-data-quality.json', report);

  console.log('Baseline data quality complete.');
  console.log(`Wines: ${wines.length}`);
  console.log(`Average completeness: ${avgCompleteness}%`);
  console.log(`Report: ${outFile}`);
};

run().catch((error) => {
  console.error('[baseline-data-quality] failed:', error.message);
  process.exitCode = 1;
});
