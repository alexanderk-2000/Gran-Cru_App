-- Re-add OpenAI model selection (optional)
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS openai_model TEXT DEFAULT 'gpt-5.1';
