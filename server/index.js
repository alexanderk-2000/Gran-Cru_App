import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Request timeout in milliseconds
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 120000);
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 4096);
const FAST_OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_OPENAI_MAX_OUTPUT_TOKENS || 1800);
const FAST_GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.FAST_GEMINI_MAX_OUTPUT_TOKENS || 1800);
const AI_CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const AI_CACHE_MAX_ENTRIES = Number(process.env.AI_CACHE_MAX_ENTRIES || 600);

// Approved models (enforced). Ordered by preference.
const APPROVED_GEMINI_MODELS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
];

const aiResponseCache = new Map();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json());

// Request timeout middleware
app.use((req, res, next) => {
    res.setTimeout(REQUEST_TIMEOUT, () => {
        res.status(408).json({
            success: false,
            error: 'Request timeout - operation took too long'
        });
    });
    next();
});

/**
 * Input validation helper
 */
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

/**
 * Sanitize error messages to avoid leaking sensitive information
 */
const sanitizeError = (error) => {
    const message = error.message || 'Unknown error';

    // Remove any potential API keys or sensitive data from error messages
    const sanitized = message
        .replace(/AIza[0-9A-Za-z_-]{35}/g, '[API_KEY]')
        .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[API_KEY]');

    return sanitized;
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

const pruneCache = () => {
    const now = Date.now();
    for (const [key, entry] of aiResponseCache.entries()) {
        if (!entry?.expiresAt || entry.expiresAt <= now) {
            aiResponseCache.delete(key);
        }
    }
    if (aiResponseCache.size <= AI_CACHE_MAX_ENTRIES) return;
    const sortable = [...aiResponseCache.entries()].sort(
        (a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0)
    );
    const dropCount = aiResponseCache.size - AI_CACHE_MAX_ENTRIES;
    for (let i = 0; i < dropCount; i += 1) {
        aiResponseCache.delete(sortable[i][0]);
    }
};

const getCachedResponse = (key) => {
    pruneCache();
    const hit = aiResponseCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        aiResponseCache.delete(key);
        return null;
    }
    return hit.value;
};

