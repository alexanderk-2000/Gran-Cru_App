-- Add market_price for pricing estimates
ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS market_price DECIMAL(10,2) DEFAULT 0;
