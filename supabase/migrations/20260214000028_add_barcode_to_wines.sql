-- Store the scanned barcode as its own field so it can be searched locally
-- and used for duplicate detection, instead of being discarded after scan.
ALTER TABLE public.wines
ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE INDEX IF NOT EXISTS idx_wines_user_barcode
  ON public.wines(user_id, barcode)
  WHERE barcode IS NOT NULL;
