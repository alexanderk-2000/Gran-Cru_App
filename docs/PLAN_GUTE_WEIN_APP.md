# Plan: Von „viele Features" zu „richtig gute Wein-App für den eigenen Keller"

Stand: 2026-08-11 · Basis: Codestand `d2d2f4c` (main)

Dieses Dokument ist zweiteilig:

1. **Befund** — was beim Durchgehen der gesamten App konkret unsauber ist (mit Datei/Zeile, nachprüfbar).
2. **Plan** — in welcher Reihenfolge das zu einer App wird, die man täglich gern benutzt.

Der Befund ist neu erhoben (nicht aus `WEITERENTWICKLUNGSPOTENZIAL_2026-07-22.md` übernommen); wo sich Punkte überschneiden, ist das vermerkt.

---

## 0. Was heißt „richtig gut" für einen privaten Weinkeller?

Die App verwaltet keinen Handelsbestand, sondern die Sammlung *einer* Person. Daraus folgen fünf Leitsätze, an denen der ganze Plan hängt:

| Leitsatz | Bedeutung für die App |
| --- | --- |
| **1. Erfassen darf nicht wehtun** | Eine Flasche in den Keller zu legen ist der häufigste Vorgang. Er muss auf dem Handy in unter 30 Sekunden gehen — mit *einem* Weg, nicht dreien. |
| **2. Der Keller muss immer stimmen** | Bestand ist die eine Zahl, der man glauben muss. Jede Mengenänderung ist atomar, nachvollziehbar und offline-fest. |
| **3. Trinken ist der Höhepunkt, nicht ein Dekrement** | Eine geöffnete Flasche erzeugt eine Erinnerung (Notiz, Bewertung, Anlass), nicht nur `quantity - 1`. |
| **4. Die App denkt mit, statt zu verwalten** | Reifefenster, Empfehlungen und Anlässe müssen auf *einer* Wahrheit beruhen und einen Klick zur Handlung anbieten. |
| **5. Die Sammlung gehört dem Nutzer** | Export, Backup, Bilder, die nicht verfallen — Vertrauen ist bei einer Sammlung wichtiger als jedes Feature. |

Gegen diese fünf Leitsätze ist die App aktuell an folgenden Stellen undicht.

---

## 1. Befund

### 1.1 Abgerissene Workflows (das Dringendste)

**B1 — Notizen und Bewertungen können gar nicht erfasst werden.**
`storageService.addTasting()` existiert in der Legacy-Fassade (`services/storage.legacy.ts:1135`), im Offline-Adapter (`services/pwa/storageOfflineAdapter.ts:426`), in der Sync-Engine und in der DB. **Kein einziger UI-Aufruf existiert.** Der Button „Notiz erfassen" in der Notizen-Timeline ruft `onDrink(wine)` auf (`features/wine-detail/WineDetailPage.tsx:2148`) — er trinkt also eine Flasche, statt eine Notiz zu schreiben. Die Notizen-Liste darüber kann folglich nie etwas anzeigen. Für eine private Sammlung ist das die wichtigste fehlende Funktion überhaupt (Leitsatz 3).

**B2 — Es gibt drei Erfassungswege, und der prominenteste ist der schlechteste.**
- *Scanner* → `ScanResultDialog` nutzt echte KI (`aiService.generateWineInfo` → `/api/ai/search`), Dublettenwarnung, Validierung. Das ist der gute Weg.
- *„NEU ANLEGEN"* (der große Burgunder-Button, `features/inventory/InventoryPage.tsx:543`) öffnet einen Dialog, der einen **Prompt zum Kopieren** erzeugt, den man in ChatGPT einfügen und dessen JSON man zurückkopieren soll (`buildPromptForWine`, Zeile 347–391). Die App kann das seit der OpenRouter-Anbindung selbst — sie bietet es an dieser Stelle nur nicht an.
- *„Manuell anlegen"* (`manualAdd`, Zeile 411) legt **ohne jedes Formular** einen Datensatz „Neuer Wein", Region „Unbekannt", 0 €, Fenster `Jahr..Jahr+10` an. Dieser Platzhalter landet sofort im Bestand, in den Dashboard-KPIs und in den Alerts („Preis fehlt").

**B3 — Der Genussplan ist vom Keller abgekoppelt.**
Eine Anlass-Instanz auf `consumed` zu setzen schreibt nur den Status (`services/storage.legacy.ts:871`). Kein Bestandsabgang, kein `inventory_event`, keine Notiz. `bottles_reserved` im Wein-Pool reserviert nichts gegen den echten Bestand — man kann dieselbe letzte Flasche für drei Anlässe „reservieren" und sie danach trotzdem noch im Keller haben.

**B4 — In der deployten App funktioniert keine einzige KI-Funktion.**
Es gibt kein `api/`-Verzeichnis und keinen Serverless-Adapter; `server/index.js` startet nur einen lokalen Express-Prozess. `vercel.json` leitet **alles** auf `/index.html` um. Auf Vercel liefert `/api/ai/search` also HTML mit Status 200 → `response.json()` wirft → der Nutzer sieht „Failed to generate wine information. Unexpected token '<'". Schlimmer: `/api/health` liefert ebenfalls 200, weshalb die Einstellungen fröhlich „API-Server online" melden (`features/Settings.tsx:99`). Lokal funktioniert es nur über den Vite-Dev-Proxy (`vite.config.ts:21`).

