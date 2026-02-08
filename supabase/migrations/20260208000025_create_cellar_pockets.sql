-- Pocket model for main cellar dashboard.
CREATE TABLE IF NOT EXISTS public.cellar_pockets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cellar_pockets_user_id
  ON public.cellar_pockets(user_id);

CREATE INDEX IF NOT EXISTS idx_cellar_pockets_user_name
  ON public.cellar_pockets(user_id, name);

ALTER TABLE public.cellar_pockets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cellar_pockets_select_own" ON public.cellar_pockets;
DROP POLICY IF EXISTS "cellar_pockets_insert_own" ON public.cellar_pockets;
DROP POLICY IF EXISTS "cellar_pockets_update_own" ON public.cellar_pockets;
DROP POLICY IF EXISTS "cellar_pockets_delete_own" ON public.cellar_pockets;

CREATE POLICY "cellar_pockets_select_own"
ON public.cellar_pockets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "cellar_pockets_insert_own"
ON public.cellar_pockets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cellar_pockets_update_own"
ON public.cellar_pockets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cellar_pockets_delete_own"
ON public.cellar_pockets
FOR DELETE
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_cellar_pockets_updated_at ON public.cellar_pockets;
CREATE TRIGGER update_cellar_pockets_updated_at
  BEFORE UPDATE ON public.cellar_pockets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
