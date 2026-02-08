-- Set GPT-5.2 as default OpenAI model for new and existing user settings
ALTER TABLE user_settings
  ALTER COLUMN openai_model SET DEFAULT 'gpt-5.2';

UPDATE user_settings
SET openai_model = 'gpt-5.2',
    updated_at = NOW()
WHERE openai_model IS NULL
   OR openai_model = ''
   OR openai_model IN ('o3', 'gpt-5.1');
