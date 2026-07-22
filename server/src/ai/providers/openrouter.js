export const APPROVED_OPENROUTER_MODELS = [
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-nano-9b-v2',
  'nvidia/nemotron-nano-12b-v2-vl'
];

const MODEL_ALIASES = {
  nemotron: 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nemotron-70b': 'nvidia/llama-3.1-nemotron-70b-instruct',
  'nemotron-nano': 'nvidia/nemotron-nano-9b-v2'
};

export const resolveOpenRouterModel = (requestedModel) => {
  if (typeof requestedModel !== 'string') return APPROVED_OPENROUTER_MODELS[0];
  const normalized = requestedModel.trim().toLowerCase();
  if (!normalized) return APPROVED_OPENROUTER_MODELS[0];
  return MODEL_ALIASES[normalized] || requestedModel.trim();
};

export const isOpenRouterRetryableError = (sanitizeError, err) => {
  const msg = sanitizeError(err || {});
  return /429|rate limit|too many requests|model|not found|does not exist|unsupported|502|503|overloaded/i.test(msg);
};
