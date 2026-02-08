# Supabase Migrations

Automatisches Datenbank-Migrations-System für die Wine Time Capsule App.

## 🚀 Quick Start

### 1. Supabase CLI installieren

```bash
npm install
```

### 2. Lokale Supabase-Instanz starten

```bash
npm run supabase:start
```

Dies startet eine lokale Supabase-Instanz mit Docker (PostgreSQL, Auth, Storage, etc.)

### 3. Migrationen anwenden

```bash
npm run db:push
```

### 4. Demo-Daten laden (optional)

```bash
npm run db:seed
```

## 📋 Verfügbare Commands

| Command | Beschreibung |
|---------|-------------|
| `npm run supabase:start` | Startet lokale Supabase-Instanz |
| `npm run supabase:stop` | Stoppt lokale Supabase-Instanz |
| `npm run supabase:status` | Zeigt Status der lokalen Instanz |
| `npm run db:push` | Wendet Migrationen an (lokal oder remote) |
| `npm run db:push:remote` | Wendet Migrationen automatisiert auf verlinktes Remote-Projekt an |
| `npm run db:reset` | Setzt Datenbank zurück und wendet alle Migrationen neu an |
| `npm run db:diff` | Zeigt Unterschiede zwischen lokalem Schema und Migrationen |
| `npm run db:seed` | Lädt Seed-Daten |

## 🔄 Migration Workflow

### Neue Migration erstellen

1. **Schema ändern** in deiner lokalen Supabase-Instanz (via Studio oder SQL)

2. **Diff erstellen**:
   ```bash
   npm run db:diff -- -f new_feature_name
   ```

3. **Migration-Datei prüfen** in `supabase/migrations/`

4. **Testen**:
   ```bash
   npm run db:reset  # Setzt DB zurück und wendet alle Migrationen an
   ```

### Migration zu Production deployen

```bash
# Mit Supabase CLI
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Migration zu Production automatisiert deployen

```bash
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_PROJECT_ID=...
export SUPABASE_DB_PASSWORD=...
npm run db:push:remote
```

Der Befehl nutzt immer `--include-all`, damit auch ältere, verpasste Migrationen sicher nachgezogen werden.

## 📁 Struktur

```
supabase/
├── config.toml                          # Supabase-Konfiguration
├── migrations/
│   └── 20260204000000_initial_schema.sql  # Initiales Schema
└── seed.sql                             # Demo-Daten für lokale Entwicklung
```

## 🔐 Environment Variables

### Lokale Entwicklung

Die lokale Supabase-Instanz läuft auf:
- **API URL**: `http://127.0.0.1:54321`
- **DB URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Studio**: `http://127.0.0.1:54323`

### Production

Setze in `.env.local`:
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 🎯 User Settings Feature (Geplant)

Die nächste Migration wird ein User-Settings-System hinzufügen:

- **Eigener Gemini API Key** pro User
- **Modell-Auswahl** (gemini-2.0-flash-exp, gemini-1.5-pro, etc.)
- **Präferenzen** (Währung, Sprache, etc.)

Schema:
```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  gemini_api_key TEXT,
  gemini_model TEXT DEFAULT 'gemini-2.0-flash-exp',
  currency TEXT DEFAULT 'EUR',
  language TEXT DEFAULT 'de',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🆘 Troubleshooting

### Docker nicht installiert?

Supabase CLI benötigt Docker. Installiere Docker Desktop:
- **Mac**: https://docs.docker.com/desktop/install/mac-install/
- **Windows**: https://docs.docker.com/desktop/install/windows-install/

### Port bereits belegt?

Ändere Ports in `supabase/config.toml`:
```toml
[api]
port = 54321  # Ändere zu freiem Port
```

### Migration schlägt fehl?

```bash
# Logs anzeigen
supabase status

# Datenbank zurücksetzen
npm run db:reset
```

### CI/CD (GitHub Actions)

Workflow: `.github/workflows/supabase-migrate.yml`

- Läuft automatisch bei Änderungen in `supabase/migrations/**` auf `main`
- Läuft manuell über `workflow_dispatch`
- Verwendet `supabase db push --include-all`

Benötigte Secrets:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

## 📚 Weitere Ressourcen

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
- [Supabase Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
