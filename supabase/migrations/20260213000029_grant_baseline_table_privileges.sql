-- Baseline table-level privileges for anon/authenticated/service_role.
--
-- On a hosted Supabase project these are established automatically at
-- project creation, so this repo's migration history never needed to state
-- them explicitly (only 20260204000003 happened to add a narrow grant for
-- user_settings). A fresh database built purely from these migrations --
-- e.g. `supabase start` locally, or the CI pgTAP job -- never receives
-- them, so the `authenticated` role gets "permission denied for table X"
-- before RLS policies even get a chance to run. RLS remains the real
-- per-row gatekeeper; these grants only restore the baseline access level
-- that production already has.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
