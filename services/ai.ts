import { runOfflineRuleEngine, type OfflineRuleEngineOutput } from './offlineRuleEngine.ts';
import { storageService } from './storage.ts';

export interface AIResponse {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

export interface AssignmentAIRequest {
  instances: Array<{ id: string; date: string; title?: string }>;
  winePool: Array<{
    wine_id: string;
    name: string;
    bottles_reserved: number;
    priority: 'low' | 'medium' | 'high';
  }>;
  candidateScores: Array<{ instance_id: string; wine_id: string; score: number }>;
}

const validateWineInput = (wineName: string, vintage: number): string | null => {
  if (!wineName.trim()) return 'Wine name is required';
  if (wineName.trim().length < 2) return 'Wine name must be at least 2 characters';
  if (vintage && (vintage < 1800 || vintage > new Date().getFullYear() + 5)) {
    return `Invalid vintage year: ${vintage}`;
  }
  return null;
};

/**
 * Local research and assignment service.
 *
 * This deliberately performs no network requests and uses no external AI API.
 * Wine enrichment is limited to the local catalog; assignments are selected
 * deterministically from the scores already calculated by the rule engine.
 */
export const aiService = {
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
      country_hint: country_hint ?? null,
    }),

  generateWineInfo: async (
    wineName: string,
    producer: string,
    vintage: number
  ): Promise<AIResponse> => {
    const validationError = validateWineInput(wineName, vintage);
    if (validationError) return { success: false, error: validationError };

    const normalized = runOfflineRuleEngine({
      raw_input: [vintage || '', producer, wineName].filter(Boolean).join(' '),
      producer_hint: producer || null,
      vintage_hint: vintage || null,
    });
    const catalogHit = await storageService.findWineInCatalog({
      name: normalized.normalized_query.name || wineName,
      producer: normalized.normalized_query.producer || producer,
      vintage: normalized.normalized_query.vintage ?? vintage ?? null,
    });

    return catalogHit
      ? { success: true, data: catalogHit }
      : {
          success: false,
          error: 'Keine lokalen Katalogdaten gefunden. Angaben können manuell ergänzt werden.',
        };
  },

  planAssignments: async (payload: AssignmentAIRequest): Promise<AIResponse> => {
    const remaining = new Map(
      payload.winePool.map((wine) => [wine.wine_id, Math.max(0, wine.bottles_reserved)])
    );
    const assignments = [...payload.instances]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .flatMap((instance) => {
        const best = payload.candidateScores
          .filter((candidate) => candidate.instance_id === instance.id)
          .filter((candidate) => (remaining.get(candidate.wine_id) ?? 0) > 0)
          .sort((a, b) => b.score - a.score || a.wine_id.localeCompare(b.wine_id))[0];
        if (!best) return [];
        remaining.set(best.wine_id, (remaining.get(best.wine_id) ?? 1) - 1);
        return [{ instance_id: instance.id, wine_id: best.wine_id, score: best.score }];
      });

    return { success: true, data: { assignments, source: 'local-rule-engine' } };
  },
};
