// Every AI connection goes through OpenRouter's single OpenAI-compatible
// API - there is no direct Google/OpenAI SDK integration anymore. The
// "provider" a user picks in Settings is really just a model *family*
// (which underlying vendor's model to route to via OpenRouter); this
// catalog maps that family + a stored/legacy model id to the actual
// OpenRouter model slug(s) to try, in order.

const GEMINI_ALIASES = {};
const GEMINI_FALLBACKS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

const OPENAI_ALIASES = {
  '5.2': 'gpt-5.2',
  '5': 'gpt-5',
  '4o': 'gpt-4o',
  '4o-mini': 'gpt-4o-mini'
};
const OPENAI_FALLBACKS = ['gpt-5.2', 'gpt-5', 'gpt-4o', 'gpt-4o-mini'];

const NEMOTRON_ALIASES = {
  nemotron: 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nemotron-70b': 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nemotron-nano': 'nvidia/nemotron-nano-9b-v2'
};
const NEMOTRON_FALLBACKS = [
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-nano-9b-v2',
  'nvidia/nemotron-nano-12b-v2-vl'
];

const FAMILIES = {
  gemini: { prefix: 'google/', aliases: GEMINI_ALIASES, fallbacks: GEMINI_FALLBACKS },
  openai: { prefix: 'openai/', aliases: OPENAI_ALIASES, fallbacks: OPENAI_FALLBACKS },
  openrouter: { prefix: '', aliases: NEMOTRON_ALIASES, fallbacks: NEMOTRON_FALLBACKS }
};

const qualify = (family, bareOrQualified) =>
  bareOrQualified.includes('/') ? bareOrQualified : `${family.prefix}${bareOrQualified}`;

// Vision-capable models, tried in order, for label OCR (server/src/ai/runtime.js scanVision).
export const VISION_MODEL_CANDIDATES = [
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash',
  'google/gemini-2.5-flash-lite'
];

export const resolveModelCandidates = (providerKey, requestedModel) => {
  const family = FAMILIES[providerKey] || FAMILIES.gemini;

  let preferred = '';
  if (typeof requestedModel === 'string' && requestedModel.trim()) {
    const trimmed = requestedModel.trim();
    const aliased = family.aliases[trimmed.toLowerCase()] || trimmed;
    preferred = qualify(family, aliased);
  }

  const fallbacks = family.fallbacks.map((model) => qualify(family, model));
  return Array.from(new Set([preferred, ...fallbacks].filter(Boolean)));
};

export const isRetryableModelError = (sanitizeError, err) => {
  const msg = sanitizeError(err || {});
  return /429|rate limit|too many requests|model|not found|does not exist|unsupported|502|503|overloaded/i.test(msg);
};
