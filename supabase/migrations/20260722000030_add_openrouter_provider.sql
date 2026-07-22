-- Adds OpenRouter (Nemotron) as a third selectable AI provider.
--
-- ai_provider was referenced by the client (services/settings.ts,
-- features/Settings.tsx) but never existed as an actual column -
-- persisting a provider choice for a logged-in user has always failed
-- silently against a real Supabase backend. This migration adds it for
-- real, together with the OpenRouter model preference.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS openrouter_model TEXT DEFAULT 'nvidia/llama-3.1-nemotron-70b-instruct';

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_ai_provider_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_ai_provider_check
  CHECK (ai_provider IN ('gemini', 'openai', 'openrouter'));
