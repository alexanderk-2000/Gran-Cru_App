import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { APPROVED_GEMINI_MODELS, isGeminiRetryableError } from './providers/gemini.js';
import { resolveOpenAIModel, isOpenAIRetryableError } from './providers/openai.js';
import {
  APPROVED_OPENROUTER_MODELS,
  resolveOpenRouterModel,
  isOpenRouterRetryableError
} from './providers/openrouter.js';
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

const createGeminiCaller = ({ geminiApiKey }) => async (prompt, temperature, maxOutputTokens) => {
  if (!geminiApiKey) {
    throw createHttpError(500, 'GEMINI_API_KEY not configured. Please add it to server/.env file.');
  }

  const lastErrors = [];
  for (const model of APPROVED_GEMINI_MODELS) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const genModel = genAI.getGenerativeModel({ model });
      const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json'
        }
      });
      return { result, model };
    } catch (error) {
      if (isGeminiRetryableError(sanitizeError, error)) {
        lastErrors.push({ model, error: sanitizeError(error) });
        continue;
      }
      throw error;
    }
  }

  const error = new Error(`Gemini failed for all candidate models: ${lastErrors.map((entry) => entry.model).join(', ')}`);
  error.details = lastErrors;
  throw error;
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

const createOpenAiCaller = ({ openaiApiKey }) => async (prompt, requestedModel, temperature, maxOutputTokens) => {
  if (!openaiApiKey) {
    throw createHttpError(500, 'OPENAI_API_KEY not configured. Please add it to server/.env file.');
  }

  const client = new OpenAI({ apiKey: openaiApiKey });
  const preferred = resolveOpenAIModel(requestedModel);
  const fallbackModels = ['gpt-5.2', 'gpt-5', 'gpt-4o', 'gpt-4o-mini'];
  const candidateModels = [preferred, ...fallbackModels.filter((item) => item !== preferred)];

  const lastErrors = [];
  for (const model of candidateModels) {
    try {
      const webSearchEnforcedPrompt = buildWebSearchEnforcedPrompt(prompt);

      const response = await client.responses.create({
        model,
        input: webSearchEnforcedPrompt,
        temperature,
        max_output_tokens: maxOutputTokens,
        tools: [
          {
            type: 'web_search_preview',
            user_location: {
              type: 'approximate',
              country: 'US'
            }
          }
        ],
        tool_choice: { type: 'web_search_preview' }
      });

      const text = response?.output_text;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error(`OpenAI model ${model} returned empty content`);
      }

      const usedWebSearch = Array.isArray(response?.output)
        && response.output.some((item) => item?.type === 'web_search_call');

      if (!usedWebSearch) {
        throw new Error(`OpenAI model ${model} did not execute required web_search_call`);
      }

      return { text, model, usedWebSearch };
    } catch (error) {
      if (isOpenAIRetryableError(sanitizeError, error)) {
        lastErrors.push({ model, error: sanitizeError(error) });
        continue;
      }
      throw error;
    }
  }

  const error = new Error(`OpenAI failed for all candidate models: ${candidateModels.join(', ')}`);
  error.details = lastErrors;
  throw error;
};

// OpenRouter exposes an OpenAI-compatible Chat Completions API. Appending
// ":online" to the model slug turns on OpenRouter's web-search plugin (Exa),
// giving Nemotron the same "must actually research the web" grounding that
// the OpenAI path gets via web_search_preview - Gemini has no such tool and
// is prompt-only, see docs/WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md.
const createOpenRouterCaller = ({ openrouterApiKey, appUrl, appName }) => async (prompt, requestedModel, temperature, maxOutputTokens) => {
  if (!openrouterApiKey) {
    throw createHttpError(500, 'OPENROUTER_API_KEY not configured. Please add it to server/.env file.');
  }

  const client = new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': appUrl || 'http://localhost:3000',
      'X-Title': appName || 'Grand Cru Vault'
    }
  });

  const preferred = resolveOpenRouterModel(requestedModel);
  const candidateModels = [preferred, ...APPROVED_OPENROUTER_MODELS.filter((item) => item !== preferred)];

  const lastErrors = [];
  for (const model of candidateModels) {
    try {
      const response = await client.chat.completions.create({
        model: `${model}:online`,
        messages: [{ role: 'user', content: buildWebSearchEnforcedPrompt(prompt) }],
        temperature,
        max_tokens: maxOutputTokens,
        response_format: { type: 'json_object' }
      });

      const text = response?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new Error(`OpenRouter model ${model} returned empty content`);
      }

      const usedWebSearch = Array.isArray(response?.citations) && response.citations.length > 0;

      return { text, model, usedWebSearch };
    } catch (error) {
      if (isOpenRouterRetryableError(sanitizeError, error)) {
        lastErrors.push({ model, error: sanitizeError(error) });
        continue;
      }
      throw error;
    }
  }

  const error = new Error(`OpenRouter failed for all candidate models: ${candidateModels.join(', ')}`);
  error.details = lastErrors;
  throw error;
};

