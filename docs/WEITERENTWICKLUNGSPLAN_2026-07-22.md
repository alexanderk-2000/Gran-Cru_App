# Weiterentwicklungs- und Optimierungsplan (Stand 22.07.2026)

Ausgangspunkt: Branch `claude/feature-pages-erfassungsformular-fwnm06` / PR #8 (Draft) – alle sechs geplanten Phasen der Formular-Konsolidierung und Feature-Page-Zerlegung sind laut `docs/RETRO_FEATURE_PAGES_ERFASSUNGSFORMULAR.md` umgesetzt. Dieser Plan ordnet, was als Nächstes ansteht, priorisiert nach Risiko und Abhängigkeit.

## 0. Sofortbefund: CI-Lücke auf PR #8

Die letzten vier Commits auf diesem Branch (`cab9558` EnjoymentPlan-Zerlegung, `129abbc` Dashboard, `9343e08` Settings, `0cdf43e` Retro-Update) haben **keinen** GitHub-Actions-Lauf ausgelöst – der letzte erfolgreiche `quality-gate`-Run steht noch auf `c718d40` (WineDetailPage-Zerlegung), obwohl der PR-Head bereits bei `0cdf43e` steht. Es gibt weder einen laufenden noch einen fehlgeschlagenen Run für die restlichen Commits, sie fehlen schlicht.

Lokal wurden `typecheck`, `lint`, `test:unit` (87/87 grün) und `build` für den aktuellen Stand erneut ausgeführt und sind sauber; Bundle-Chunks liegen jetzt bei max. ~215 kB (Supabase-Vendor-Chunk), keine `>500kB`-Warnung mehr. Das deckt aber nicht die Playwright-E2E-Suite gegen einen echten Supabase-Stack ab (Sandbox hat kein Docker) – genau die Lücke, die laut Handoff-Doc bisher die eigentlichen Bugs gefunden hat.

