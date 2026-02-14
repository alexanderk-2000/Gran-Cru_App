export const APPROVED_GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

export const isGeminiRetryableError = (sanitizeError, err) => {
  const msg = sanitizeError(err || {});
  return /quota|429|rate limit|too many requests|404|not found|is not supported|model/i.test(msg);
};