**B5 — Tote Einstiegspunkte.**
„Einkauf erfassen" im Dashboard verlinkt nach `/inventory` (`features/Dashboard.tsx:637`) — es gibt dort keinen Einkaufsvorgang. Die `onAddBottle`-Prop wird in `App.tsx:199` und `:213` als `() => {}` durchgereicht. Alle „Beheben"-Buttons der Alerts landen auf der ungefilterten Kellerliste, statt auf den betroffenen Weinen.

### 1.2 Widersprüchliche Fachlogik (dieselbe Flasche, zwei Wahrheiten)

**B6 — Zwei konkurrierende Reifemodelle.**
`getWineStatus()` (`utils.ts:5`) ist ein reiner Jahresvergleich und treibt WineCard, Kellerfilter, Dashboard-KPIs und Zeitachse. `evaluateWineDrinkability()` (`domain/wine/drinkability.ts`, Gauß-Kurve, Archetypen, Unsicherheits-Score) treibt nur Weindetail und Genussplan. Derselbe Wein kann in der Liste „Trinkreif" und im Detail „zu früh" sein. Das gute Modell ist gebaut und wird zu 20 % genutzt.

**B7 — Kategorien sind an drei Stellen unterschiedlich definiert.**
`types.ts:2` kennt vier (`Genuss | Investment | Rarität | Daily Drinker`). Der Kellerfilter bietet drei an, ohne `Daily Drinker` (`InventoryPage.tsx:565`). Das Bearbeiten-Formular bietet drei an, ohne `Investment` (`WineDetailPage.tsx:174`). `manualAdd` erzeugt `Daily Drinker` — nicht filterbar. Der Scanner erzeugt `Genuss` bzw. `Rarität`. Und das Dashboard rechnet einen Investment-Wert über `category === 'Investment'`, was man im Bearbeiten-Formular gar nicht mehr setzen kann.

**B8 — Drei Rechenwege für denselben Kellerwert.**
`calculatePortfolioStats` (`utils.ts:19`) rechnet ausschließlich mit `purchase_price`. Das Dashboard rechnet `market_price ?? purchase_price` (`Dashboard.tsx:162`). Die Sortierung „Höchster Wert" ebenso (`InventoryPage.tsx:317`). Die WineCard beschriftet `purchase_price` als „Einstand Ø" (`WineCard.tsx:174`) — das stimmt nach `recordPurchase` (gewichteter Mittelwert, `storage.legacy.ts:441`), aber das Bearbeiten-Formular überschreibt dasselbe Feld als Flachwert.

**B9 — Zwei Dublettenerkennungen.**
`domain/wine/duplicateDetection.ts` verlangt Barcode-Treffer *oder* Name+Produzent+Jahrgang+Format exakt. Das Dashboard baut sich einen eigenen, lockereren Normalisierungs-Key (`Dashboard.tsx:302`). Ergebnis: Das Dashboard warnt vor Dubletten, die der Import nie blockiert hätte — und umgekehrt.

**B10 — Die Trinkhistorie ist keine.**
`getConsumptionHistory()` filtert hart auf `type = 'consume'` (`storage.legacy.ts:597`). Das Dashboard beschriftet dieselbe Liste als „Zuletzt hinzugefügt oder getrunken" (`Dashboard.tsx:569`) — Zugänge erscheinen dort nie. Käufe, Verluste, Inventurkorrekturen und Umlagerungen werden sauber als Events geschrieben und nirgends angezeigt.

### 1.3 Datenmodell

**B11 — Bestandsänderungen sind nicht atomar.**
`adjustStock`, `consumeBottle`, `recordPurchase`, `recordLoss` lesen im Client die Menge, rechnen und schreiben zurück (`storage.legacy.ts:398/543/429/468`). Schlägt das nachgelagerte Event-Insert fehl, wird per zweitem Schreibvorgang „zurückgerollt". Zwei Geräte, ein wiedergespielter Offline-Queue-Eintrag oder ein Abbruch zwischen den beiden Schreibvorgängen → verlorene Updates. Das gehört in eine Postgres-Funktion (eine Transaktion, ein Roundtrip).

**B12 — Flaschen sind ein Zähler, keine Objekte.**
Ein Wein hat `quantity`, `format`, `purchase_price`, `subcellar`. Damit ist nicht abbildbar: eine Magnum und drei 0,75er desselben Weins; zwei Zukäufe zu verschiedenen Preisen (der ältere Preis verschwindet im Mittelwert); „welche Flasche liegt in welchem Fach"; Provenienz/Bezugsquelle je Flasche. Für eine Sammlung, in der genau diese Details den Reiz ausmachen, ist das die zentrale Modellgrenze.

**B13 — Kein Wertverlauf.** `market_price` ist ein einzelnes Feld ohne Historie. Der „Investment"-Anspruch (Kategorie, Dashboard-KPI, `ai_details.investment.*`) hat keine Datenbasis.

**B14 — `ai_details` ist ein 10-teiliger Freiform-Blob** (`types.ts:83–232`) ohne Schema-Validierung auf beiden Seiten. Im Bearbeiten-Dialog stehen weiterhin rohe JSON-Textareas für Aromen, Pairings, `ai_details`, `ai_sources` und `missing_fields` (`WineDetailPage.tsx:1704–1708`). Rebsorten, Struktur und Scores haben seit `c92a8d5` echte Formulare — der Rest nicht.

**B15 — Bilder verfallen.** `imageStorageService` erzeugt Signed URLs mit 1 Jahr Gültigkeit (`services/imageStorage.ts:15`) und **speichert diese URL** in `ai_details.app.images`. Nach einem Jahr sind alle Etikettenfotos tote Links, ohne Erneuerungspfad.

