
import { settingsService } from './settings.ts';
import { runOfflineRuleEngine, type OfflineRuleEngineOutput } from './offlineRuleEngine.ts';
import { storageService } from './storage.ts';
import { enqueueAiQueueItem } from './pwa/aiQueue.ts';
import { isOnline } from './pwa/networkState.ts';
import { getAccessToken } from './supabase.ts';
import { checkApiHealth } from './apiHealth.ts';

export const API_UNREACHABLE_HINT =
    'Der KI-Dienst ist nicht erreichbar. Lokal: `npm run server` starten. Im Deployment: prüfen, ob die API-Funktion und der OpenRouter-Key konfiguriert sind.';

const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface AIResponse {
    success: boolean;
    data?: any;
    error?: string;
    queued?: boolean;
    queue_id?: string;
    sync_state?: 'queued' | 'syncing' | 'synced' | 'failed';
}

export interface AssignmentAIRequest {
    provider?: 'gemini' | 'openai' | 'openrouter';
    instances: Array<{ id: string; date: string; title?: string }>;
    winePool: Array<{
        wine_id: string;
        name: string;
        producer?: string;
        vintage?: number;
        category?: string;
        drink_start?: number;
        peak_year?: number;
        drink_end?: number;
        quantity?: number;
        bottles_reserved: number;
        priority: 'low' | 'medium' | 'high';
    }>;
    candidateScores: Array<{
        instance_id: string;
        wine_id: string;
        score: number;
    }>;
    preferences?: Record<string, unknown>;
}

/**
 * Validate input parameters for wine info generation
 */
const validateWineInput = (wineName: string, _producer: string, vintage: number): string | null => {
    if (!wineName || wineName.trim().length === 0) {
        return 'Wine name is required';
    }

    if (wineName.trim().length < 2) {
        return 'Wine name must be at least 2 characters';
    }

    if (vintage && (vintage < 1800 || vintage > new Date().getFullYear() + 5)) {
        return `Invalid vintage year: ${vintage}`;
    }

    return null;
};

