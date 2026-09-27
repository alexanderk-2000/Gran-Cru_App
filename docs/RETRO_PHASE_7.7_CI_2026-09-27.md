# Retro: Phase 7.7 scharf verifizieren — vier CI-Iterationen (2026-09-27)

Anschluss an `RETRO_PHASE_7_2026-09-27.md`: dort endete die Session mit 7.7 auf „◐" — vier
Kernweg-E2E-Tests geschrieben, aber mangels lokalem Docker-Daemon nie tatsächlich ausgeführt. Diese
Runde hatte Zugriff auf echte CI-Läufe (`quality-gate`-Job, echter lokaler Supabase-Stack) und hat
die Tests über vier Iterationen bis „grün" gebracht, ohne dass an der App selbst etwas kaputt war.

## Was gut funktioniert hat

- **Jeder Fehlschlag wurde einzeln diagnostiziert, bevor etwas geändert wurde — kein Rätselraten
  per Sammel-Fix.** Vier Iterationen, vier unterschiedliche Root Causes (Login-Race, falscher
  Default-View, unzuverlässiger Server-Seed, Filterwechsel beim Pocket-Anlegen). Jede wurde aus den
  CI-Logs/Fehlermeldungen einzeln hergeleitet, bevor der nächste Fix geschrieben wurde — z. B. hat
  „Test 1 kam beim Retry weiter als beim ersten Versuch" die Race-Hypothese bestätigt, statt sie zu
  raten.
- **Tests unabhängig vom serverseitigen Demo-Seed gemacht, statt den Seed zu reparieren.**
  `seedIfNewUser()` verschluckt Insert-Fehler nur über `console.error()` — ein echter, aber
  bewusst nicht in dieser Runde behobener Bug (out of scope für „Tests schreiben"). Statt daran zu
  reparieren, wurde jeder Test so umgebaut, dass er seinen eigenen Wein über den bereits bewiesenen
  UI-Weg anlegt. Das macht die Tests robuster *und* dokumentiert den Seed-Bug sauber als offenen
  Fund, statt ihn im Vorbeigehen mitzureparieren und damit den Scope zu sprengen.
- **Jede Ursache direkt als Kommentar im Testcode dokumentiert**, nicht nur im Commit oder im
  Plan-Dokument — z. B. der Hinweis in `core-paths.spec.ts`, dass `createPocket()` den
  `subcellarFilter` umschaltet. Der nächste Mensch, der an diesen Tests etwas ändert, muss die
  Debug-Session nicht wiederholen.

## Was nicht gut funktioniert hat

- **Vier CI-Läufe für vier Fixes ist ein langsamer Feedback-Loop, den man mit besserer
  Code-Kenntnis vorher hätte verkürzen können.** Drei der vier Ursachen (Hauptkeller-Dashboard als
  Default, Filterwechsel bei Pocket-Anlage, Seed-Unzuverlässigkeit) waren beim genauen Lesen von
  `InventoryPage.tsx` und `storage.legacy.ts` *vor* dem ersten CI-Lauf erkennbar gewesen — sie
  wurden aber erst durch tatsächliche Fehlschläge gefunden, nicht durch Code-Review im Voraus. Für
  Tests gegen unbekannte/komplexe UI-Zustandslogik lohnt sich ein kurzer Blick auf die
  State-Variablen, die die Sichtbarkeit steuern (hier `showPocketDashboard`,
  `subcellarFilter`), bevor der erste Testlauf gestartet wird — nicht erst danach.
- **Playwright-Selektoren, die auf sichtbaren Text/Rollen statt auf stabilen Hooks beruhen, sind
  gegen UI-Zustandswechsel (Dashboard vs. Raster, Filterwechsel) besonders empfindlich.** Alle vier
  Ursachen in dieser Runde waren UI-Zustand, nicht Test-Syntax — bestätigt den bereits im
  vorherigen Retro genannten Punkt zu fehlenden `data-testid`s, diesmal aus der
  Root-Cause-Statistik statt aus Vermutung.
