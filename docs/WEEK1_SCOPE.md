# Week 1 Scope

## Ziel
Messbare Ausgangslage schaffen und Qualitätstore definieren, bevor weitere Produktfeatures gebaut werden.

## In Scope
1. Dokumentation: Zielbild, Architektur-Ist, Quality Gates
2. Baseline-Reports:
   - Datenvollständigkeit
   - KI-Mapping-Transfer
   - Quellen- und Kritikerabdeckung
3. UI-Baseline-Screenshots für Kernseiten

## Out of Scope
1. Größere Datenbank-Migrationen
2. Neue Nutzerfeatures
3. Finales Redesign außerhalb gezielter Bugfixes

## Lieferobjekte
- `docs/ARCHITECTURE_CURRENT.md`
- `docs/QUALITY_GATES.md`
- `docs/WEEK1_REVIEW.md`
- `docs/WEEK2_BACKLOG.md`
- `scripts/baseline-*.mjs`
- `tests/ui-baseline.spec.ts`
- `playwright.config.ts`

## Definition of Done (Week 1)
1. Alle Baseline-Skripte laufen lokal mit gültigen Zugangsdaten.
2. Reports landen in `reports/*.json`.
3. UI-Baseline-Screenshots sind reproduzierbar.
4. Week-2-Backlog ist aus Baseline-Daten abgeleitet.
