import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerHealthRoute } from './routes/health.js';
import { registerAiSearchRoute } from './routes/aiSearch.js';
import { registerAiAssignmentRoute } from './routes/aiAssignment.js';
import { registerAiVisionRoute } from './routes/aiVision.js';
import { createAiRuntime } from './ai/runtime.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 120000);
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 4096);
const FAST_OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_OPENAI_MAX_OUTPUT_TOKENS || 1800);
const FAST_GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_GEMINI_MAX_OUTPUT_TOKENS || 1800);
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const AI_CACHE_MAX_ENTRIES = Number(process.env.AI_CACHE_MAX_ENTRIES || 600);

const aiRuntime = createAiRuntime({
  requestTimeout: REQUEST_TIMEOUT,
  geminiMaxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  openaiMaxOutputTokens: OPENAI_MAX_OUTPUT_TOKENS,
  fastOpenaiMaxOutputTokens: FAST_OPENAI_MAX_OUTPUT_TOKENS,
  fastGeminiMaxOutputTokens: FAST_GEMINI_MAX_OUTPUT_TOKENS,
  cacheTtlMs: AI_CACHE_TTL_MS,
  cacheMaxEntries: AI_CACHE_MAX_ENTRIES,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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
  gemini: Boolean(process.env.GEMINI_API_KEY),
  openai: Boolean(process.env.OPENAI_API_KEY)
}));

registerAiSearchRoute(app, async (req, res) => {
  const provider = req.body?.provider === 'openai' ? 'openai' : 'gemini';
  try {
    const result = await aiRuntime.searchWine(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const safeError = aiRuntime.sanitizeError(error);
    const isTimeout = /timeout/i.test(safeError);
    const isOverloaded = /overloaded|503|service unavailable/i.test(safeError);
    const status = error?.status || (isTimeout ? 408 : isOverloaded ? 503 : 500);
    console.error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} API Error:`, safeError);
    return res.status(status).json({
      success: false,
      error: `${provider === 'openai' ? 'OpenAI' : 'Gemini'} API error: ${safeError}`
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
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Request Timeout: ${REQUEST_TIMEOUT / 1000}s`);
});
