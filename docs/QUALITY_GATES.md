# Quality Gates

## Gate 0: CI Pipeline
1. `npm run ci:check` muss grün laufen.
2. Pipeline-Inhalt:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:unit`
   - `npm run build`
   - `npm run test:ui -- --list`
   - `npm run test:ui:pwa -- --list`

## Gate 1: Build & Typing
1. `npm run build` muss erfolgreich sein.
2. `npm run typecheck` darf keine neuen Fehler gegenüber Baseline einführen.

## Gate 2: KI-Import Integrität
1. Pflichtfelder nach KI-Import:
   - `name`, `vintage`, `region`, `drink_start`, `drink_end`
2. Wenn vorhanden in KI-Output, müssen persistiert sein:
   - `producer`, `country`, `appellation`, `vineyard`, `wine_type`, `format`
   - `grapes`, `aromas`, `structure`, `scores`
3. `short_description_de` muss in `ai_details.extensions.short_description_de` landen.

## Gate 3: Quellenregeln
1. Mindestens 3 Quellen.
2. Mindestens eine Quelle von `gute-weine.de`.
3. Mindestens eine Quelle von `wine-searcher.com`.
4. Mindestens eine weitere unabhängige Quelle.

## Gate 4: Kritikerdaten
1. Aktive Suche nach Scores für:
   - James Suckling
   - Robert Parker / Wine Advocate
   - Vinous
   - Decanter
   - Jancis Robinson
   - Falstaff
2. Werte nur mit Quellenbezug; keine Halluzination.

## Gate 5: UI-Regression
1. Baseline-Screenshots für:
   - Dashboard
   - Inventory
   - Wine Detail
2. Keine Überlappungen/abgeschnittene Überschriften in Wine Cards.

## Gate 6: Bugfix-Regression
1. `settingsService.getModel()` muss die persistierte Modellwahl des Users zurückgeben.
2. Scanner-Vision-Aufrufe müssen über relativen API-Pfad laufen (`/api/ai/vision`).
3. Beide Fixes sind durch Unit-Tests abzudecken.

## Gate 7: PWA-Grundfunktion
1. Manifest und Service Worker werden im Build erzeugt.
2. Offline Lock Screen greift ohne Session bei Verbindungsabbruch.
3. PWA-Smokes:
   - `tests/pwa.offline.spec.ts`
   - `tests/pwa.sync.spec.ts`

## Baseline Snapshot (2026-02-13)
1. `any`/`as any` Vorkommen (App-Code): 103.
2. Größte Dateien:
   - `features/WineDetail.tsx`: 2293 Zeilen
   - `features/EnjoymentPlan.tsx`: 1301 Zeilen
   - `features/Inventory.tsx`: 1178 Zeilen
   - `server/index.js`: 1035 Zeilen
   - `services/storage.ts`: 946 Zeilen
3. Bundle-Baseline:
   - `dist/assets/index-*.js`: ~521 kB (Warnung > 500 kB aktiv)
