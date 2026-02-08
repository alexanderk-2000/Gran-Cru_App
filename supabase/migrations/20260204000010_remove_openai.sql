-- Remove OpenAI support from user settings
ALTER TABLE public.user_settings
DROP COLUMN IF EXISTS openai_model;
