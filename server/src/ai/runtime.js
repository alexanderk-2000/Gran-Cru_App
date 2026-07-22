import OpenAI from 'openai';
import {
  VISION_MODEL_CANDIDATES,
  resolveModelCandidates,
  isRetryableModelError
} from './providers/modelCatalog.js';
import { normalizeWineJson } from './normalize/normalizeWineJson.js';
import { buildProfilePrompt } from './prompts/profile.js';
import { buildRepairPrompt } from './prompts/repair.js';
import { createAiCache } from '../cache/aiCache.js';

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isFilledValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const normalizeToken = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '');

const buildSearchIdentity = (body) => {
  const vintage = body?.vintage ? String(body.vintage).trim() : '';
  const producer = normalizeToken(body?.producer || '');
  const wineName = normalizeToken(body?.wineName || body?.name || '');
  const query = [vintage, producer, wineName].filter(Boolean).join(' ').trim();
  const fallbackPrompt = normalizeToken((body?.prompt || '').slice(0, 180));
  return query || fallbackPrompt || 'unknown-wine-query';
};

const buildCacheKey = ({ provider, model, query }) =>
  `${provider}::${normalizeToken(model || '')}::${normalizeToken(query)}`;

const sanitizeError = (error) => {
  const message = error?.message || 'Unknown error';
  return message
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[API_KEY]')
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[API_KEY]');
};

const validateAIRequest = (body) => {
  if (!body.prompt || typeof body.prompt !== 'string') {
    return 'Invalid request: prompt is required and must be a string';
  }

  if (body.prompt.trim().length === 0) {
    return 'Invalid request: prompt cannot be empty';
  }

  if (body.prompt.length > 50000) {
    return 'Invalid request: prompt is too long (max 50000 characters)';
  }

  return null;
};