const extractTextFromProviderResult = async (provider, providerResult) => {
  if (provider === 'openai' || provider === 'openrouter') {
    return {
      text: providerResult.text,
      model: providerResult.model,
      usedWebSearch: Boolean(providerResult.usedWebSearch)
    };
  }

  const response = await providerResult.result.response;
  return { text: response.text(), model: providerResult.model, usedWebSearch: false };
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
  geminiApiKey,
  openaiApiKey,
  openrouterApiKey,
  appUrl,
  appName
}) => {
  const cache = createAiCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries });
  const callGeminiWithFallback = createGeminiCaller({ geminiApiKey });
  const callOpenAIWithFallback = createOpenAiCaller({ openaiApiKey });
  const callOpenRouterWithFallback = createOpenRouterCaller({ openrouterApiKey, appUrl, appName });

  const runProviderRequest = async ({
    provider,
    prompt,
    model,
    temperature,
    maxOutputTokens
  }) => {
    if (provider === 'openai') {
      return callOpenAIWithFallback(prompt, model, temperature, maxOutputTokens);
    }

    if (provider === 'openrouter') {
      return callOpenRouterWithFallback(prompt, model, temperature, maxOutputTokens);
    }

    return callGeminiWithFallback(prompt, temperature, maxOutputTokens);
  };

  const executeAndNormalize = async ({
    provider,
    prompt,
    model,
    temperature,
    maxOutputTokens,
    allowRepair
  }) => {
    const innerTimeout = Math.max(15000, requestTimeout - 5000);
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('AI request timeout')), innerTimeout);
    });

    const providerPromise = runProviderRequest({
      provider,
      prompt,
      model,
      temperature,
      maxOutputTokens
    });

    let providerResult;
    try {
      providerResult = await Promise.race([providerPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const { text, model: resolvedModel, usedWebSearch } = await extractTextFromProviderResult(provider, providerResult);

    let jsonData = tryParseJson(text);
    jsonData = unwrapModelResponse(jsonData);

    if (!jsonData && allowRepair) {
      const repairPrompt = buildRepairPrompt(prompt, ['invalid_json'], { raw: text });
      const repairResult = await runProviderRequest({
        provider,
        prompt: repairPrompt,
        model,
        temperature: 0.2,
        maxOutputTokens
      });
      const { text: repairText } = await extractTextFromProviderResult(provider, repairResult);
      jsonData = unwrapModelResponse(tryParseJson(repairText));
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
      const repairResult = await runProviderRequest({
        provider,
        prompt: repairPrompt,
        model,
        temperature: 0.2,
        maxOutputTokens
      });
      const { text: repairText } = await extractTextFromProviderResult(provider, repairResult);
      const repairedJson = unwrapModelResponse(tryParseJson(repairText));
      if (repairedJson) normalized = normalizeWineJson(repairedJson);
    }

    return {
      normalized,
      rawText: text,
      resolvedModel,
      usedWebSearch: Boolean(usedWebSearch)
    };
  };

  const supportsWebResearchFlag = (provider) => provider === 'openai' || provider === 'openrouter';
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
      allowRepair: provider !== 'openai'
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
        web_research: supportsWebResearchFlag(provider) ? fastRun.usedWebSearch : false,
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
      allowRepair: provider !== 'openai'
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
        web_research: supportsWebResearchFlag(provider) ? fastRun.usedWebSearch : false,
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
      web_research: supportsWebResearchFlag(provider) ? (fullRun.usedWebSearch || fastRun.usedWebSearch) : false,
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

    const result = await callGeminiWithFallback(prompt, 0.3, geminiMaxOutputTokens);
    const response = await result.result.response;
    const text = response.text();
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

    if (!geminiApiKey) {
      throw createHttpError(500, 'GEMINI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    let visionResult = null;
    const visionModels = ['gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    for (const modelName of visionModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: image
                }
              },
              {
                text: `Analysiere dieses Weinetikett-Foto. Extrahiere folgende Informationen und antworte ausschließlich als JSON:

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
- "raw" enthält den gesamten lesbaren Text.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        });

        const response = await result.response;
        visionResult = response.text();
        break;
      } catch (error) {
        if (isGeminiRetryableError(sanitizeError, error)) continue;
        throw error;
      }
    }

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
