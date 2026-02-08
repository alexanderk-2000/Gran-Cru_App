# Quality Gates

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
