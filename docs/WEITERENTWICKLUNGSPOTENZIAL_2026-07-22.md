# Weiterentwicklungspotenzial – Multi-Perspektiven-Analyse (Stand 22.07.2026)

Fünf unabhängige Analysen (Architektur, Produkt/UX, Security, KI-Strategie/Daten, Performance/Ops) auf Basis des aktuellen Codestands, ergänzend zu `ROADMAP_90D.md`, `ARCHITECTURE_CURRENT.md` und `HANDOFF_2026-07-21.md`.

## Cross-cutting: was mehrere Perspektiven unabhängig bestätigen

- **Sync-Engine ist der größte technische Risikoherd.** Architektur- und Performance-Analyse kommen unabhängig zum selben Fund: `services/pwa/syncEngine.ts` zieht bei jedem Sync-Zyklus den kompletten Datensatz (`buildFullDataset`/`pullFullDataset`, sogar zweimal pro Zyklus), plus N+1-Requests pro Wein für Tastings. Tut ab ca. 100–500 Flaschen spürbar weh, nicht erst bei "vielen Nutzern".
- **Die Modularisierung aus Phase 1–3 ist teils kosmetisch.** `services/storage/*.ts` sind dünne Re-Export-Fassaden auf eine 1039-Zeilen-Monolith-Datei (`storage.legacy.ts`); die Feature-Ordner enthalten weiterhin einzelne 900–2300-Zeilen-Dateien. Das erklärt auch den Produkt-Befund, dass komplexe Felder (Rebsorten, Struktur, Scores) noch als rohe JSON-Textareas im UI landen, statt durch echte Unterkomponenten bedient zu werden.
- **KI-Nutzung ist zentral, aber ungesichert – sowohl strategisch als auch technisch.** Der in `HANDOFF_2026-07-21.md` dokumentierte Widerspruch (Roadmap verbietet externe KI-APIs, Code nutzt sie massiv) trifft auf einen Security-Befund: die KI-Endpunkte (`/api/ai/search`, `/api/ai/vision`, `/api/ai/assign`) haben weder Auth noch Rate-Limiting. Das ist gleichzeitig ein Produktrisiko (Gemini als Default-Provider recherchiert nicht wirklich im Web, siehe unten) und ein Kostenrisiko.

## 1. Architektur & Code-Qualität

**Top-Funde:**
1. Feature-"Ordner" (`WineDetailPage.tsx` 2293 Zeilen, `EnjoymentPlanPage.tsx` 1301, `InventoryPage.tsx` 891) sind unzerlegte Einzeldateien – Struktur nur auf Verzeichnisebene, nicht inhaltlich. (groß)
2. `services/storage/*.ts` sind Fassaden auf `storage.legacy.ts` (1039 Zeilen) – keine echte Entkopplung, hohes Merge-Konflikt-Risiko bei Parallelarbeit. (mittel)
3. `server/src/ai/runtime.js` (619 Zeilen): SDK-Instanzen inline statt injiziert, kaum testbar; Vision-Modellliste dort divergiert bereits von der Modell-Allowlist in `providers/gemini.js` (Drift-Risiko bei Modell-Deprecation). (mittel-groß)
4. Sync-Engine: Full-Pull + N+1 pro Sync-Zyklus (Details unten). (groß)
5. Migrations-Historie enthält dauerhafte Test-Tabellen (`test1234`, `manual_test_table`) und einen Policy-Öffnen/Schließen-Zyklus ohne erkennbares Vorab-Review. (klein–mittel)

## 2. Produkt & UX

**Top-Funde:**
1. Erfassung ist faktisch drei getrennte, teils entwicklerlastige UIs: Scan-Mini-Formular, ein "Neu anlegen"-Stub ohne Felder plus externer Copy-Paste-Prompt-Workflow, und ein Edit-Formular mit rohen JSON-Textareas für Rebsorten/Struktur/Scores. "Unter 30 Sekunden erfassbar" ist damit strukturell nicht erreichbar.
2. Die Trinkfenster-Logik (`domain/wine/drinkability.ts`) ist fachlich fundiert (Gauß-Kurve, Struktur-Ableitung, Uncertainty-Score) – aber Sammler können ihr Fachwissen (Tannin/Säure/Body) nicht einpflegen, weil es keine UI dafür gibt, nur JSON.
3. Tasting-Notes sind zwangsweise an Verbrauch gekoppelt (keine Notiz ohne Bestandsreduktion); Marktwert ist ein Snapshot ohne Zeitverlauf trotz "Investment"-Anspruch; Keller-"Pockets" sind Text-Tags ohne Lageplan-Visualisierung; kein Export.
4. Demo-/Onboarding-Erfahrung ist laut Handoff aktuell durch einen unbestätigten Seed-Bug potenziell leer.
5. `Settings.tsx` zeigt rohe Modell-IDs, Terminal-Befehle und `.env`-Pfade – nicht zielgruppengerecht für Weinsammler.

## 3. Security

