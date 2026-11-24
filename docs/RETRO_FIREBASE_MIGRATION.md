# Retro: Umzug von Supabase/Vercel auf Firebase (24.11.2026)

Rückblick auf den Wechsel des kompletten Backends: Auth, Datenbank, Fotos, KI-Server und Hosting gehen von Supabase/Vercel auf Firebase in `us-central1`.

## Was gut funktioniert hat

- **Die bestehende Storage-Fassade war die richtige Naht.** `services/storage/*Repository.ts` und die Offline-Schicht (`services/pwa/*`) rufen nur Methoden von `storage.legacy.ts` auf. Der Austausch der Implementierung blieb damit auf eine Datei begrenzt. Sync-Engine, Dexie-Cache und UI liefen unverändert weiter.
- **Zeitstempel als ISO-Strings beibehalten.** Firestore-`Timestamp`s hätten die Delta-Sync-Cursor (String-Vergleiche) und jede Stelle mit `new Date(wine.created_at)` angefasst. Mit Strings blieb das alles unberührt.
- **Die Firebase-Emulatoren liefen auch in der Sandbox.** Java war vorhanden, die Emulator-JARs ließen sich laden. Anders als bei Supabase (kein Docker, siehe Retro Phase 1–3) konnten Regeln, Datenschicht, Cloud Function und Playwright lokal in Sekunden geprüft werden, nicht erst blind gegen CI.
- **Das Umzugsskript gegen einen Fake-Supabase-Server getestet.** Ein 40-Zeilen-HTTP-Server mit PostgREST-förmigen Antworten plus die Emulatoren zeigten echte Details, bevor das Skript an echte Daten geht: Zeitstempel-Format `+00:00`, Preise als Strings, fehlende Fotos, Wiederholbarkeit.
- **Reine Logik vorher ausgelagert.** Die pg_trgm-Nachbildung kam nach `domain/wine/catalogSearch.ts` und ließ sich ohne Firebase-Initialisierung unit-testen.

## Was nicht gut funktioniert hat

- **`getDocs()` hätte offline still einen leeren Cache geliefert.** Der Sync-Abgleich hätte daraufhin den lokalen Bestand gelöscht. Das fiel nur beim Durchdenken auf, nicht durch einen Test. Die Lösung ist `getDocsFromServer()`. Lektion: Bei einem Backend-Wechsel gezielt prüfen, wie das neue SDK offline *Erfolg* meldet, nicht nur, wie es Fehler meldet.
- **Ein seit Langem stummer Test.** `it.skipIf(!authHeader)` in `server.routes.test.ts` wird ausgewertet, bevor `beforeAll` den Token holt. Die Tests mit Login liefen deshalb auch mit Supabase nie, und niemand bemerkte es, weil „skipped“ grün aussieht. Behoben mit Top-Level-`await`. Lektion: Die Zahl der übersprungenen Tests in CI-Logs ist ein Signal, kein Rauschen.
- **Playwright und `networkidle` vertragen sich nicht mit Firestore.** Das SDK hält eine Streaming-Verbindung offen. Der erste E2E-Lauf hing 60 Sekunden, bevor das klar war. Content-basierte Waits sind ohnehin robuster.
- **Falsche Testerwartung bei der Trigramm-Ähnlichkeit** (4/6 statt 4/7). Aus der Erinnerung gerechnet statt die Trigramme einmal hinzuschreiben.
- **Ein Screenshot sah nach Datenverlust aus.** „0 Weine“ im Keller gegenüber 13 Flaschen auf dem Dashboard. Es war nur ein Screenshot vor dem Nachladen, die Klärung kostete aber einen Extra-Lauf. Der bestehende Baseline-Test macht Screenshots ohne auf Daten zu warten. Das wäre ein sinnvoller Folgefix.

## Offene Punkte

- Echter Datenumzug: Das Supabase-Projekt ist pausiert und muss für `npm run migrate:supabase` einmal reaktiviert werden.
- Das Deployment läuft manuell (`npm run deploy`). Ein CI-Deploy bräuchte ein Service-Account-Secret in GitHub.
- Der Weinkatalog ist jetzt pro Nutzer statt global. Für eine Ein-Personen-App ist das gleichwertig. Bei mehreren Nutzern bräuchte es einen geteilten Katalog mit Schreibrechten nur für eine Function.
