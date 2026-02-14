# Grand Cru Vault

Grand Cru Vault ist eine React/Vite-Anwendung zur Verwaltung eines Weinkellers mit KI-gestützter Datenerfassung, Trinkfenster-Analyse und Backend-Proxy für AI-Provider.

## Voraussetzungen

- Node.js 20+
- npm 10+
- Supabase CLI (optional für lokale DB-Workflows)
- API Keys für Gemini/OpenAI (für AI-Endpunkte)

## Setup

1. Abhängigkeiten installieren:

```bash
npm install
```

2. Umgebungsvariablen anlegen:

```bash
cp .env.example .env.local
cp server/.env.example server/.env
```

3. Entwicklungsbetrieb starten:

```bash
npm run start
```

Frontend läuft auf `http://localhost:3000`, das API-Backend auf `http://localhost:3001`.

## Qualitätsgates

```bash
npm run ci:check
```

`ci:check` führt in fester Reihenfolge aus:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run build`
5. `npm run test:ui -- --list`
6. `npm run test:ui:pwa -- --list`

## Wichtige Scripts

- `npm run dev`: Frontend (Vite)
- `npm run server`: Backend (Express)
- `npm run test:unit`: Vitest Unit/API-Tests
- `npm run test:ui`: Playwright Tests
- `npm run test:ui:pwa`: Playwright PWA-Smoke
- `npm run format`: Prettier Write
- `npm run lint:fix`: ESLint Auto-Fix

## PWA (iOS + Chrome)

- Manifest + Icons: `public/manifest.webmanifest`, `public/icons/*`
- Service Worker: `services/pwa/sw.ts` (`injectManifest`)
- Offline-Store/Queue: `services/pwa/offlineDb.ts`, `services/pwa/syncEngine.ts`, `services/pwa/aiQueue.ts`
- Install-/Update-UX: `services/pwa/installPrompt.ts`, `services/pwa/swRegistration.ts`, Settings-UI unter `/#/settings`
- Offline ohne Session: Read-only Lock Screen

## Architektur (Kurzüberblick)

- Frontend Feature-Slices:
  - `features/inventory/*`
  - `features/wine-detail/*`
  - `features/enjoyment-plan/*`
- Domain-Module:
  - `domain/wine/drinkability.ts`
  - `domain/wine/jsonParsers.ts`
  - `domain/wine/normalization.ts`
- Storage-Fassade:
  - `services/storage.ts` (kompatibler Einstieg)
  - `services/storage/*.ts` (fachliche Repositories)
- Backend modularisiert:
  - `server/index.js` (Bootstrap)
  - `server/src/app.js` (Express Setup)
  - `server/src/ai/*`, `server/src/routes/*`, `server/src/cache/*`

Details stehen in `docs/ARCHITECTURE_CURRENT.md` und `docs/QUALITY_GATES.md`.
