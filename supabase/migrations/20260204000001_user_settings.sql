-- ============================================
-- USER SETTINGS TABLE
-- ============================================
-- This migration adds user-specific settings for:
-- - Personal Gemini API keys
-- - AI model selection
-- - App preferences

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- AI Configuration
  gemini_api_key TEXT, -- User's personal Gemini API key
  gemini_model TEXT DEFAULT 'gemini-pro-latest', -- Selected AI model
  openai_model TEXT DEFAULT 'gpt-5.1', -- Selected OpenAI model
  
  -- App Preferences
  currency TEXT DEFAULT 'EUR',
  language TEXT DEFAULT 'de',
  target_date DATE DEFAULT '2044-12-31',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own settings
DROP POLICY IF EXISTS "Users can access their own settings" ON user_settings;
CREATE POLICY "Users can access their own settings" ON user_settings
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create default settings for new users
CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create settings when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_user_settings();
