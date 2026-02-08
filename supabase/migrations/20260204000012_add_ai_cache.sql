-- Cache AI responses to avoid repeated API calls
CREATE TABLE IF NOT EXISTS public.ai_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_user_provider_key
ON public.ai_cache(user_id, provider, cache_key);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access their own ai cache" ON public.ai_cache;
CREATE POLICY "Users can access their own ai cache" ON public.ai_cache
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_ai_cache_updated_at ON public.ai_cache;
CREATE TRIGGER update_ai_cache_updated_at
  BEFORE UPDATE ON public.ai_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