export const aiService = {
    enqueueWhenOffline: async (
        operation: 'search' | 'assignment' | 'vision',
        endpoint: '/api/ai/search' | '/api/ai/assignment' | '/api/ai/vision',
        payload: Record<string, unknown>
    ): Promise<AIResponse> => {
        const currentUser = await storageService.getCurrentUser?.();
        if (!currentUser?.id) {
            return {
                success: false,
                error: 'Offline-Queue benötigt eine aktive Session.'
            };
        }

        const queued = await enqueueAiQueueItem({
            userId: currentUser.id,
            operation,
            endpoint,
            payload
        });

        return {
            success: true,
            queued: true,
            queue_id: queued.id,
            sync_state: 'queued',
            data: {
                message: 'AI-Anfrage wurde offline gespeichert und wird bei Reconnect gesendet.'
            }
        };
    },

    normalizeInputOffline: (
        raw_input: string,
        producer_hint?: string | null,
        vintage_hint?: number | null,
        country_hint?: string | null
    ): OfflineRuleEngineOutput =>
        runOfflineRuleEngine({
            raw_input,
            producer_hint: producer_hint ?? null,
            vintage_hint: vintage_hint ?? null,
            country_hint: country_hint ?? null
        }),

    /**
     * Generate wine information using the configured AI provider
     */
    generateWineInfo: async (wineName: string, producer: string, vintage: number): Promise<AIResponse> => {
        try {
            // Input validation
            const validationError = validateWineInput(wineName, producer, vintage);
            if (validationError) {
                return {
                    success: false,
                    error: validationError
                };
            }

            const provider = await settingsService.getProvider();
            const model = await settingsService.getModel();

            const rawQuery = [vintage ? String(vintage) : '', producer || '', wineName].filter(Boolean).join(' ').trim();
            const offline = runOfflineRuleEngine({
                raw_input: rawQuery,
                producer_hint: producer || null,
                vintage_hint: vintage || null
            });
            const query = offline.search.query_string || rawQuery;

            const catalogName = offline.normalized_query.name || wineName;
            const catalogProducer = offline.normalized_query.producer || producer || '';
            const catalogVintage = offline.normalized_query.vintage ?? (vintage || null);
            const catalogHit = await storageService.findWineInCatalog({
                name: catalogName,
                producer: catalogProducer,
                vintage: catalogVintage
            });
            if (catalogHit) {
                return {
                    success: true,
                    data: catalogHit
                };
            }
            console.log('AI Lookup - Input:', { wineName, producer, vintage });

            const prompt = `Recherchiere den Wein: "${query}".

Antworte ausschließlich als JSON mit belastbaren Fakten und Quellen.
Fokus: Produzent, Name, Jahrgang, Herkunft, Lage/Appellation, Stil, Trinkfenster, Kritiker-Scores, Kurzbeschreibung.
Unbekanntes als null + in missing_fields aufnehmen.

Offline-Normalisierung:
- producer: ${offline.normalized_query.producer || 'null'}
- name: ${offline.normalized_query.name || 'null'}
- vintage: ${offline.normalized_query.vintage ?? 'null'}
- tokens_primary: ${offline.search.tokens_primary.join(', ') || 'none'}
- derived: wine_type=${offline.derived.wine_type || 'null'}, sweetness=${offline.derived.sweetness || 'null'}
`;

            // Call the backend search (DB first, then AI)
            const endpoint = '/api/ai/search';
            const requestPayload = {
                prompt,
                model,
                provider,
                wineName,
                producer,
                vintage,
                search_mode: 'adaptive'
            };

            if (!isOnline()) {
                return aiService.enqueueWhenOffline('search', endpoint, requestPayload);
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await authHeaders())
                },
                body: JSON.stringify(requestPayload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // Best-effort health check for clearer diagnostics
                let healthHint = '';
                if (response.status >= 500) {
                    const health = await checkApiHealth();
                    if (!health.online) {
                        healthHint = ` (${API_UNREACHABLE_HINT})`;
                    }
                }

                throw new Error(
                    (errorData.error || `Server error: ${response.status} ${response.statusText}`) + healthHint
                );
            }

            // A missing backend answers with the SPA's index.html at status 200.
            // Without this guard the failure surfaced as "Unexpected token '<'"
            // from response.json() - unreadable for the user and pointing at the
            // wrong layer.
            if (!(response.headers.get('content-type') || '').includes('application/json')) {
                throw new Error(API_UNREACHABLE_HINT);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Unknown error from AI service');
            }
            if (typeof result?.data?.raw === 'string') {
                throw new Error('AI returned unstructured raw output. Please retry.');
            }

            return {
                success: true,
                data: result.data
            };

        } catch (error: any) {
            console.error('AI Service Error:', error);

            // Provide user-friendly error messages
            let errorMessage = 'Failed to generate wine information. ';
            const rawMessage = error.message || '';

            if (/overloaded|503|service unavailable/i.test(rawMessage)) {
                errorMessage += 'Der KI-Dienst ist gerade überlastet. Bitte in 1–2 Minuten erneut versuchen.';
            } else if (/timeout/i.test(rawMessage)) {
                errorMessage += 'Request timed out. Please try again.';
            } else if (/fetch/i.test(rawMessage)) {
                const provider = await settingsService.getProvider();
                const model = await settingsService.getModel();
                return aiService.enqueueWhenOffline('search', '/api/ai/search', {
                    prompt: `Recherchiere den Wein: "${[vintage ? String(vintage) : '', producer || '', wineName].filter(Boolean).join(' ').trim()}".`,
                    provider,
                    model,
                    wineName,
                    producer,
                    vintage,
                    search_mode: 'adaptive'
                });
            } else if (rawMessage.includes('API')) {
                errorMessage += rawMessage;
            } else {
                errorMessage += rawMessage || 'Please check your connection and try again.';
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }
    ,

    planAssignments: async (payload: AssignmentAIRequest): Promise<AIResponse> => {
        try {
            const provider = payload.provider || await settingsService.getProvider();
            const requestPayload = { ...payload, provider };

            if (!isOnline()) {
                return aiService.enqueueWhenOffline('assignment', '/api/ai/assignment', requestPayload as Record<string, unknown>);
            }

            const response = await fetch('/api/ai/assignment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await authHeaders())
                },
                body: JSON.stringify(requestPayload)
            });

            if (!(response.headers.get('content-type') || '').includes('application/json')) {
                return { success: false, error: API_UNREACHABLE_HINT };
            }

            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                return {
                    success: false,
                    error: result.error || `Assignment request failed: ${response.status}`
                };
            }

            return {
                success: true,
                data: result.data
            };
        } catch (error: any) {
            if (/fetch|network/i.test(error?.message || '')) {
                const provider = payload.provider || await settingsService.getProvider();
                return aiService.enqueueWhenOffline('assignment', '/api/ai/assignment', {
                    ...payload,
                    provider
                } as Record<string, unknown>);
            }
            return {
                success: false,
                error: error?.message || 'KI-Zuordnung fehlgeschlagen.'
            };
        }
    }
};