const hasRequiredDomains = (sources) => {
  if (!Array.isArray(sources)) return false;
  const domains = sources
    .map((entry) => {
      try {
        return new URL(entry?.url || '').hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const hasGuteWeine = domains.some((domain) => domain.includes('gute-weine.de'));
  const hasWineSearcher = domains.some((domain) => domain.includes('wine-searcher.com'));
  return hasGuteWeine && hasWineSearcher && domains.length >= 3;
};

const isFastResultAdequate = (data) => {
  if (!data || typeof data !== 'object') return false;
  const required = ['name', 'producer', 'vintage', 'region'];
  for (const key of required) {
    if (!isFilledValue(data[key])) return false;
  }
  return hasRequiredDomains(data.sources);
};

const mergeWineResult = (fastData, fullData) => {
  const merged = { ...(fastData || {}), ...(fullData || {}) };
  const mergeArray = (key) => {
    const left = Array.isArray(fastData?.[key]) ? fastData[key] : [];
    const right = Array.isArray(fullData?.[key]) ? fullData[key] : [];
    if (left.length === 0) return right;
    if (right.length === 0) return left;
    return [...left, ...right].filter((item, index, array) => {
      const identity = JSON.stringify(item);
      return array.findIndex((current) => JSON.stringify(current) === identity) === index;
    });
  };

  merged.grapes = mergeArray('grapes');
  merged.aromas = mergeArray('aromas');
  merged.pairings = mergeArray('pairings');
  merged.scores = mergeArray('scores');
  merged.sources = mergeArray('sources');

  if (!isFilledValue(merged.short_description_de) && isFilledValue(fastData?.short_description_de)) {
    merged.short_description_de = fastData.short_description_de;
  }

  return merged;
};

const tryParseJson = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;
  try {
    return JSON.parse(rawText);
  } catch {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = rawText.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
};

const unwrapModelResponse = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data[0] || {};
  if (Object.prototype.hasOwnProperty.call(data, '0') && typeof data[0] === 'object') {
    return data[0];
  }
  return data;
};

const buildWebSearchEnforcedPrompt = (prompt) => `${prompt}

KRITISCH:
- Nutze verpflichtend Web-Recherche (Browser/Web Search Tool) für alle faktischen Aussagen.
- Ohne Web-Recherche dürfen keine Fakten behauptet werden.
- Füge belastbare Quellen in "sources" hinzu (URL).
- "sources" muss mindestens enthalten:
  1) eine Quelle von gute-weine.de
  2) eine Quelle von wine-searcher.com
  3) mindestens eine weitere unabhängige Quelle.
- Suche aktiv nach Kritikerbewertungen (mindestens versuchen): James Suckling, Robert Parker/Wine Advocate, Vinous, Decanter, Jancis Robinson, Falstaff.
- Übernimm gefundene Kritiker-Scores in "scores" (critic, score, year).
`;

// Every AI connection - Gemini, GPT, Nemotron - now goes through this single
// OpenRouter client. OpenRouter exposes an OpenAI-compatible Chat Completions
// API for all of them, so there is exactly one HTTP integration, one API key
// and one retry/cache/normalize pipeline to maintain instead of three. The
// ":online" model-slug suffix turns on OpenRouter's web-search plugin, which
// gives every model family the same real grounding (previously only OpenAI's
// own web_search_preview tool did real research; Gemini was prompt-only, see
// docs/WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md).
const createModelCaller = ({ openrouterApiKey, appUrl, appName }) => {
  const client = openrouterApiKey
    ? new OpenAI({
        apiKey: openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': appUrl || 'http://localhost:3000',
          'X-Title': appName || 'Grand Cru Vault'
        }
      })
    : null;

  return async (providerKey, prompt, requestedModel, temperature, maxOutputTokens, { online = true } = {}) => {
    if (!client) {
      throw createHttpError(500, 'OPENROUTER_API_KEY not configured. Please add it to server/.env file.');
    }

    const candidateModels = resolveModelCandidates(providerKey, requestedModel);
    const content = online ? buildWebSearchEnforcedPrompt(prompt) : prompt;

    const lastErrors = [];
    for (const model of candidateModels) {
      try {
        const response = await client.chat.completions.create({
          model: online ? `${model}:online` : model,
          messages: [{ role: 'user', content }],
          temperature,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' }
        });

        const text = response?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.trim().length === 0) {
          throw new Error(`Model ${model} returned empty content`);
        }

        const usedWebSearch = online && Array.isArray(response?.citations) && response.citations.length > 0;
        return { text, model, usedWebSearch };
      } catch (error) {
        if (isRetryableModelError(sanitizeError, error)) {
          lastErrors.push({ model, error: sanitizeError(error) });
          continue;
        }
        throw error;
      }
    }

    const error = new Error(`All candidate models failed for ${providerKey}: ${candidateModels.join(', ')}`);
    error.details = lastErrors;
    throw error;
  };
};

const visionPrompt = `Analysiere dieses Weinetikett-Foto. Extrahiere folgende Informationen und antworte ausschließlich als JSON:

{
  "name": "Vollständiger Weinname",
  "producer": "Weingut / Produzent",
  "vintage": 2020,
  "region": "Region falls erkennbar",
  "raw": "Gesamter erkennbarer Text auf dem Etikett"
}

Regeln:
- Nur JSON ausgeben, kein zusätzlicher Text.
- Falls ein Feld nicht erkennbar ist: null setzen.
- "vintage" als Zahl.
- "raw" enthält den gesamten lesbaren Text.`;

