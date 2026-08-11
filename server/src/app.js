import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerHealthRoute } from './routes/health.js';
import { registerAiSearchRoute } from './routes/aiSearch.js';
import { registerAiAssignmentRoute } from './routes/aiAssignment.js';
import { registerAiVisionRoute } from './routes/aiVision.js';
import { createAiRuntime } from './ai/runtime.js';
import { createRequireAuth } from './middleware/requireAuth.js';
import { createAiRateLimiter } from './middleware/rateLimit.js';

// Resolve relative to this file rather than process.cwd() - `npm run server`
// runs with cwd=server/ but `vitest run` (repo root) imports this module
// with cwd=repo root, which would otherwise silently load the wrong .env.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const app = express();
const PORT = process.env.PORT || 3001;

// On Vercel the function is hard-killed at its configured maxDuration
// (60s, see vercel.json) - a 120s internal timeout would never fire and the
// caller would get a platform error page instead of our JSON error. Stay
// just under the limit there; keep the generous default for local runs.
const DEFAULT_REQUEST_TIMEOUT = process.env.VERCEL ? 55000 : 120000;
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || DEFAULT_REQUEST_TIMEOUT);
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 4096);
const FAST_OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_OPENAI_MAX_OUTPUT_TOKENS || 1800);
const FAST_GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_GEMINI_MAX_OUTPUT_TOKENS || 1800);
const OPENROUTER_MAX_OUTPUT_TOKENS = Number(process.env.OPENROUTER_MAX_OUTPUT_TOKENS || 4096);
const FAST_OPENROUTER_MAX_OUTPUT_TOKENS = Number(process.env.FAST_OPENROUTER_MAX_OUTPUT_TOKENS || 1800);
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const AI_CACHE_MAX_ENTRIES = Number(process.env.AI_CACHE_MAX_ENTRIES || 600);
const AI_RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
const AI_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 30);

const aiRuntime = createAiRuntime({
  requestTimeout: REQUEST_TIMEOUT,
  geminiMaxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  openaiMaxOutputTokens: OPENAI_MAX_OUTPUT_TOKENS,
  fastOpenaiMaxOutputTokens: FAST_OPENAI_MAX_OUTPUT_TOKENS,
  fastGeminiMaxOutputTokens: FAST_GEMINI_MAX_OUTPUT_TOKENS,
  openrouterMaxOutputTokens: OPENROUTER_MAX_OUTPUT_TOKENS,
  fastOpenrouterMaxOutputTokens: FAST_OPENROUTER_MAX_OUTPUT_TOKENS,
  cacheTtlMs: AI_CACHE_TTL_MS,
  cacheMaxEntries: AI_CACHE_MAX_ENTRIES,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  appUrl: process.env.APP_URL,
  appName: process.env.APP_NAME
});

const requireAuth = createRequireAuth({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY
});
const aiRateLimiter = createAiRateLimiter({
  windowMs: AI_RATE_LIMIT_WINDOW_MS,
  maxRequests: AI_RATE_LIMIT_MAX_REQUESTS
});
// In the deployment the SPA and this app share an origin, so CORS never
// applies there. The list only matters for local split-port development
// (Vite on 3000, this server on 3001); CORS_ORIGINS allows extending it
// without a code change.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT, () => {
    res.status(408).json({
      success: false,
      error: 'Request timeout - operation took too long'
    });
  });
  next();
});

registerHealthRoute(app, () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  // Every model family (Gemini/OpenAI/Nemotron) is reached through this one
  // OpenRouter key now - there is no separate direct Google/OpenAI SDK
  // integration left to report on.
  openrouter: Boolean(process.env.OPENROUTER_API_KEY)
}));

// Every AI endpoint incurs paid provider cost via OpenRouter - require a
// valid Supabase session and rate-limit before any of them run.
app.use('/api/ai', requireAuth, aiRateLimiter);

const providerLabel = (provider) => (provider === 'openai' ? 'OpenAI' : provider === 'openrouter' ? 'OpenRouter' : 'Gemini');

registerAiSearchRoute(app, async (req, res) => {
  const provider = req.body?.provider === 'openai' ? 'openai' : req.body?.provider === 'openrouter' ? 'openrouter' : 'gemini';
  try {
    const result = await aiRuntime.searchWine(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const safeError = aiRuntime.sanitizeError(error);
    const isTimeout = /timeout/i.test(safeError);
    const isOverloaded = /overloaded|503|service unavailable/i.test(safeError);
    const status = error?.status || (isTimeout ? 408 : isOverloaded ? 503 : 500);
    console.error(`${providerLabel(provider)} API Error:`, safeError);
    return res.status(status).json({
      success: false,
      error: `${providerLabel(provider)} API error: ${safeError}`
    });
  }
});

registerAiAssignmentRoute(app, async (req, res) => {
  try {
    const result = await aiRuntime.assignWine(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ success: false, error: aiRuntime.sanitizeError(error) });
  }
});

registerAiVisionRoute(app, async (req, res) => {
  try {
    const result = await aiRuntime.scanVision(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const status = error?.status || 500;
    console.error('Vision API Error:', aiRuntime.sanitizeError(error));
    return res.status(status).json({ success: false, error: aiRuntime.sanitizeError(error) });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.use((error, req, res, _next) => {
  console.error('Unhandled error:', aiRuntime.sanitizeError(error));
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

export { app };

export const startServer = () => app.listen(PORT, () => {
  console.log(`🍷 Wine Vault API Server running on http://localhost:${PORT}`);
  console.log(`   OpenRouter API: ${process.env.OPENROUTER_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Request Timeout: ${REQUEST_TIMEOUT / 1000}s`);
});
