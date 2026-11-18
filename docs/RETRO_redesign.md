# Retro: UI-Redesign aller Seiten

Ablauf: Entwurf aller Seiten als Design-Canvas → Übernahme in React/Tailwind.

## Was gut funktioniert hat

- **Erst Tokens, dann Seiten.** `stone.gray`, `sage` und `gold.dim` in `tailwind.config.cjs` auf kontraststarke Werte umzustellen hat 140+ Textstellen auf einen Schlag lesbar gemacht, ohne jede Datei anzufassen.
- **Mechanischer Durchgang für die Masse, Handarbeit für die sichtbarsten Flächen.** Eine regex-Tabelle (stone-/red-/emerald-Klassen → Tokens, Arbitrary-Shadows raus, 9–10px-Text → 11px) hat die beiden großen Seiten (Weindetail 2.500 Zeilen, Anlässe 1.300 Zeilen) angeglichen; Header, Navigation, Dashboard und kleine Seiten wurden komplett neu geschrieben.
- **Gemeinsame Bausteine** (`components/PageHeader.tsx` mit `PageHeader`, `buttonClass`, `cardClass`) statt Klassen zu kopieren – jede Seite hat jetzt denselben Kopf und dieselben Buttons.
- **Vorschau-Harness ohne Backend.** Eine temporäre Vite-Seite mit Beispieldaten und per `Object.assign` überschriebenem `storageService` erlaubte Screenshots aller Seiten (Desktop + 390 px), obwohl Supabase nicht konfiguriert war. Hat sofort einen echten Fehler gezeigt (Playfair-Mediävalziffern in KPIs).
- **Test-Selektoren vorher prüfen.** `Kollektion durchsuchen...`, `Demo-Modus nutzen`, `Grand Cru Vault` und der `Details`-Link wurden bewusst erhalten; nur die Dashboard-Überschrift im UI-Test musste angepasst werden.

## Was nicht gut lief

- Die Weindetail-Seite hatte eine **eigene Parallel-Palette** (`#5B1E2D`, `#C8A24A`, `stone-*`, eigener Hintergrund und eigenes Padding). Das hat doppelte Ränder innerhalb des Layouts erzeugt und war erst beim Lesen des Containers sichtbar – künftig neue Seiten nur mit Tokens bauen.
- Der Status-Filter im Keller war ein Select; die Chips ersetzen ihn. Persistierte Filter-Präferenzen funktionieren weiter, aber das hätte vorab bewusst entschieden werden sollen statt nebenbei.
- `server.routes.test.ts` schlägt lokal fehl, weil `server/` eigene Abhängigkeiten hat – vor dem Baseline-Lauf `cd server && npm ci` ausführen, sonst kostet es Zeit, den Fehler einzuordnen.
