import {
  loadEnvFiles,
  createSupabaseClient,
  authenticate,
  fetchActiveWines,
  getPath,
  isFilled,
  writeReport
} from './baseline-utils.mjs';

const FIELD_MAP = [
  {
    id: 'producer',
    ai_paths: ['producer', 'ai_details.identification.brand_line'],
    persisted_paths: ['producer']
  },
  {
    id: 'country',
    ai_paths: ['country', 'ai_details.identification.country'],
    persisted_paths: ['country']
  },
  {
    id: 'region',
    ai_paths: ['region', 'ai_details.identification.region'],
    persisted_paths: ['region']
  },
  {
    id: 'appellation',
    ai_paths: ['appellation', 'ai_details.identification.appellation'],
    persisted_paths: ['appellation']
  },
  {
    id: 'vineyard',
    ai_paths: ['vineyard', 'ai_details.identification.vineyard'],
    persisted_paths: ['vineyard']
  },
  {
    id: 'wine_type',
    ai_paths: ['wine_type', 'ai_details.identification.wine_type'],
    persisted_paths: ['wine_type']
  },
  {
    id: 'format',
    ai_paths: ['format', 'ai_details.identification.bottle_size'],
    persisted_paths: ['format']
  },
  {
    id: 'alcohol_percent',
    ai_paths: ['alcohol_percent', 'ai_details.grapes_style.alcohol_percent'],
    persisted_paths: ['alcohol_percent']
  },
  {
    id: 'drink_start',
    ai_paths: ['drink_start', 'ai_details.maturity.drink_start'],
    persisted_paths: ['drink_start']
  },
  {
    id: 'peak_year',
    ai_paths: ['peak_year', 'ai_details.maturity.peak_year'],
    persisted_paths: ['peak_year']
  },
  {
    id: 'drink_end',
    ai_paths: ['drink_end', 'ai_details.maturity.drink_end'],
    persisted_paths: ['drink_end']
  },
  {
    id: 'closure_type',
    ai_paths: ['closure_type', 'ai_details.identification.closure_type'],
    persisted_paths: ['closure_type']
  },
  {
    id: 'fermentation',
    ai_paths: ['vinification.fermentation_vessel', 'ai_details.vinification.fermentation_vessel'],
    persisted_paths: ['fermentation']
  },
  {
    id: 'aging_process',
    ai_paths: ['vinification.aging_vessel', 'ai_details.vinification.aging_vessel'],
    persisted_paths: ['aging_process']
  },
  {
    id: 'grapes',
    ai_paths: ['grapes', 'ai_details.grapes_style.varieties'],
    persisted_paths: ['grapes']
  },
  {
    id: 'aromas',
    ai_paths: ['aromas', 'ai_details.sensory.aromatics'],
    persisted_paths: ['aromas']
  },
  {
    id: 'structure',
    ai_paths: ['structure', 'ai_details.sensory.palate'],
    persisted_paths: ['structure']
  },
  {
    id: 'scores',
    ai_paths: ['scores', 'ai_details.ratings.critics'],
    persisted_paths: ['scores']
  },
  {
    id: 'short_description_de',
    ai_paths: ['short_description_de', 'ai_details.extensions.short_description_de'],
    persisted_paths: ['ai_details.extensions.short_description_de']
  }
];

const firstFilledValue = (obj, paths) => {
  for (const path of paths) {
    const value = getPath(obj, path);
    if (isFilled(value)) return value;
  }
  return undefined;
};

const run = async () => {
  await loadEnvFiles();
  const supabase = createSupabaseClient();
  const authMode = await authenticate(supabase);
  const wines = await fetchActiveWines(supabase);

  const perField = FIELD_MAP.map((field) => {
    let aiPresent = 0;
    let persisted = 0;
    const missingExamples = [];

    for (const wine of wines) {
      const aiValue = firstFilledValue(wine, field.ai_paths);
      if (!isFilled(aiValue)) continue;
      aiPresent += 1;

      const persistedValue = firstFilledValue(wine, field.persisted_paths);
      if (isFilled(persistedValue)) {
        persisted += 1;
      } else if (missingExamples.length < 10) {
        missingExamples.push({
          id: wine.id,
          name: wine.name,
          vintage: wine.vintage
        });
      }
    }

    const transferRate = aiPresent === 0 ? 100 : Number(((persisted / aiPresent) * 100).toFixed(1));
    return {
      field: field.id,
      ai_present: aiPresent,
      persisted,
      transfer_rate_percent: transferRate,
      missing_examples: missingExamples
    };
  });

  const averageTransfer =
    perField.length === 0
      ? 0
      : Number((perField.reduce((sum, item) => sum + item.transfer_rate_percent, 0) / perField.length).toFixed(1));

  const report = {
    generated_at: new Date().toISOString(),
    auth_mode: authMode,
    wine_count: wines.length,
    average_transfer_rate_percent: averageTransfer,
    fields: perField
  };

  const outFile = await writeReport('baseline-ai-mapping.json', report);
  console.log('Baseline AI mapping complete.');
  console.log(`Wines: ${wines.length}`);
  console.log(`Average transfer rate: ${averageTransfer}%`);
  console.log(`Report: ${outFile}`);
};

run().catch((error) => {
  console.error('[baseline-ai-mapping] failed:', error.message);
  process.exitCode = 1;
});
