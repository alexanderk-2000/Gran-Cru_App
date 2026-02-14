export const resolveOpenAIModel = (requestedModel) => {
  if (typeof requestedModel !== 'string') return 'gpt-5.2';
  const normalized = requestedModel.trim().toLowerCase();
  if (!normalized) return 'gpt-5.2';

  const aliases = {
    '5.2': 'gpt-5.2',
    '5': 'gpt-5',
    '4o': 'gpt-4o',
    '4o-mini': 'gpt-4o-mini'
  };

  return aliases[normalized] || requestedModel.trim();
};

export const isOpenAIRetryableError = (sanitizeError, err) => {
  const msg = sanitizeError(err || {});
  return /429|rate limit|too many requests|model|not found|does not exist|unsupported|web_search|tool/i.test(msg);
};
