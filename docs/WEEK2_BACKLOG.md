# Week 2 Backlog (priorisiert)

## P0 (muss)
1. Zentralen AI->Wine Mapping-Layer extrahieren (shared util für Inventory + WineDetail Sync).
2. Feld-Prioritätsregeln definieren (Top-Level vs `details.*`) und testbar machen.
3. Persistenz-Validierung vor `saveWine` mit klaren Fehlermeldungen.

## P1 (soll)
1. Feldweise Provenienzmodell (Quelle, URL, Zeitpunkt, Confidence) vorbereiten.
2. Kritiker-Normalisierungstabelle (Alias -> Canonical Name).
3. UI-Hinweis „übernommen / fehlend / konflikthaft“ im KI-Preview.

## P2 (kann)
1. CSV-Export der Baseline-Reports.
2. Kleine Admin-Seite für Datenqualitätsmonitoring.
3. Diff-Ansicht zwischen letztem und aktuellem AI-Lauf.

## Akzeptanzkriterien Week 2
1. Transfer-Rate relevanter Felder steigt messbar gegenüber Week 1.
2. Kein Verlust von Kritikerdaten zwischen Import und Weindetail.
3. Keine neuen Card-/Header-Rendering-Regressions auf Kernscreens.
