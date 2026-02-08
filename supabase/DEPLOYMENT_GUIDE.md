# 🔐 Database Password benötigt

## Status

✅ **Supabase CLI** - Erfolgreich eingeloggt  
✅ **Projekt gelinkt** - `wipdusigcofkjqxcdhzv`  
⚠️ **Migrationen** - Warten auf Database Password  

## Problem

Um Migrationen zu deployen, benötigt Supabase CLI das **Database Password**.

## Lösungen

### Option 1: Passwort zurücksetzen (Empfohlen)

1. **Gehe zu Supabase Dashboard**:
   https://supabase.com/dashboard/project/wipdusigcofkjqxcdhzv/settings/database

2. **Klicke auf "Reset database password"**

3. **Kopiere das neue Passwort** und speichere es sicher

4. **Führe Migration aus**:
   ```bash
   npm run db:push
   ```
   
5. **Gib das Passwort ein** wenn gefragt

### Option 2: Migrationen manuell ausführen

Falls du das Passwort nicht zurücksetzen möchtest:

1. **Öffne SQL Editor**:
   https://supabase.com/dashboard/project/wipdusigcofkjqxcdhzv/sql/new

2. **Führe jede Migration aus** (in dieser Reihenfolge):

   **Migration 1**: [20260204000000_initial_schema.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000000_initial_schema.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 2**: [20260204000001_user_settings.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000001_user_settings.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 3**: [20260204000002_test_table.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000002_test_table.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 4**: [20260204000003_fix_user_settings_trigger.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000003_fix_user_settings_trigger.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 5**: [20260204000005_add_wishlist_to_wines.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000005_add_wishlist_to_wines.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 6**: [20260204000007_add_deleted_by_and_rls.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000007_add_deleted_by_and_rls.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 7**: [20260204000008_add_market_price_to_wines.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000008_add_market_price_to_wines.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 8**: [20260204000009_add_ai_details_sources.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000009_add_ai_details_sources.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 9**: [20260204000010_remove_openai.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000010_remove_openai.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 10**: [20260204000011_add_openai_model_back.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000011_add_openai_model_back.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 11**: [20260204000012_add_ai_cache.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000012_add_ai_cache.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 12**: [20260204000013_add_wine_catalog.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000013_add_wine_catalog.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

   **Migration 13**: [20260204000014_wine_catalog_search.sql](file:///Users/alexanderkoppetsch/Downloads/grand-cru-vault/supabase/migrations/20260204000014_wine_catalog_search.sql)
   - Kopiere den gesamten Inhalt
   - Füge ihn in den SQL Editor ein
   - Klicke "Run"

3. **Verifiziere** in Table Editor:
   - Gehe zu https://supabase.com/dashboard/project/wipdusigcofkjqxcdhzv/editor
   - Du solltest sehen: `wines`, `occasions`, `occasion_instances`, `tastings`, `user_settings`, `test1234`

## Nach erfolgreicher Migration

## Automatische Migrationen (CI/CD)

Wenn du das Projekt auf mehrere Umgebungen verteilst, kannst du Migrationen automatisch
ausführen lassen. Im Repo ist dafür ein GitHub Actions Workflow hinterlegt:
`.github/workflows/supabase-migrate.yml`.

Benötigte Secrets im GitHub Repo:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID` (Project Ref, z. B. `wipdusigcofkjqxcdhzv`)
- `SUPABASE_DB_PASSWORD`

Damit laufen neue Migrationen automatisch bei jedem Push auf `main`.

Zusätzlich lokal automatisiert möglich:
```bash
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_PROJECT_ID=wipdusigcofkjqxcdhzv
export SUPABASE_DB_PASSWORD=...
npm run db:push:remote
```

1. **Aktualisiere .env.local**:
   ```bash
   VITE_SUPABASE_URL=https://wipdusigcofkjqxcdhzv.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-anon-key-von-supabase
   ```

2. **Starte App neu**:
   ```bash
   npm run dev
   ```

3. **Teste die App**:
   - Öffne http://localhost:3000
   - Klicke "Demo-Modus nutzen"
   - Gehe zu "Einstellungen" und trage deinen Gemini API Key ein

## Nächste Schritte

Wähle eine Option und sag mir Bescheid wenn die Migrationen erfolgreich waren!