const createVisionCaller = ({ openrouterApiKey, appUrl, appName }) => {
  const client = openrouterApiKey
    ? new OpenAI({
        apiKey: openrouterApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': appUrl || 'http://localhost:3000',
          'X-Title': appName || 'Grand Cru Vault'
        }
      })
    : null;

  return async (base64Image, mimeType) => {
    if (!client) {
      throw createHttpError(500, 'OPENROUTER_API_KEY not configured. Please add it to server/.env file.');
    }

    for (const model of VISION_MODEL_CANDIDATES) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Image}` } }
            ]
          }],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' }
        });

        const text = response?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim().length > 0) {
          return text;
        }
      } catch (error) {
        if (isRetryableModelError(sanitizeError, error)) continue;
        throw error;
      }
    }

    return null;
  };
};

export const createAiRuntime = ({
  requestTimeout,
  geminiMaxOutputTokens,
  openaiMaxOutputTokens,
  fastOpenaiMaxOutputTokens,
  fastGeminiMaxOutputTokens,
  openrouterMaxOutputTokens,
  fastOpenrouterMaxOutputTokens,
  cacheTtlMs,
  cacheMaxEntries,
  openrouterApiKey,
  appUrl,
  appName
}) => {
  const cache = createAiCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries });
  const callModel = createModelCaller({ openrouterApiKey, appUrl, appName });
  const callVisionModel = createVisionCaller({ openrouterApiKey, appUrl, appName });

  const runProviderRequest = async ({ provider, prompt, model, temperature, maxOutputTokens, online }) =>
    callModel(provider, prompt, model, temperature, maxOutputTokens, { online });

  const executeAndNormalize = async ({
    provider,
    prompt,
    model,
    temperature,
    maxOutputTokens,
    allowRepair,
    online
  }) => {
    const innerTimeout = Math.max(15000, requestTimeout - 5000);
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('AI request timeout')), innerTimeout);
    });

    const providerPromise = runProviderRequest({ provider, prompt, model, temperature, maxOutputTokens, online });

    let providerResult;
    try {
      providerResult = await Promise.race([providerPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const { text, model: resolvedModel, usedWebSearch } = providerResult;

    let jsonData = tryParseJson(text);
    jsonData = unwrapModelResponse(jsonData);

    if (!jsonData && allowRepair) {
      const repairPrompt = buildRepairPrompt(prompt, ['invalid_json'], { raw: text });
      const repairResult = await runProviderRequest({ provider, prompt: repairPrompt, model, temperature: 0.2, maxOutputTokens, online });
      jsonData = unwrapModelResponse(tryParseJson(repairResult.text));
    }

    if (!jsonData) {
      return {
        normalized: null,
        rawText: text,
        resolvedModel,
        usedWebSearch: Boolean(usedWebSearch)
      };
    }

    let normalized = normalizeWineJson(jsonData);
    const shouldRepairByIssues = allowRepair && normalized.issues.length > 0;
    if (shouldRepairByIssues) {
      const repairPrompt = buildRepairPrompt(prompt, normalized.issues, jsonData);
      const repairResult = await runProviderRequest({ provider, prompt: repairPrompt, model, temperature: 0.2, maxOutputTokens, online });
      const repairedJson = unwrapModelResponse(tryParseJson(repairResult.text));
      if (repairedJson) normalized = normalizeWineJson(repairedJson);
    }

    return {
      normalized,
      rawText: text,
      resolvedModel,
      usedWebSearch: Boolean(usedWebSearch)
    };
  };

  const selectMaxOutputTokens = (provider, fast) => {
    if (provider === 'openai') return fast ? fastOpenaiMaxOutputTokens : openaiMaxOutputTokens;
    if (provider === 'openrouter') return fast ? fastOpenrouterMaxOutputTokens : openrouterMaxOutputTokens;
    return fast ? fastGeminiMaxOutputTokens : geminiMaxOutputTokens;
  };

  const searchWine = async (body) => {
    const validationError = validateAIRequest(body);
    if (validationError) {
      throw createHttpError(400, validationError);
    }

    const { prompt, model } = body;
    const provider = body?.provider === 'openai' ? 'openai' : body?.provider === 'openrouter' ? 'openrouter' : 'gemini';
    const searchModeRaw = typeof body?.search_mode === 'string' ? body.search_mode.toLowerCase() : 'adaptive';
    const searchMode = ['fast', 'full', 'adaptive'].includes(searchModeRaw) ? searchModeRaw : 'adaptive';

    const queryIdentity = buildSearchIdentity(body);
    const cacheKey = buildCacheKey({
      provider,
      model: model || '',
      query: queryIdentity
    });

    const cached = cache.get(cacheKey);
    if (cached && searchMode !== 'full') {
      return {
        status: 200,
        body: {
          ...cached,
          cache_hit: true
        }
      };
    }

    const fastPrompt = buildProfilePrompt({
      profile: 'fast',
      query: queryIdentity,
      rawPrompt: prompt
    });

    const fastRun = await executeAndNormalize({
      provider,
      prompt: fastPrompt,
      model,
      temperature: 0.3,
      maxOutputTokens: selectMaxOutputTokens(provider, true),
      allowRepair: true,
      online: true
    });

    const fastData = fastRun.normalized?.data || null;
    if (!fastData && searchMode === 'fast') {
      throw createHttpError(502, 'AI response could not be parsed as JSON in fast mode');
    }

    const allowFastReturn = searchMode === 'fast' || (searchMode === 'adaptive' && isFastResultAdequate(fastData));
    if (fastData && allowFastReturn) {
      const payload = {
        success: true,
        data: fastData,
        provider,
        model: fastRun.resolvedModel,
        web_research: fastRun.usedWebSearch,
        search_profile: 'fast'
      };
      cache.set(cacheKey, payload);
      return {
        status: 200,
        body: {
          ...payload,
          cache_hit: false
        }
      };
    }

    const fullPrompt = buildProfilePrompt({
      profile: 'full',
      query: queryIdentity,
      rawPrompt: prompt
    });

    const fullRun = await executeAndNormalize({
      provider,
      prompt: fullPrompt,
      model,
      temperature: 0.45,
      maxOutputTokens: selectMaxOutputTokens(provider, false),
      allowRepair: true,
      online: true
    });

    if (!fullRun.normalized) {
      if (!fastData) {
        throw createHttpError(502, 'AI response could not be parsed as JSON in fast and full mode');
      }

      const fallbackPayload = {
        success: true,
        data: fastData,
        provider,
        model: fastRun.resolvedModel,
        web_research: fastRun.usedWebSearch,
        search_profile: 'fast-fallback'
      };
      cache.set(cacheKey, fallbackPayload);
      return {
        status: 200,
        body: {
          ...fallbackPayload,
          cache_hit: false
        }
      };
    }

    const mergedData = fastData
      ? mergeWineResult(fastData, fullRun.normalized.data)
      : fullRun.normalized.data;

    const finalPayload = {
      success: true,
      data: mergedData,
      provider,
      model: fullRun.resolvedModel || fastRun.resolvedModel,
      web_research: fullRun.usedWebSearch || fastRun.usedWebSearch,
      search_profile: 'full'
    };
    cache.set(cacheKey, finalPayload);

    return {
      status: 200,
      body: {
        ...finalPayload,
        cache_hit: false
      }
    };
  };

  const assignWine = async (body) => {
    const prompt = body?.prompt;
    if (!prompt) {
      throw createHttpError(400, 'Prompt is required');
    }

    const provider = body?.provider === 'openai' ? 'openai' : body?.provider === 'openrouter' ? 'openrouter' : 'gemini';
    // Internal reasoning over data the server already fetched - no web
    // research needed, so this skips the ":online" plugin.
    const { text } = await callModel(provider, prompt, body?.model, 0.3, selectMaxOutputTokens(provider, false), { online: false });
    const jsonData = tryParseJson(text);

    return {
      status: 200,
      body: {
        success: true,
        data: jsonData
      }
    };
  };

  const scanVision = async (body) => {
    const { image, mimeType } = body || {};
    if (!image || typeof image !== 'string') {
      throw createHttpError(400, 'Base64 image is required');
    }

    const visionResult = await callVisionModel(image, mimeType);
    if (!visionResult) {
      throw createHttpError(502, 'Vision API konnte Bild nicht verarbeiten');
    }

    const parsed = tryParseJson(visionResult);
    if (!parsed) {
      return {
        status: 502,
        body: {
          success: false,
          error: 'Vision API returned invalid JSON',
          raw: visionResult
        }
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        name: parsed.name || null,
        producer: parsed.producer || null,
        vintage: parsed.vintage || null,
        region: parsed.region || null,
        raw: parsed.raw || visionResult
      }
    };
  };

  return {
    sanitizeError,
    searchWine,
    assignWine,
    scanVision
  };
};
