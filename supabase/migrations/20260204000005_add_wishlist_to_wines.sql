-- Add wishlist flag to wines
ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS wishlist BOOLEAN NOT NULL DEFAULT FALSE;