**Empfehlung, bevor irgendetwas anderes passiert:**
1. Auf GitHub prüfen, warum der Workflow für den letzten Push nicht getriggert hat (Actions-Tab von PR #8; ggf. `workflow_dispatch` manuell anstoßen oder einen leeren Commit pushen, um `synchronize` erneut auszulösen).
2. Vollen `ci:check`-Lauf (inkl. Playwright gegen lokalen Supabase-Stack) für `0cdf43e` grün bekommen, bevor gemerged wird.
3. Danach die im Retro selbst benannte größte offene Lücke schließen: **manuelle Klick-Verifikation** der drei Erfassungs-Flows (Neuanlage, Scan, Bearbeiten) plus Dashboard/Settings/EnjoymentPlan in einer echten Umgebung – die Sandbox kam wegen fehlender Supabase-Zugangsdaten und Vercel-Deployment-Protection nicht daran vorbei.

## 1. Vor dem Merge von PR #8

- CI-Lücke aus Abschnitt 0 schließen.
- Die beiden im PR-Text bereits selbst benannten bewussten Verhaltensänderungen im Review gezielt gegenprüfen (nicht nur lesen, sondern anhand von Testdaten durchspielen):
  - Neue Default-Kategorie/-Trinkfenster bei manueller Neuanlage.
  - Dashboard-Duplikatprüfung nutzt jetzt `findLikelyDuplicates` (Barcode-sensitiv) statt der alten reinen Name/Produzent/Jahrgang-Heuristik.
- Merge-Reihenfolge beachten: PR #8 ist aktuell der einzige offene PR, zweigt direkt von `main` ab – kein Rebase-Konflikt-Risiko wie bei den früheren Phase-1/2/3-PRs.

## 2. Kurzfristig (direkt nach Merge)

1. **KI-Nutzung-Leitplanken-Konflikt entscheiden.** `services/ai.ts`/`server/src/ai/*` nutzen aktiv Gemini und OpenAI (`server/src/ai/runtime.js`), obwohl `docs/ROADMAP_90D.md` für spätere Phasen (z. B. Trinkplanung) "keine externe KI-API" als Leitplanke nennt. Das ist seit dem Handoff vom 21.07. unverändert offen und blockiert eine saubere Umsetzung von Roadmap-Woche-5-8-Themen, wenn nicht vorher geklärt: Feature bewusst behalten (Leitplanke anpassen) oder entfernen/ersetzen.
2. **Demo-Seed-Bug abschließend klären.** `seedIfNewUser` (`services/storage.legacy.ts:179`) loggt Count- und Insert-Fehler jetzt, aber die eigentliche Ursache, warum neue anonyme Demo-Nutzer mit leerem Bestand starten, ist laut Handoff noch nicht bestätigt. Braucht einen echten Lauf mit Log-Zugriff (RLS? Schema-Constraint? Timing beim `signInAnonymously`?).
3. **`any`/`as any`-Anstieg gegenprüfen.** Baseline in `docs/QUALITY_GATES.md` war 103 Vorkommen; aktueller Stand (App-Code, ohne `tests/`) liegt bei 136. Das kann durch die neuen Formular-/Decomposition-Dateien legitim sein, sollte aber kurz durchgesehen werden, bevor es sich als neue Baseline festsetzt – sonst verwässert das Gate stillschweigend.

## 3. Mittelfristig – Rest-Backlog aus Handoff/Architecture-Doc

Aus `docs/HANDOFF_2026-07-21.md` und `docs/ARCHITECTURE_CURRENT.md` weiterhin offen, in empfohlener Reihenfolge:

1. **CSV-Import** mit Vorschau, Spaltenzuordnung, zeilenweisem Fehlerbericht (JSON-Import und die zentrale Validierung/Dublettenprüfung existieren bereits als Vorlage in `domain/wine/`).
2. **Bulk-Edit** für Keller, Kategorie, Kaufdatum, Preis über mehrere Flaschen – naheliegend jetzt, wo `InventoryPage.tsx` bereits in Selektoren/Hooks zerlegt ist und die Interaktion nicht mehr in einer 900-Zeilen-Datei verdrahtet werden müsste.
3. **`server/src/ai/runtime.js` weiter zerlegen** (aktuell 619 Zeilen) in getrennte Search-/Assignment-/Vision-Services, analog zur bereits erfolgten Frontend-Zerlegung – gleiche Technik (nach jeder Datei sofort die volle Prüfkette laufen lassen) hat sich in diesem Loop bewährt.
4. **Manueller Sync-Konfliktdialog.** Aktuell strikt Last-Write-Wins (`services/pwa/conflictResolver.ts`); für Mehrgeräte-Nutzung mit Offline-Phasen mittelfristig ein UI vorsehen, das echte Konflikte statt stiller Überschreibung anzeigt.

## 4. Prozess-Optimierung (aus den Retros abgeleitet)

- **Sandbox-Zugang für echte Verifikation schaffen.** Zwei aufeinanderfolgende Retros (Phase 1-3 und jetzt Erfassungsformular) benennen dieselbe Lücke: keine lokalen Supabase-Zugangsdaten, keine öffentlich erreichbare Vercel-Preview ohne SSO-Schutz. Das ist der wiederkehrende Blocker für "wirklich im Browser geklickt, nicht nur statisch verifiziert". Lohnt sich, einmalig zu beheben (z. B. dedizierte Preview-Umgebung ohne Deployment-Protection oder Supabase-Testprojekt-Credentials in der Session bereitstellen), statt in jedem Loop erneut daran zu scheitern.
- **Verhaltensänderungen weiterhin einzeln im Commit/PR-Text hervorheben**, auch wenn sie "nebenbei" bei größeren Zerlegungen passieren – hat in diesem Loop schon gut funktioniert, bewusst fortsetzen.
- **Nach jedem Push auf einen offenen PR aktiv den CI-Lauf bestätigen**, nicht nur "PR aktualisiert" annehmen – der Befund in Abschnitt 0 zeigt, dass ein getriggerter Workflow nicht garantiert ist.

## Priorisierte Kurzliste für die nächste Sitzung

1. CI-Lücke auf PR #8 schließen und PR mergen (Abschnitt 0–1).
2. KI-Leitplanken-Konflikt entscheiden (Abschnitt 2.1) – blockiert sonst Folgearbeit sauber einzuordnen.
3. CSV-Import oder Bulk-Edit angehen (Abschnitt 3.1/3.2), je nachdem was für die nächste Roadmap-Phase priorisiert wird.
