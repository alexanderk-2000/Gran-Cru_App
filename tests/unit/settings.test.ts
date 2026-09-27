import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsService, type UserSettings } from '../../services/settings.ts';

const baseSettings: UserSettings = {
  user_id: 'user-1',
  ai_provider: 'openai',
  gemini_model: 'gemini-2.5-flash',
  openai_model: 'gpt-4o-mini',
  openrouter_model: 'nvidia/llama-3.1-nemotron-70b-instruct',
  currency: 'EUR',
  language: 'de',
  target_date: '2044-12-31',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settingsService.getModel', () => {
  it('returns the persisted OpenAI model when provider is openai', async () => {
    vi.spyOn(settingsService, 'getUserSettings').mockResolvedValue({
      ...baseSettings,
      ai_provider: 'openai',
      openai_model: 'gpt-5.2'
    });

    await expect(settingsService.getModel()).resolves.toBe('gpt-5.2');
  });

  it('returns the persisted Gemini model when provider is gemini', async () => {
    vi.spyOn(settingsService, 'getUserSettings').mockResolvedValue({
      ...baseSettings,
      ai_provider: 'gemini',
      gemini_model: 'gemini-2.5-pro'
    });

    await expect(settingsService.getModel()).resolves.toBe('gemini-2.5-pro');
  });

  it('returns the persisted OpenRouter model when provider is openrouter', async () => {
    vi.spyOn(settingsService, 'getUserSettings').mockResolvedValue({
      ...baseSettings,
      ai_provider: 'openrouter',
      openrouter_model: 'nvidia/nemotron-nano-9b-v2'
    });

    await expect(settingsService.getModel()).resolves.toBe('nvidia/nemotron-nano-9b-v2');
  });

  // Regression (B21): the default used to be the bare string '5.2', which
  // matches no id in the Settings screen's model list ('gpt-5.2') - a fresh
  // account loaded with no tier visibly selected.
  it('falls back to a default that actually matches a selectable model', async () => {
    vi.spyOn(settingsService, 'getUserSettings').mockResolvedValue(null);

    await expect(settingsService.getModel()).resolves.toBe('gpt-5.2');
  });
});
