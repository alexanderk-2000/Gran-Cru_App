# Retro: Gesamt-Audit + Zielplan (2026-08-11)

Loop: Die gesamte App auf unsaubere Workflows prüfen und daraus einen Plan schreiben
(`docs/PLAN_GUTE_WEIN_APP.md`).

## Was gut funktioniert hat

- **Erst Aufruf-Wege prüfen, dann Dateien lesen.** Der wertvollste Fund des ganzen Durchlaufs
  (`addTasting` existiert in Storage, Offline-Adapter, Sync-Engine und DB — wird aber von keiner
  UI aufgerufen) kam aus einem einzelnen `grep -rn "addTasting"` über den ganzen Baum, nicht aus
  dem Lesen von `WineDetailPage.tsx`. Beim Lesen wäre er nicht aufgefallen, weil die Notizen-
  Timeline optisch vollständig aussieht. Gleiches Muster brachte B3 (Genussplan setzt nur
  `status`) und B5 (`onAddBottle` ist `() => {}`).
- **Denselben Begriff an allen Fundstellen gegeneinander halten.** Kategorien, Reifestatus,
  Kellerwert und Dublettenerkennung sind je für sich plausibel implementiert und widersprechen
  sich erst im Vergleich. Diese Klasse von Befunden (B6–B9) findet man nur, wenn man gezielt nach
  *allen* Definitionen eines Begriffs sucht, statt Screen für Screen zu lesen.
- **Deployment-Konfiguration mitprüfen.** `vercel.json` + fehlendes `api/`-Verzeichnis ergaben,
  dass in der deployten App keine KI-Funktion laufen kann (B4) — ein Befund, den kein Blick in
  den Anwendungscode geliefert hätte, weil dort alles korrekt verdrahtet ist.
- **`npm ci` früh im Hintergrund starten.** Der Install lief parallel zum Lesen der Feature-Seiten;
  Typecheck/Lint/Unit-Tests standen damit ohne Wartezeit zur Verfügung und lieferten die
  Absicherung, dass die Befunde Design- und keine Kaputt-Probleme sind (alles grün).

## Was nicht gut funktioniert hat

- **Zu spät gemerkt, dass eine ausführliche Vor-Analyse existiert.** `WEITERENTWICklungspotenzial_2026-07-22.md`
  wurde zwar am Anfang gelesen, aber ihr Umsetzungsstatus-Abschnitt erst später ernst genommen.
  Ein Teil der frühen Lesezeit ging in Bereiche (Sync-Engine, RLS, Provider-Setup), die dort
  bereits abgehandelt *und* umgesetzt waren. Richtig wäre gewesen: erst den Umsetzungsstatus der
  letzten Analyse durchgehen, dann gezielt die *nicht* abgedeckten Flächen prüfen (UI-Workflows,
  Deployment, Fachlogik-Konsistenz) — genau dort lagen dann auch alle neuen Funde.
- **Große Dateien zu früh vollständig gelesen.** `InventoryPage.tsx` (891 Zeilen) und `Dashboard.tsx`
  (701) wurden komplett gelesen; bei `WineDetailPage.tsx` (2577) war der Umstieg auf
  `grep`-Outline + gezielte Ausschnitte deutlich effizienter und hat trotzdem mehr Befunde pro
  gelesener Zeile gebracht. Bei Dateien > ~500 Zeilen sollte die Outline immer der erste Schritt sein.
- **Befund-Nummerierung erst am Ende vergeben.** Die Querverweise zwischen Befundteil und
  Plan-Tabellen mussten nachträglich eingezogen werden. Beim nächsten Audit von Anfang an
  IDs vergeben, dann lassen sich Fundstellen direkt beim Finden verlinken.
