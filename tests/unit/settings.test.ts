import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsService, type UserSettings } from '../../services/settings.ts';

const baseSettings: UserSettings = {
  user_id: 'user-1',
  ai_provider: 'openai',
  gemini_model: 'gemini-2.5-flash',
  openai_model: 'gpt-4o-mini',
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

  it('falls back to defaults if settings are missing', async () => {
    vi.spyOn(settingsService, 'getUserSettings').mockResolvedValue(null);

    await expect(settingsService.getModel()).resolves.toBe('5.2');
  });
});