**Top-Funde (nach Risiko):**
1. **Hoch:** KI-Endpunkte (`/api/ai/search`, `/api/ai/vision`, `/api/ai/assign`) ohne Auth-Check und ohne Rate-Limiting – Kostenmissbrauchs-/DoS-Risiko unabhängig von RLS.
2. **Hoch:** Trotz globalem `GRANT ALL` (Migration `20260213000029`) fehlt bei mindestens drei Tabellen (`wine_catalog_aliases`, `test1234`, `manual_test_table`) `ENABLE ROW LEVEL SECURITY` – für `anon`-Key voll zugreifbar. Die pgTAP-Suite deckt das nicht ab.
3. **Mittel:** Wine-Images-Bucket ist `public: true` mit öffentlicher Read-Policy – keine Signed URLs, geleakte Links bleiben dauerhaft abrufbar.
4. **Mittel:** `signInAnonymously()` ohne Hürden + ungeschützte KI-Endpunkte = Kostenmissbrauchspfad über beliebig viele anonyme Sessions.
5. **Niedrig:** `SUPABASE_SERVICE_ROLE_KEY` wird dokumentiert, aber im Code nirgends verwendet – totes Konfigurationsrisiko für spätere naive Wiederverwendung.

Positiv bestätigt: `npm audit` 0 Findings (Root + `server/`), keine echten Secrets im Repo, solide Passwort-Policy.

## 4. KI-Strategie & Datenqualität

**Top-Funde:**
1. Provider-Fallback ist asymmetrisch: Nur OpenAI bekommt ein Web-Search-Tool; Gemini (Default-Provider!) recherchiert nicht real, sondern wird nur per Prompt zur "Web-Recherche" aufgefordert – der Regelfall läuft ohne echtes Grounding, Quellprüfung ist nur ein Domain-Substring-Match.
2. `ai_cache`-Tabelle (Migration vorhanden) ist toter Code – der reale Cache ist In-Memory ohne Persistenz.
3. JSON-Normalisierung ist defensiv, aber schemafrei (keine echte Validierung, viele `as any`-Coercions).
4. Confidence/`missing_fields` existieren nur im Edit-Formular, nicht als sichtbarer Vertrauensindikator im Lesemodus.
5. **Einschätzung zum Roadmap-Widerspruch:** KI-Nutzung sollte behalten und gezielt ausgebaut werden, nicht entfernt – 3 von 4 Leitmetriken der Roadmap (Feldübernahme, Pflichtquellen-Abdeckung, Kritikerabdeckung) sind ohne externe KI mit Websuche nicht erreichbar. Die Roadmap-Leitplanke sollte präzisiert werden ("keine ungeprüfte KI-Nutzung" statt "keine externe KI-API").

## 5. Performance, Skalierung & Ops

**Top-Funde:**
1. Voller Re-Sync bei jedem Zyklus statt Delta/Cursor – tut ab ca. 300–500 Flaschen mit Historie weh.
2. N+1-Query pro Wein für Tastings beim Sync – tut ab ca. 100–200 Flaschen weh (Supabase-Verbindungslimits).
3. AI-Cache ist In-Memory/Single-Process – wertlos bei horizontaler Skalierung oder Serverless Cold Starts.
4. CI-Pipeline ist ein einziger serieller Job (Supabase-Start vor Typecheck/Lint/Unit, die das gar nicht brauchen) – Parallelisierungspotenzial vorhanden.
5. Keine Observability/Error-Tracking im Server – nur `console.error`, kein Alerting.

Positiv bestätigt: DB-Indizierung ist größtenteils durchdacht (Barcode-Index, GIN-Trigram für Katalogsuche, Composite-Index auf `inventory_events`).

## Priorisierte Gesamtempfehlung

**Schnell umsetzbar (klein, hohe Wirkung):**
- RLS auf `wine_catalog_aliases` aktivieren; Test-Tabellen (`test1234`, `manual_test_table`) aus Migrationshistorie bereinigen bzw. droppen.
- Auth-Check + Rate-Limiting vor `/api/ai/*`-Routen.
- Signed URLs statt public Bucket für Wine-Images, oder bewusste Entscheidung dokumentieren, warum public ok ist.
- `ai_cache`-Migration entweder anbinden oder entfernen.

**Mittelfristig (Architektur/Produkt, mittlerer Aufwand):**
- Sync-Engine auf Delta/Cursor-basiertes Pull umstellen, Tastings batchen statt N+1.
- Roadmap-Leitplanke zur KI-Nutzung explizit klären (Produktentscheidung, siehe Abschnitt 4) und Gemini-Pfad mit echtem Grounding versehen oder OpenAI als Default setzen.
- Confidence-Anzeige im Lesemodus von `WineDetailPage`.

**Größere Investition (Architektur + Produkt gemeinsam):**
- Feature-Pages tatsächlich in Komponenten/Hooks zerlegen und dabei ein echtes Erfassungsformular mit Struktur-Slidern (statt JSON-Textareas) bauen – behebt gleichzeitig den größten Architektur- und den größten Produkt-Befund.
- CI-Pipeline parallelisieren (Typecheck/Lint/Unit ohne Supabase-Abhängigkeit als eigener Job).