### 1.4 Bedienung, besonders mobil

**B16 — 33 `alert()`/`confirm()`-Aufrufe** in sieben Dateien. Ein Toast-System existiert — aber nur lokal in `WineDetailPage` (`InlineToast`, Zeile 829). Import-Ergebnisse, Fehler und Bestätigungen laufen sonst über blockierende Browser-Dialoge.

**B17 — Pocket-Zuordnung funktioniert auf dem Handy nicht.** Weine werden per HTML5-Drag-&-Drop in Pockets gezogen (`InventoryPage.tsx:478–504`). Auf Touch-Geräten gibt es kein `dragstart`. Einen alternativen Weg („Verschieben nach…" im Menü) gibt es nicht — ausgerechnet für die Tätigkeit, die man mit dem Handy im Keller stehend macht.

**B18 — Keine mobile Navigation, keine Sync-Anzeige.** Die Navigation liegt hinter einem Hamburger (`components/Layout.tsx:79`), es gibt keine Bottom-Bar. Der komplette Offline-Stack (Dexie, Write-Queue, Delta-Sync) ist unsichtbar: In der Seitenleiste steht das statische Dekor „Cloud Sync — Safe & Secure" (Zeile 165–171), echte Queue-Zahlen stehen ausschließlich in den Einstellungen. Man kann offline zehn Änderungen machen und weiß nirgends, ob sie angekommen sind.

**B19 — Die Zeitachse skaliert nicht.** `features/Timeline.tsx` rendert jeden Wein als eigene Zeile über 41 Jahre à 80 px, ohne Filter, Gruppierung, Virtualisierung. Keine Peak-Markierung (obwohl `peak_year` existiert), Zeilen sind nicht anklickbar. Ab ~50 Weinen unbenutzbar.

**B20 — Die Trinkhistorie zeigt Innereien.** Untertitel „Alle konsumierten Flaschen aus inventory_events", Zeile „Quelle: detail" (`features/DrinkHistory.tsx:76,123`). Kein Link zum Wein, kein Filter, keine Notiz. Zusätzlich ein Bug: Das Fehler-Banner steht im Zweig für *nicht leere* Listen (Zeile 102) — schlägt das Laden fehl, ist die Liste leer, also sieht man nur das `alert()`.

**B21 — Die Einstellungen sind für Entwickler geschrieben.** Terminalbefehle (`cd server && npm install && npm run dev`, Zeile 203), `server/.env`-Pfade, rohe Modell-IDs. Die Modell-Listen im Client (`Settings.tsx:44–65`) driften bereits gegen den Server-Katalog (`server/src/ai/providers/modelCatalog.js`) — und `DEFAULT_SETTINGS.openai_model` ist `'5.2'` (`services/settings.ts:24`), die UI zeigt `'gpt-5.2'`.

**B22 — Kein Export.** Weder CSV noch JSON. Bei einer über Jahre gepflegten Sammlung ist das ein Vertrauensproblem, kein Komfortthema.

**B23 — Leere Zustände und Tonalität.** Die leere Kellerliste sagt „Starten Sie Ihre Kollektion." ohne Button (`InventoryPage.tsx:853`). Die Ansprache wechselt zwischen „Sie" („Verwaltung Ihrer flüssigen Assets") und „du" („Lege eine Pocket wie ein Unterkonto an"), und die Bankmetaphorik (Pockets = „Unterkonten", „flüssige Assets", „Portfolio") passt nicht zu einer privaten Sammlung.

**B24 — Barrierefreiheit.** Nur der Dialog im Weindetail hat einen Fokus-Trap (Zeile 1583–1620); Pocket- und Erfassungs-Dialoge nicht. Statusänderungen werden nicht per `aria-live` gemeldet. 10-px-Versalien als primärer Beschriftungsstil sind auf dem Handy grenzwertig lesbar.

### 1.5 Technik und Betrieb

- **B25 — Die Modularisierung ist teilweise Fassade.** `services/storage/*.ts` sind Re-Export-Hüllen über die 1176-Zeilen-Datei `storage.legacy.ts`. `WineDetailPage.tsx` hat 2577 Zeilen, `EnjoymentPlanPage.tsx` 1301, `InventoryPage.tsx` 891. (Bekannt aus der Juli-Analyse, weiterhin offen.)
- **B26 — Der KI-Cache ist prozesslokal** (`server/src/cache/aiCache.js`) — bei Serverless oder mehreren Instanzen wirkungslos; die persistente `ai_cache`-Tabelle wurde entfernt.
- **B27 — Keine Fehlerüberwachung.** Server wie Client protokollieren nur nach `console.error`.
- **B28 — Testabdeckung liegt neben den Risiken.** 48 Unit-Tests, grün, aber ausschließlich Domänen- und PWA-Logik. Es gibt keinen Test, der einen Erfassungs- oder Trinkvorgang durch die UI führt. `tests/unit/server.routes.test.ts` fällt lokal aus, solange `npm ci --prefix server` nicht gelaufen ist (in CI ist es abgedeckt).

**Verifiziert am Codestand:** `npm run typecheck` ✅, `npm run lint` ✅, `npm run test:unit` → 48 Tests grün, 1 Suite übersprungen wegen fehlender Server-Dependencies.

---

## 2. Plan

Sechs Phasen. Jede Phase ist für sich auslieferbar und macht die App spürbar besser — keine Phase ist reine Vorarbeit. Die Reihenfolge folgt dem Prinzip: **erst reparieren, was verspricht und nicht hält; dann den häufigsten Weg perfektionieren; dann Tiefe.**

Aufwandsangaben sind grobe Größenordnungen für eine Person.

---

### Phase 1 — Ehrlichkeit herstellen ✅ umgesetzt

*Ziel: Nichts in der App behauptet mehr etwas, das nicht stimmt.*

> **Status:** umgesetzt. Umsetzungsnotizen am Ende dieses Abschnitts.

| # | Arbeitspaket | Behebt |
| --- | --- | --- |
| 1.1 | **API in Produktion bereitstellen.** Express-App als Vercel-Function unter `api/` verfügbar machen (`server/src/app.js` exportiert bereits eine App — ein Handler-Wrapper genügt) und `vercel.json` so ordnen, dass `/api/*` *vor* dem SPA-Fallback greift. Alternative, falls das Backend bewusst lokal bleiben soll: KI-Buttons im Deployment sichtbar deaktivieren statt kryptisch scheitern zu lassen. | B4 |
| 1.2 | **Health-Check ehrlich machen.** `/api/health` muss ein JSON-Feld prüfen, nicht nur `response.ok` — HTML mit Status 200 darf nicht als „online" gelten. | B4 |
| 1.3 | **Kategorien vereinheitlichen.** Eine Konstante `WINE_CATEGORIES` in `constants.ts`, überall importiert (Filter, Bearbeiten-Formular, Scanner, Import). Entscheidung nötig: bleiben es vier oder wird `Daily Drinker` fallengelassen? | B7 |
| 1.4 | **Einen Wertbegriff festlegen.** `calculatePortfolioStats` auf `market_price ?? purchase_price` umstellen und Dashboard/Sortierung dieselbe Funktion nutzen lassen. „Einstand Ø" nur dort beschriften, wo tatsächlich gemittelt wird. | B8 |
| 1.5 | **Tote Einstiege entfernen oder erfüllen.** „Einkauf erfassen" führt in den echten Kaufdialog (oder verschwindet); `onAddBottle` raus; Alert-„Beheben"-Links auf gefilterte Listen (`/inventory?filter=missing-price`) statt auf die Gesamtliste. | B5 |
| 1.6 | **Trinkhistorie-Fehlerbanner reparieren** (aus dem Nicht-Leer-Zweig herausziehen) und Interna aus den Texten entfernen. | B20 |

**Fertig, wenn:** In einem frischen Vercel-Deployment funktionieren Scan und KI-Recherche, oder sie sind ehrlich als „nicht verfügbar" markiert. Keine Kennzahl auf dem Dashboard widerspricht mehr der Kellerliste.

#### Umsetzungsnotizen

- **1.1** `api/index.js` exportiert die vorhandene Express-App als Vercel-Function; `vercel.json` leitet `/api/(.*)` **vor** dem SPA-Fallback dorthin. `express`/`cors`/`dotenv`/`openai` sind jetzt auch im Root-`package.json` deklariert, weil Vercel nur dort installiert — Nebeneffekt: `tests/unit/server.routes.test.ts` läuft lokal ohne `npm ci --prefix server`. Das Funktions-Timeout ist auf 55 s gesetzt (unter `maxDuration` 60 s), sonst würde die Plattform vor unserem eigenen Timeout abbrechen. Env-Variablen und ein `curl`-Check stehen in `VERCEL_SETUP.md`.
- **1.2** Neu: `services/apiHealth.ts`. Ein Backend gilt erst als erreichbar, wenn die Antwort JSON mit `status: "ok"` ist — `response.ok` allein war der Grund für die falsche Meldung „Server läuft". Die KI-Aufrufe prüfen denselben Content-Type und melden statt „Unexpected token '<'" einen verständlichen Hinweis. Fünf Testfälle in `tests/unit/apiHealth.test.ts`, darunter explizit der SPA-Fallback.
- **1.3** `WINE_CATEGORIES` in `constants.ts` ist jetzt die einzige Quelle; Filter und Bearbeiten-Formular leiten sich daraus ab. Alle vier Kategorien bleiben erhalten (Wegnehmen hätte bestehende Datensätze entwertet).
- **1.4** `getBottleUnitValue` / `getWinePositionValue` / `hasKnownPrice` in `utils.ts`; Portfolio-Statistik, Dashboard, Wertsortierung und Weinkarte rechnen darüber. Die Karte beschriftet den Wert jetzt danach, woher er stammt. Tests in `tests/unit/portfolioValue.test.ts`.
- **1.5** „Einkauf erfassen" heißt „Nachkauf erfassen" und öffnet über `?action=purchase` einen echten Dialog (`components/PurchaseDialog.tsx`: Wein wählen, Flaschen, Preis → `recordPurchase`). Alerts verlinken über `?issue=…` auf gefilterte Listen; persistierte Filter werden in dieser Ansicht bewusst übergangen, damit die Antwort vollständig bleibt. `onAddBottle` ist entfernt.
- **1.6** Fehlerbanner der Trinkhistorie steht außerhalb des Nicht-Leer-Zweigs, `alert()` entfällt, Einträge verlinken auf den Wein, interne Quellenschlüssel sind übersetzt.
- **Zusätzlich mitgenommen:** Die Dashboard-Dublettenprüfung nutzt jetzt `findLikelyDuplicates` statt eigener Logik (B9, war für Phase 5 vorgesehen — die Zusammenführen-Aktion bleibt dort); irreführende Beschriftungen korrigiert („Trinkbereit (nächste 90 Tage)" → „Trinkbereit", „Marktwert" → „Kellerwert · Marktpreis, sonst Einstand", „Zuletzt hinzugefügt oder getrunken" → „Zuletzt getrunken"); die leere Kellerliste hat einen Einstiegsknopf statt eines Satzes.

---

### Phase 2 — Ein Erfassungsweg ✅ umgesetzt

*Ziel: Leitsatz 1. Eine Flasche kommt auf einem Weg in den Keller, auf dem Handy, in unter 30 Sekunden.*

| # | Arbeitspaket |
| --- | --- |
| 2.1 ✅ | **`WineForm` als eigene Komponente bauen** — ein Formular für Anlegen *und* Bearbeiten. Pflicht: Name, Jahrgang, Menge. Alles andere optional und eingeklappt. Struktur-Slider (Säure/Tannin/Körper/Süße/Holz) und Rebsorten-Zeilen aus dem Bearbeiten-Dialog wiederverwenden. |
| 2.2 ✅ | **Die drei Wege zu einem zusammenführen.** Ein Einstieg „Wein hinzufügen" mit drei gleichwertigen Startpunkten in *demselben* Formular: `Foto/Barcode scannen` · `Name eingeben + KI-Recherche` · `manuell ausfüllen`. Die KI füllt Felder vor, der Nutzer bestätigt. Der Copy-Paste-Prompt entfällt ersatzlos (die App kann das selbst). `manualAdd` mit seinem Platzhalter-Datensatz entfällt ebenfalls. |
| 2.3 ◐ | **Rohe JSON-Textareas ersetzen** — Aromen als Chip-Eingabe, Pairings als Zeilenliste. `ai_details`/`ai_sources`/`missing_fields` hinter „Erweitert" verstecken, standardmäßig unsichtbar. |
| 2.4 ✅ | **JSON-Import bleibt, wandert aber in die Einstellungen** („Daten importieren") — er ist ein Migrationswerkzeug, kein Alltagsweg, und gehört nicht neben den Haupt-Button. |
| 2.5 ✅ | **Erfassungs-Vertrauen sichtbar machen:** KI-befüllte Felder markieren, `confidence` und `missing_fields` im Formular anzeigen (der `ConfidenceBadge` existiert bereits im Lesemodus). |

**Fertig, wenn:** Ein Playwright-Test legt auf einem Mobil-Viewport einen Wein per Formular an und findet ihn in der Kellerliste. Der Keller enthält keine „Neuer Wein"-Platzhalter mehr.

#### Umsetzungsnotizen

- Neu: `components/WineForm.tsx` (das eine Formular, Pflicht sind Name, Jahrgang, Flaschen; alles andere in aufklappbaren Abschnitten, inklusive Struktur-Schiebereglern und Rebsorten-Zeilen) und `components/AddWineDialog.tsx` (der eine Einstieg).
- Der Copy-Paste-Prompt für ChatGPT ist ersatzlos entfallen — die Recherche läuft über `aiService.generateWineInfo`, dieselbe Funktion, die der Scan schon nutzte. Die Antwort wird mit `normalizeImportedWine` gemappt, also mit demselben Normalisierer wie der JSON-Import.
- `manualAdd` (Platzhalter „Neuer Wein", Region „Unbekannt", 0 €, erfundenes 10-Jahres-Fenster) ist weg. Wer kein Trinkfenster einträgt, bekommt keins erfunden — der Wein erscheint dann ehrlich als „Kein Fenster" (Phase 3.4).
- `ScanResultDialog.tsx` ist gelöscht: Ein Scan füttert jetzt dasselbe Formular vor, statt ein zweites, kleineres zu öffnen. Damit gibt es genau ein Erfassungsformular statt drei.
- Der JSON-Import ist als eigener, klar als Migrationswerkzeug beschrifteter Dialog erhalten („Importieren") — nicht in den Einstellungen wie im Plan skizziert, sondern in der Kellerliste, weil er dort auf die aktive Pocket zugreift. Seine `alert()`-Rückmeldungen laufen jetzt über das Banner der Seite.
- Recherchierte Felder sind im Formular mit „KI" markiert; Dubletten warnen direkt im Dialog und verweisen auf „Nachkauf erfassen".
- Sieben Testfälle in `tests/unit/addWineDialog.test.tsx`, darunter die Regression „legt kein Trinkfenster an, das niemand eingetragen hat".

**Bewusst offen (2.3):** Das Bearbeiten-Formular im Weindetail nutzt noch seine eigenen Felder samt JSON-Textareas für Aromen und Pairings. Es auf `WineForm` umzustellen ist ein sinnvoller nächster Schritt, gehört aber in dieselbe Sitzung wie die Zerlegung von `WineDetailPage.tsx` (2577 Zeilen) — separat, damit ein Fehler dort nicht die Erfassung mitreißt.

**Behebt:** B2, B14 (UI-Teil), B23 (Einstiege)

---

### Phase 3 — Trinken, erinnern, glauben (≈ 2 Wochen)

*Ziel: Leitsätze 2 und 3. Die geöffnete Flasche hinterlässt eine Erinnerung, und der Bestand stimmt immer.*

| # | Arbeitspaket |
| --- | --- |
| 3.1 ✅ | **„Flasche öffnen"-Dialog.** Ein Vorgang: Datum · Bewertung (Sterne) · Notiz · optional Anlass · optional Foto. Schreibt in *einem* Schritt `inventory_event` **und** `tasting`. Das ist die Funktion, die aktuell komplett fehlt (B1) — höchster Einzelnutzen im ganzen Plan. |
| 3.2 ✅ | **Notiz ohne Verbrauch ermöglichen** (Verkostung beim Händler, zweites Glas aus derselben Flasche). Entkoppelt Notiz von Bestandsabgang. |
| 3.3 | **Bestandsmutationen in eine Postgres-Funktion verlegen.** `adjust_stock(wine_id, delta, type, source, note)` als `SECURITY INVOKER`-RPC: Menge ändern und Event schreiben in einer Transaktion. Client, Offline-Adapter und Queue-Replay rufen nur noch diese eine Funktion. Beseitigt die Lese-Rechne-Schreibe-Rennen und die manuellen Rollback-Schreibvorgänge. |
| 3.4 ✅ | **Ein Reifemodell.** `getWineStatus` wird zu einer dünnen Hülle über `evaluateWineDrinkability`. Kellerliste, Karten, Dashboard und Zeitachse zeigen dann dieselbe Bewertung wie das Detail — inklusive Unsicherheitshinweis, wenn Struktur-Daten fehlen. |
| 3.5 | **Trinkhistorie zur Genusshistorie ausbauen:** alle Event-Typen (Zugang, Abgang, Verlust, Korrektur, Umlagerung) mit Filter, verlinkt auf den Wein, mit Bewertung und Notiz in der Zeile. Das Dashboard-„Letzte Aktivitäten" nutzt dieselbe Quelle und stimmt dann mit seiner Beschriftung überein. |
| 3.6 | **Globale Sync-Anzeige.** Ein Statuselement in Kopfzeile/Bottom-Bar: online/offline, ausstehende Änderungen, letzter Sync, Tippen → sofort synchronisieren. Ersetzt das statische „Safe & Secure"-Dekor. Die Daten dafür liefert `subscribeQueueSnapshot` bereits. |

**Fertig, wenn:** Eine geöffnete Flasche taucht mit Bewertung und Notiz in der Historie und am Wein auf. Zwei gleichzeitige Bestandsänderungen führen nachweislich (Test) zum korrekten Endbestand. Ein Wein hat in Liste und Detail denselben Status.

#### Umsetzungsnotizen zu 3.4

- `getWineStatus` ist jetzt eine Hülle über `getWineMaturity` in `domain/wine/drinkability.ts`; das Gauß-Modell mit Struktur-Ableitung und Unsicherheit gilt damit für Kellerliste, Karten, Filter, Dashboard-KPIs und Zeitachse — vorher nur für Detail und Genussplan.
- Neuer Status `WineStatus.UNKNOWN`: Weine ohne belastbares Fenster galten bisher stillschweigend als „Trinkreif" (der Jahresvergleich verglich gegen `undefined`, jedes Ergebnis war `false`). Sie erscheinen jetzt als „Kein Fenster" — mit eigenem Filter, eigenem Dashboard-Hinweis inkl. Anzahl und einem Link, der genau diese Weine listet.
- Die Weinkarte zeigt die feine Bewertung („Optimal", „Anlaufphase", „Über Fenster") in der Farbe ihres groben Eimers, mit der Erklärung des Modells als Tooltip.
- Das Dashboard zählt die Reife-Eimer einzeln, statt „Lagernd" als Rest zu berechnen — sonst wären die neuen „Kein Fenster"-Flaschen dort gelandet.
- Die Zeitachse rendert Weine ohne Fenster nicht mehr als Balken bei `NaN` Pixeln, sondern listet sie mit Link zum Ergänzen auf.
- Acht Testfälle in `tests/unit/wineMaturity.test.ts`, darunter explizit die „ohne Fenster ist nicht trinkbereit"-Regression.

#### Umsetzungsnotizen zu 3.1/3.2

- Neu: `components/OpenBottleDialog.tsx` — Bestand, Datum, Sterne und Notiz in einem Vorgang, erreichbar über „Öffnen" auf der Weinkarte und „Flasche öffnen" im Detail. Das Häkchen „Flasche vom Bestand abziehen" trennt Notiz und Verbrauch: Verkostung beim Händler oder ein zweites Glas gehen ohne Abgang, und bei Bestand 0 bleibt die Notiz möglich.
- **Dabei gefundener Fehler in `addTasting`:** Die Funktion rief intern `adjustStock(-1)` auf und überschrieb ein übergebenes Datum mit „jetzt". Eine Notiz hätte damit zwingend eine Flasche verbraucht — verbucht als `adjustment`, nicht als `consume`, also unsichtbar in der Trinkhistorie, während der Bestand sank. Offline passierte das nicht, online schon. Jetzt schreibt `addTasting` nur die Notiz; der Verbrauch ist eine explizite Entscheidung des Aufrufers.
- Ohne Bewertung wird `rating` weggelassen statt als `0` gesendet (die Tabelle erlaubt nur 1–5); die Notizliste blendet Sterne und Zitat entsprechend aus.
- `App.tsx` reicht kein `onDrink` mehr durch; das Weindetail meldet über `onChanged` **jede** Änderung zurück (auch Nachkauf, Bearbeiten, Löschen — die aktualisierten die Kellerliste bisher gar nicht).
- Testinfrastruktur: `vitest.config.ts` nimmt jetzt auch `.tsx` auf und lädt `tests/setup.ts` mit den jest-dom-Matchern (die Abhängigkeit war deklariert, aber nie eingebunden — es gab keine einzige Komponententests). Sechs Fälle in `tests/unit/openBottleDialog.test.tsx`.

**Behebt:** B1, B6, B10, B11, B18 (Sync-Teil), B20

---

### Phase 4 — Der Keller als realer Ort (≈ 2–3 Wochen)

*Ziel: Die App bildet ab, wo die Flasche wirklich liegt — und funktioniert dort, wo man steht: im Keller, mit dem Handy.*

| # | Arbeitspaket |
| --- | --- |
| 4.1 | **Flaschen als Objekte (Modellentscheidung).** Neue Tabelle `bottles` (`wine_id`, `format`, `purchase_date`, `purchase_price`, `source`, `pocket_id`, `position`, `status`, `consumed_at`). `wines.quantity` bleibt als abgeleiteter, per Trigger gepflegter Wert erhalten, damit alle bestehenden Ansichten weiterlaufen. Migration: Für jeden Wein `quantity` Flaschen mit den heutigen Werten erzeugen. Löst B12 und B13 (Einstandspreis je Flasche statt Mittelwert) gemeinsam. |
| 4.2 | **Mobile Pocket-Zuordnung.** „Verschieben nach…" als Aktion an Karte und Detail; Drag-&-Drop bleibt als Desktop-Komfort. Behebt, dass die Kernaktion im Keller auf dem Handy heute unmöglich ist. |
| 4.3 | **Bottom-Navigation für Mobil** (Keller · Hinzufügen · Genussplan · Historie) statt Hamburger-only. |
| 4.4 | **Pocket-Ansicht mit Belegung** — Regale/Fächer als Raster, Flaschen einsortierbar; wenigstens Kapazität und Füllstand je Pocket. |
| 4.5 | **Suche erweitern** um Rebsorte, Land, Appellation und Jahrgang (heute nur Name/Region/Produzent/Unterkeller, `InventoryPage.tsx:302`). |
| 4.6 | **Inventur an das Flaschenmodell anschließen:** Zählen je Pocket statt über die Gesamtliste, Korrekturen mit Begründung, Zwischenstand überlebt Navigation. |

**Fertig, wenn:** Man kann auf dem Handy eine Flasche von „Regal A" nach „Regal C" verschieben, sieht Einstandspreis und Kaufdatum je Flasche, und die Inventur läuft pocketweise.

**Behebt:** B12, B13 (Teil), B17, B18, B19 (Teil)

---

### Phase 5 — Mitdenken statt verwalten (≈ 2 Wochen)

*Ziel: Leitsatz 4. Die App sagt, was jetzt dran ist — und man kann es sofort tun.*

| # | Arbeitspaket |
| --- | --- |
| 5.1 | **Genussplan an den Keller anschließen.** „Konsumiert" öffnet den Flasche-öffnen-Dialog aus 3.1 (Bestand runter, Event, Notiz, Anlass verknüpft). `bottles_reserved` prüft gegen echten Bestand und markiert Überbuchungen. |
| 5.2 | **Zeitachse neu bauen:** nach Reifefenster gruppiert statt eine Zeile je Wein, mit Peak-Markierung, Filter, anklickbaren Balken, virtualisiert. |
| 5.3 | **Handlungsfähige Empfehlungen.** Jede Dashboard-Empfehlung bekommt „Jetzt öffnen" (→ 3.1) und „Für Anlass einplanen" direkt an der Zeile. |
| 5.4 | **Wertverlauf.** Tabelle `wine_price_history`; jede Marktpreisänderung (manuell oder per KI) wird als Punkt geschrieben, das Detail zeigt eine kleine Verlaufskurve. Erst damit trägt der „Investment"-Anspruch. |
| 5.5 | **Eine Dublettenlogik** — die Dashboard-Sonderlogik durch `findLikelyDuplicates` ersetzen, mit „Zusammenführen"-Aktion statt bloßer Warnung. |
| 5.6 | **Nachkauf-Vorschläge** aus der eigenen Historie: mehrfach gekauft, hoch bewertet, Bestand ≤ 1 → auf die Wunschliste vorschlagen. |

**Fertig, wenn:** Vom Dashboard aus ist jede Empfehlung in einem Klick ausführbar, und ein im Genussplan getrunkener Wein verschwindet aus dem Bestand.

**Behebt:** B3, B9, B13, B19

---

### Phase 6 — Vertrauen und Politur (≈ 1–2 Wochen)

*Ziel: Leitsatz 5. Man gibt der App eine über Jahre gewachsene Sammlung mit ruhigem Gewissen.*

| # | Arbeitspaket |
| --- | --- |
| 6.1 | **Export & Backup:** CSV und vollständiges JSON (Weine, Flaschen, Notizen, Events) in den Einstellungen. |
| 6.2 | **Bild-URLs reparieren.** Nicht die Signed URL speichern, sondern den Storage-Pfad; die URL beim Anzeigen erzeugen. Beseitigt das stille Ablaufen nach einem Jahr. Bestehende Einträge per Migration auf Pfade zurückführen. |
| 6.3 | **Toast-System global.** Den vorhandenen `InlineToast` zu einem App-weiten Provider heben und alle 33 `alert()`/`confirm()`-Aufrufe ersetzen; Löschungen mit „Rückgängig"-Toast statt Bestätigungsdialog. |
| 6.4 | **Einstellungen für Sammler.** Modellwahl als „Schnell / Ausgewogen / Gründlich", keine Terminalbefehle, keine `.env`-Pfade; Modellkatalog nur noch aus einer Quelle (Server). |
| 6.5 | **Sprache und Ton vereinheitlichen** — durchgängig „du" oder „Sie", Bankmetaphern raus („Pockets/Unterkonten" → „Regale/Fächer", „flüssige Assets" → „Sammlung"). |
| 6.6 | **Barrierefreiheit:** Fokus-Trap für alle Dialoge, `aria-live` für Status, Mindestschriftgrößen statt 10-px-Versalien als Standardbeschriftung. |
| 6.7 | **Fehlerüberwachung** (z. B. Sentry) für Client und API, plus strukturierte Server-Logs. |

**Behebt:** B15, B16, B21, B22, B23, B24, B27

---

### Querschnitt: technische Hygiene (nebenher, nicht als eigene Phase)

Diese Punkte werden **in** den Phasen erledigt, an denen die jeweilige Datei ohnehin angefasst wird — ein separates Refactoring-Projekt lohnt hier nicht:

- **B25 (Dateigrößen):** Phase 2 zerlegt `WineDetailPage.tsx` beim Herausziehen des `WineForm`; Phase 5 zerlegt `EnjoymentPlanPage.tsx`. `storage.legacy.ts` wird beim RPC-Umbau (3.3) und beim Flaschenmodell (4.1) schrittweise in die vorhandenen Repositories geleert — deren Hüllen bekommen dann echten Inhalt.
- **B26 (KI-Cache):** Sobald 1.1 auf Serverless steht, ist der Prozess-Cache wertlos → in Supabase persistieren (die Migration dafür wurde entfernt, muss neu angelegt werden).
- **B28 (Tests):** Jede Phase liefert einen Playwright-Test für ihren Kernweg (Erfassen, Öffnen, Verschieben, Planen). Ziel ist nicht Abdeckungsquote, sondern dass die vier Wege, die man täglich benutzt, nicht still kaputtgehen.

---

## 3. Was bewusst nicht gebaut wird

Damit der Plan nicht ausufert, explizit ausgeschlossen:

- **Mehrbenutzerfähigkeit, Teilen, Social.** Es ist *ein* Keller. Kein Rollen- oder Freigabemodell.
- **Handelsintegration / Preis-Feeds.** Marktwert bleibt manuell oder KI-recherchiert; keine Wine-Searcher-Anbindung.
- **Native Apps.** Die PWA ist der richtige Weg; die Investition gehört in Mobil-UX (Phase 4), nicht in ein zweites Frontend.
- **Weitere KI-Provider.** OpenRouter deckt alle Modellfamilien ab. Die offene Frage ist Qualität und Erreichbarkeit (Phase 1), nicht Auswahl.
- **Automatische Trinkfenster-Neuberechnung im Hintergrund.** Das Modell ist da; es soll sichtbar und nachvollziehbar bleiben, nicht unsichtbar Daten überschreiben.

---

## 4. Woran sich Erfolg messen lässt

Die bisherigen Leitmetriken (`ROADMAP_90D.md`) messen Datenqualität der KI-Recherche. Das ist richtig, aber unvollständig — sie messen nicht, ob die App gut zu benutzen ist. Ergänzend:

| Metrik | Heute | Ziel |
| --- | --- | --- |
| Zeit vom Tippen auf „Hinzufügen" bis Wein im Keller (Handy) | nicht messbar, Weg gebrochen | < 30 s |
| Anteil Weine mit mindestens einer Verkostungsnotiz | 0 % (technisch unmöglich) | > 50 % der geöffneten Flaschen |
| Bestandsabweichungen bei der Inventur | unbekannt | < 2 % der Flaschen |
| Widersprüche zwischen Listen- und Detailstatus | systematisch (zwei Modelle) | 0 |
| KI-Funktionen im Deployment nutzbar | nein | ja |
| Kernwege durch E2E-Tests abgedeckt | 0 von 4 | 4 von 4 |

---

## 5. Reihenfolge und Risiko

Die Reihenfolge ist nicht beliebig:

- **Phase 1 vor allem anderen,** weil eine App, die im Deployment KI verspricht und HTML zurückgibt, jedes weitere Feature untergräbt.
- **Phase 3 vor Phase 4,** weil das Flaschenmodell (4.1) auf atomaren Bestandsmutationen (3.3) aufbaut — andersherum migriert man eine Rennbedingung in ein größeres Schema.
- **Phase 2 vor Phase 5,** weil sich Empfehlungen nur lohnen, wenn genügend saubere Weine erfasst sind.

Größte Risiken:

1. **4.1 (Flaschenmodell) ist die einzige nicht triviale Migration.** Absicherung: `wines.quantity` bleibt per Trigger als abgeleiteter Wert bestehen, damit alle bestehenden Ansichten und der Offline-Adapter unverändert weiterlaufen; die Umstellung der Lesepfade erfolgt danach schrittweise.
2. **3.4 (ein Reifemodell) ändert sichtbar Status.** Weine ohne Struktur-Daten können von „Trinkreif" auf „unsicher" springen. Das ist gewollt und ehrlich — es braucht aber einen erklärenden Hinweis in der UI, sonst wirkt es wie ein Fehler.
3. **Phase 6 wird gern verschoben.** Export und Bild-Persistenz sind Vertrauensthemen. Wenn Zeit knapp wird, sollten 6.1 und 6.2 nach vorn gezogen werden, nicht nach hinten.

---

## 6. Kürzestmögliche Fassung

Wenn nur zwei Wochen zur Verfügung stünden, in dieser Reihenfolge:

1. API im Deployment reparieren (1.1/1.2) — sonst ist die halbe App Attrappe.
2. Flasche-öffnen-Dialog mit Notiz und Bewertung (3.1) — die größte fehlende Funktion.
3. Ein Erfassungsformular statt drei Wegen (2.1/2.2) — der häufigste Vorgang.
4. Ein Reifemodell (3.4) und einheitliche Kategorien (1.3) — damit die App sich nicht selbst widerspricht.
5. Export (6.1) — damit die Sammlung dem Nutzer gehört.
