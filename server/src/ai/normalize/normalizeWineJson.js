const isFilledValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

export const normalizeWineJson = (input) => {
  const output = typeof input === 'object' && input !== null ? { ...input } : {};
  const missing = new Set(Array.isArray(output.missing_fields) ? output.missing_fields : []);
  const issues = [];

  if (!isFilledValue(output.name) && isFilledValue(output.wine_name)) output.name = output.wine_name;
  if (!isFilledValue(output.name) && isFilledValue(output.title)) output.name = output.title;
  if (!isFilledValue(output.producer) && isFilledValue(output.winery)) output.producer = output.winery;
  if (!isFilledValue(output.producer) && isFilledValue(output.producer_name)) output.producer = output.producer_name;
  if (!isFilledValue(output.short_description_de) && isFilledValue(output.short_description)) {
    output.short_description_de = output.short_description;
  }
  if (!isFilledValue(output.short_description_de) && isFilledValue(output.style_description)) {
    output.short_description_de = output.style_description;
  }
  if (!isFilledValue(output.appellation) && isFilledValue(output.appellation_or_vineyard)) {
    output.appellation = output.appellation_or_vineyard;
  }
  if (!isFilledValue(output.region) && isFilledValue(output.subregion)) output.region = output.subregion;
  if (!isFilledValue(output.wine_type) && isFilledValue(output.type)) output.wine_type = output.type;

  if (!isFilledValue(output.country) && typeof output.origin === 'string' && output.origin.trim() !== '') {
    const origin = output.origin.trim();
    const beforeParen = origin.split('(')[0]?.trim();
    const leadingPart = beforeParen?.split(',')[0]?.trim();
    output.country = leadingPart || origin;
  }

  if (!Array.isArray(output.sources) && Array.isArray(output.references)) {
    output.sources = output.references;
  }
  if (Array.isArray(output.sources)) {
    output.sources = output.sources
      .map((entry) => {
        if (typeof entry === 'string') {
          const cleaned = entry.trim();
          return cleaned ? { title: cleaned, url: cleaned } : null;
        }
        if (!entry || typeof entry !== 'object') return null;
        const url = typeof entry.url === 'string'
          ? entry.url.trim()
          : (typeof entry.uri === 'string' ? entry.uri.trim() : '');
        const title = typeof entry.title === 'string' && entry.title.trim() !== ''
          ? entry.title.trim()
          : (typeof entry.name === 'string' ? entry.name.trim() : 'Quelle');
        if (!url) return null;
        return { title, url };
      })
      .filter(Boolean);
  }

  if (!Array.isArray(output.grapes)) {
    if (Array.isArray(output.grape_varieties)) {
      output.grapes = output.grape_varieties
        .map((entry) => {
          if (typeof entry === 'string') return { name: entry.trim() };
          if (!entry || typeof entry !== 'object') return null;
          const name = typeof entry.name === 'string' ? entry.name.trim() : '';
          if (!name) return null;
          const percentageRaw = entry.percentage;
          const percentage = typeof percentageRaw === 'number'
            ? percentageRaw
            : (typeof percentageRaw === 'string' ? Number(percentageRaw) : null);
          return Number.isFinite(percentage) ? { name, percentage } : { name };
        })
        .filter(Boolean);
    } else if (Array.isArray(output.varieties)) {
      output.grapes = output.varieties
        .map((entry) => {
          if (typeof entry === 'string') return { name: entry.trim() };
          if (!entry || typeof entry !== 'object') return null;
          const name = typeof entry.name === 'string' ? entry.name.trim() : '';
          if (!name) return null;
          return { name };
        })
        .filter(Boolean);
    }
  }

  if (!Array.isArray(output.scores) && Array.isArray(output.critic_scores)) {
    output.scores = output.critic_scores
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const critic = typeof entry.critic === 'string'
          ? entry.critic.trim()
          : (typeof entry.source === 'string' ? entry.source.trim() : '');
        const rawScore = entry.score ?? entry.value;
        const score = typeof rawScore === 'number'
          ? rawScore
          : (typeof rawScore === 'string' ? rawScore.trim() : null);
        const yearRaw = entry.year ?? entry.vintage;
        const year = typeof yearRaw === 'number'
          ? yearRaw
          : (typeof yearRaw === 'string' ? Number(yearRaw) : null);
        if (!critic || !isFilledValue(score)) return null;
        return { critic, score, year: Number.isFinite(year) ? year : null };
      })
      .filter(Boolean);
  }

  if (!isFilledValue(output.drink_start) && !isFilledValue(output.drink_end) && isFilledValue(output.drinking_window)) {
    const windowText = String(output.drinking_window);
    const years = windowText.match(/\b(19|20)\d{2}\b/g)?.map((year) => Number(year)) || [];
    if (years.length >= 2) {
      output.drink_start = years[0];
      output.drink_end = years[years.length - 1];
    }
  }

  const setMissing = (key) => missing.add(key);
  const ensureString = (key) => {
    if (typeof output[key] !== 'string' || output[key].trim() === '') {
      output[key] = null;
      setMissing(key);
    }
  };
  const ensureNumber = (key) => {
    const value = output[key];
    const number = typeof value === 'number'
      ? value
      : (typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN);
    if (!Number.isFinite(number)) {
      output[key] = null;
      setMissing(key);
    } else {
      output[key] = number;
    }
  };
  const ensureArray = (key) => {
    if (!Array.isArray(output[key])) {
      output[key] = [];
      setMissing(key);
    }
  };
  const sourceDomain = (url) => {
    if (typeof url !== 'string' || url.trim() === '') return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  };
  const hasDomain = (sources, domainPart) =>
    Array.isArray(sources) && sources.some((entry) => sourceDomain(entry?.url).includes(domainPart));

  ensureString('name');
  ensureString('producer');
  ensureNumber('vintage');
  ensureString('region');
  ensureString('country');
  ensureString('appellation');
  ensureArray('grapes');
  ensureNumber('alcohol_percent');
  ensureNumber('drink_start');
  ensureNumber('drink_end');
  ensureNumber('peak_year');
  ensureArray('aromas');
  if (Array.isArray(output.aromas)) {
    output.aromas = output.aromas.map((aroma) => {
      if (!aroma || typeof aroma !== 'object') return aroma;
      const intensity = aroma.intensity;
      if (typeof intensity === 'string') {
        const normalized = intensity.toLowerCase();
        if (['high', 'hoch'].includes(normalized)) aroma.intensity = 5;
        else if (['medium', 'mittel'].includes(normalized)) aroma.intensity = 3;
        else if (['low', 'niedrig'].includes(normalized)) aroma.intensity = 1;
      }
      return aroma;
    });
  }
  if (typeof output.structure !== 'object' || output.structure === null) {
    output.structure = {};
    setMissing('structure');
  }
  ensureArray('pairings');
  if (typeof output.vinification !== 'object' || output.vinification === null) {
    output.vinification = {};
    setMissing('vinification');
  }
  ensureArray('scores');
  if (Array.isArray(output.scores) && output.scores.length === 0) {
    const detailsCritics = output?.details?.ratings?.critics;
    if (Array.isArray(detailsCritics) && detailsCritics.length > 0) {
      output.scores = detailsCritics
        .map((item) => ({
          critic: item?.source ?? null,
          score: item?.value ?? null,
          year: item?.vintage ?? null
        }))
        .filter((item) => typeof item.critic === 'string' && item.critic.trim() !== '' && item.score !== null);
    }
  }
  if (Array.isArray(output.scores) && output.scores.length === 0) {
    setMissing('scores');
    issues.push('scores_external_critics');
  }
  if (output.details !== undefined && (typeof output.details !== 'object' || output.details === null)) {
    output.details = {};
    setMissing('details');
  }
  if (output.sources !== undefined && !Array.isArray(output.sources)) {
    output.sources = [];
    setMissing('sources');
  }
  if (Array.isArray(output.sources) && output.sources.length < 3) {
    setMissing('sources');
    issues.push('sources_min_3');
  }
  if (!hasDomain(output.sources, 'gute-weine.de')) {
    setMissing('sources');
    issues.push('sources_require_gute_weine');
  }
  if (!hasDomain(output.sources, 'wine-searcher.com')) {
    setMissing('sources');
    issues.push('sources_require_wine_searcher');
  }

  const missingCount = missing.size;
  if (typeof output.confidence === 'number') {
    if (output.confidence >= 0.75) output.confidence = 'high';
    else if (output.confidence >= 0.4) output.confidence = 'medium';
    else output.confidence = 'low';
  } else if (typeof output.confidence === 'string') {
    const confidence = output.confidence.toLowerCase();
    if (!['high', 'medium', 'low'].includes(confidence)) output.confidence = 'medium';
    else output.confidence = confidence;
  } else if (missingCount > 6) {
    output.confidence = 'low';
  } else {
    output.confidence = 'medium';
  }

  output.missing_fields = Array.from(missing);
  if (output.missing_fields.length > 0) {
    issues.push('missing_fields');
  }

  return { data: output, issues };
};
