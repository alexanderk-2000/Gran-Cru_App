-- Add AI details and sources for enriched wine data
ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS ai_details JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS ai_sources JSONB DEFAULT '[]'::jsonb;