const setCachedResponse = (key, value) => {
    aiResponseCache.set(key, {
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + AI_CACHE_TTL_MS
    });
    pruneCache();
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
    const hasGuteWeine = domains.some((d) => d.includes('gute-weine.de'));
    const hasWineSearcher = domains.some((d) => d.includes('wine-searcher.com'));
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
        return [...left, ...right].filter((item, idx, arr) => {
            const identity = JSON.stringify(item);
            return arr.findIndex((x) => JSON.stringify(x) === identity) === idx;
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

const buildProfilePrompt = ({ profile, query, rawPrompt }) => {
    if (profile === 'fast') {
        return `Recherchiere den Wein: "${query}"

ZIEL (FAST PROFILE):
- Schnell verlässliche Kerndaten liefern. Kein Langtext, kein unnötiger Detailballast.
- Antworte ausschließlich als JSON.

Pflichtfelder:
name, producer, vintage, short_description_de, country, region, appellation, vineyard, wine_type, drink_start, peak_year, drink_end, scores[{critic,score,year}], sources[{title,url}], confidence, missing_fields[].

Regeln:
- Verpflichte Web-Recherche für Fakten.
- sources muss enthalten: gute-weine.de + wine-searcher.com + mindestens eine weitere Quelle.
- Kritiker-Scores aktiv versuchen: James Suckling, Robert Parker/Wine Advocate, Vinous, Decanter, Jancis Robinson, Falstaff.
- Falls etwas nicht verlässlich ist: null und in missing_fields aufnehmen.`;
    }

    return `${rawPrompt}

VOLLPROFIL:
- Ergänze fehlende Felder belastbar, ohne Halluzination.
- Nutze weiterhin Web-Recherche und halte Quellenpflicht ein.
- Liefere konsistentes JSON im gleichen Schema.`;
};

/**
 * Normalize and validate AI response to reduce hallucinations.
 * Ensures required keys exist, coerces obvious types, and fills missing_fields.
 */
const normalizeWineJson = (input) => {
    const output = typeof input === 'object' && input !== null ? { ...input } : {};
    const missing = new Set(Array.isArray(output.missing_fields) ? output.missing_fields : []);
    const issues = [];

    // Alias mapping from heterogeneous model outputs
    if (!isFilledValue(output.name) && isFilledValue(output.wine_name)) output.name = output.wine_name;
    if (!isFilledValue(output.name) && isFilledValue(output.title)) output.name = output.title;
    if (!isFilledValue(output.producer) && isFilledValue(output.winery)) output.producer = output.winery;
    if (!isFilledValue(output.producer) && isFilledValue(output.producer_name)) output.producer = output.producer_name;
    if (!isFilledValue(output.short_description_de) && isFilledValue(output.short_description)) output.short_description_de = output.short_description;
    if (!isFilledValue(output.short_description_de) && isFilledValue(output.style_description)) output.short_description_de = output.style_description;
    if (!isFilledValue(output.appellation) && isFilledValue(output.appellation_or_vineyard)) output.appellation = output.appellation_or_vineyard;
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
        const years = windowText.match(/\b(19|20)\d{2}\b/g)?.map((y) => Number(y)) || [];
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
        const val = output[key];
        const num = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' ? Number(val) : NaN);
        if (!Number.isFinite(num)) {
            output[key] = null;
            setMissing(key);
        } else {
            output[key] = num;
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
        output.aromas = output.aromas.map((a) => {
            if (!a || typeof a !== 'object') return a;
            const intensity = a.intensity;
            if (typeof intensity === 'string') {
                const normalized = intensity.toLowerCase();
                if (['high', 'hoch'].includes(normalized)) a.intensity = 5;
                else if (['medium', 'mittel'].includes(normalized)) a.intensity = 3;
                else if (['low', 'niedrig'].includes(normalized)) a.intensity = 1;
            }
            return a;
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

    // Normalize confidence
    const missingCount = missing.size;
    if (typeof output.confidence === 'number') {
        if (output.confidence >= 0.75) output.confidence = 'high';
        else if (output.confidence >= 0.4) output.confidence = 'medium';
        else output.confidence = 'low';
    } else if (typeof output.confidence === 'string') {
        const c = output.confidence.toLowerCase();
        if (!['high', 'medium', 'low'].includes(c)) output.confidence = 'medium';
        else output.confidence = c;
    } else {
        if (missingCount > 6) output.confidence = 'low';
        else if (missingCount > 3) output.confidence = 'medium';
        else output.confidence = 'medium';
    }

    output.missing_fields = Array.from(missing);
    if (output.missing_fields.length > 0) {
        issues.push('missing_fields');
    }

    return { data: output, issues };
};

const buildRepairPrompt = (originalPrompt, issues, previousJson) => {
    const needsGuteWeine = issues.includes('sources_require_gute_weine');
    const needsWineSearcher = issues.includes('sources_require_wine_searcher');
    const needsCritics = issues.includes('scores_external_critics');

    const targetedHints = [
        needsGuteWeine ? '- Quellen müssen mindestens eine URL von gute-weine.de enthalten.' : null,
        needsWineSearcher ? '- Quellen müssen mindestens eine URL von wine-searcher.com enthalten.' : null,
        needsCritics
            ? '- Suche aktiv nach externen Kritikerbewertungen (z. B. James Suckling, Robert Parker/Wine Advocate, Vinous, Decanter, Jancis Robinson, Falstaff) und fülle scores[]; falls nicht verfügbar, lasse score weg und setze fehlende Felder korrekt.'
            : null
    ].filter(Boolean).join('\n');

    return `${originalPrompt}

FEHLERKORREKTUR:
- Behebe diese Probleme: ${issues.join(', ')}.
- Keine neuen Fakten erfinden.
- Unbekannte Felder auf null setzen und in missing_fields aufnehmen.
- Antworte ausschließlich als JSON im geforderten Format.
${targetedHints ? `\n${targetedHints}` : ''}

VORHERIGE ANTWORT (zur Korrektur):
${JSON.stringify(previousJson)}
`;
};

const tryParseJson = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return null;
    try {
        return JSON.parse(rawText);
    } catch {
        // Try to extract the first JSON object
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
    // If numeric keys exist and first item is object, use it
    if (Object.prototype.hasOwnProperty.call(data, '0') && typeof data[0] === 'object') {
        return data[0];
    }
    return data;
};

const isGeminiRetryableError = (err) => {
    const msg = sanitizeError(err || {});
    return /quota|429|rate limit|too many requests|404|not found|is not supported|model/i.test(msg);
};

const callGeminiWithFallback = async (prompt, temperature, maxOutputTokens) => {
    const lastErrors = [];
    for (const model of APPROVED_GEMINI_MODELS) {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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
            if (isGeminiRetryableError(error)) {
                lastErrors.push({ model, error: sanitizeError(error) });
                continue;
            }
            throw error;
        }
    }
    const err = new Error(`Gemini failed for all candidate models: ${lastErrors.map(e => e.model).join(', ')}`);
    err.details = lastErrors;
    throw err;
};

const isOpenAIRetryableError = (err) => {
    const msg = sanitizeError(err || {});
    return /429|rate limit|too many requests|model|not found|does not exist|unsupported|web_search|tool/i.test(msg);
};

const resolveOpenAIModel = (requestedModel) => {
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

const callOpenAIWithFallback = async (prompt, requestedModel, temperature, maxOutputTokens) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured. Please add it to server/.env file.');
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const preferred = resolveOpenAIModel(requestedModel);
    const fallbackModels = ['gpt-5.2', 'gpt-5', 'gpt-4o', 'gpt-4o-mini'];
    const candidateModels = [preferred, ...fallbackModels.filter((item) => item !== preferred)];

    const lastErrors = [];
    for (const model of candidateModels) {
        try {
            const webSearchEnforcedPrompt = `${prompt}

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
            if (isOpenAIRetryableError(error)) {
                lastErrors.push({ model, error: sanitizeError(error) });
                continue;
            }
            throw error;
        }
    }

    const err = new Error(`OpenAI failed for all candidate models: ${candidateModels.join(', ')}`);
    err.details = lastErrors;
    throw err;
};

const extractTextFromProviderResult = async (provider, providerResult) => {
    if (provider === 'openai') {
        return {
            text: providerResult.text,
            model: providerResult.model,
            usedWebSearch: Boolean(providerResult.usedWebSearch)
        };
    }

    const response = await providerResult.result.response;
    return { text: response.text(), model: providerResult.model, usedWebSearch: false };
};

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
    const innerTimeout = Math.max(15000, REQUEST_TIMEOUT - 5000);
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY
    });
});

// Provider-aware AI Search Proxy
app.post('/api/ai/search', async (req, res) => {
    let provider = 'gemini';
    try {
        // Input validation
        const validationError = validateAIRequest(req.body);
        if (validationError) {
            return res.status(400).json({
                success: false,
                error: validationError
            });
        }

        const { prompt, model } = req.body;
        provider = req.body?.provider === 'openai' ? 'openai' : 'gemini';
        const searchModeRaw = typeof req.body?.search_mode === 'string' ? req.body.search_mode.toLowerCase() : 'adaptive';
        const searchMode = ['fast', 'full', 'adaptive'].includes(searchModeRaw) ? searchModeRaw : 'adaptive';
        const queryIdentity = buildSearchIdentity(req.body);
        const cacheKey = buildCacheKey({
            provider,
            model: model || '',
            query: queryIdentity
        });

        if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'GEMINI_API_KEY not configured. Please add it to server/.env file.'
            });
        }
        if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'OPENAI_API_KEY not configured. Please add it to server/.env file.'
            });
        }

        const cached = getCachedResponse(cacheKey);
        if (cached && searchMode !== 'full') {
            return res.json({
                ...cached,
                cache_hit: true
            });
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
            maxOutputTokens: provider === 'openai' ? FAST_OPENAI_MAX_OUTPUT_TOKENS : FAST_GEMINI_MAX_OUTPUT_TOKENS,
            allowRepair: provider !== 'openai'
        });

        const fastData = fastRun.normalized?.data || null;
        if (!fastData && searchMode === 'fast') {
            return res.status(502).json({
                success: false,
                error: 'AI response could not be parsed as JSON in fast mode'
            });
        }

        const allowFastReturn = searchMode === 'fast' || (searchMode === 'adaptive' && isFastResultAdequate(fastData));
        if (fastData && allowFastReturn) {
            const payload = {
                success: true,
                data: fastData,
                provider,
                model: fastRun.resolvedModel,
                web_research: provider === 'openai' ? fastRun.usedWebSearch : false,
                search_profile: 'fast'
            };
            setCachedResponse(cacheKey, payload);
            return res.json({
                ...payload,
                cache_hit: false
            });
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
            maxOutputTokens: provider === 'openai' ? OPENAI_MAX_OUTPUT_TOKENS : GEMINI_MAX_OUTPUT_TOKENS,
            allowRepair: provider !== 'openai'
        });

        if (!fullRun.normalized) {
            if (!fastData) {
                return res.status(502).json({
                    success: false,
                    error: 'AI response could not be parsed as JSON in fast and full mode'
                });
            }
            const fallbackPayload = {
                success: true,
                data: fastData,
                provider,
                model: fastRun.resolvedModel,
                web_research: provider === 'openai' ? fastRun.usedWebSearch : false,
                search_profile: 'fast-fallback'
            };
            setCachedResponse(cacheKey, fallbackPayload);
            return res.json({
                ...fallbackPayload,
                cache_hit: false
            });
        }

        const mergedData = fastData
            ? mergeWineResult(fastData, fullRun.normalized.data)
            : fullRun.normalized.data;
        const finalPayload = {
            success: true,
            data: mergedData,
            provider,
            model: fullRun.resolvedModel || fastRun.resolvedModel,
            web_research: provider === 'openai' ? (fullRun.usedWebSearch || fastRun.usedWebSearch) : false,
            search_profile: 'full'
        };
        setCachedResponse(cacheKey, finalPayload);
        return res.json({
            ...finalPayload,
            cache_hit: false
        });

    } catch (error) {
        const safeError = sanitizeError(error);
        const isTimeout = /timeout/i.test(safeError);
        const isOverloaded = /overloaded|503|service unavailable/i.test(safeError);
        console.error(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} API Error:`, safeError);
        res.status(isTimeout ? 408 : isOverloaded ? 503 : 500).json({
            success: false,
            error: `${provider === 'openai' ? 'OpenAI' : 'Gemini'} API error: ${safeError}`
        });
    }
});

// AI Assignment Proxy (Placeholder)
app.post('/api/ai/assignment', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const result = await callGeminiWithFallback(prompt, 0.3, GEMINI_MAX_OUTPUT_TOKENS);
        const response = await result.result.response;
        const text = response.text();
        const jsonData = tryParseJson(text);

        res.json({ success: true, data: jsonData });
    } catch (error) {
        res.status(500).json({ success: false, error: sanitizeError(error) });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', sanitizeError(err));
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🍷 Wine Vault API Server running on http://localhost:${PORT}`);
    console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Request Timeout: ${REQUEST_TIMEOUT / 1000}s`);
});
