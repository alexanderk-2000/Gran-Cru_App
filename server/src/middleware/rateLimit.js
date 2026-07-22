// Minimal in-memory sliding-window rate limiter, scoped to the AI routes.
// No new dependency: the AI endpoints are the only cost-incurring surface
// (OpenAI/Gemini/OpenRouter calls), a full general-purpose limiter isn't
// needed elsewhere yet. Keyed by authenticated user id (falls back to IP
// if auth ran without setting req.userId).
export const createAiRateLimiter = ({ windowMs = 5 * 60 * 1000, maxRequests = 30 } = {}) => {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((ts) => now - ts < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.userId || req.ip;
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((ts) => now - ts < windowMs);

    if (timestamps.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded: max ${maxRequests} AI requests per ${Math.round(windowMs / 60000)} minutes`
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
};
