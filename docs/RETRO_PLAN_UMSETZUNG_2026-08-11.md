# Retro: Umsetzung Phase 1, 2 und 3.1/3.2/3.4 (2026-08-11)

Loop: den Plan aus `PLAN_GUTE_WEIN_APP.md` abarbeiten — API im Deployment, ein Erfassungsweg,
Flasche-öffnen-Dialog, ein Reifemodell.

## Was gut funktioniert hat

- **Der Befundteil des Plans war die Arbeitsliste.** Jede Änderung hatte eine Befund-ID (B1, B4, …)
  mit Datei und Zeile. Dadurch gab es keine Suchphase vor dem Umbau, und die Commit-Nachrichten
  konnten den *Grund* statt nur die Änderung nennen. Der Aufwand für den nummerierten Befund hat
  sich schon in der ersten Umsetzungsstunde amortisiert.
- **Refactoring hat neue Fehler mitgeliefert.** Zwei der wertvollsten Funde tauchten erst beim
  Anfassen auf: `addTasting` rief intern `adjustStock(-1)` auf und überschrieb ein übergebenes
  Datum (eine Notiz kostete zwingend eine Flasche, verbucht als „adjustment", also unsichtbar in
  der Trinkhistorie); und das Weindetail meldete Nachkauf, Bearbeiten und Löschen nie an die
  Kellerliste zurück. Beides stand in keinem Audit — es fiel auf, weil eine Funktion tatsächlich
  benutzt wurde statt nur gelesen.
- **Der Compiler als Vollständigkeitsprüfer.** `WineStatus.UNKNOWN` einzuführen und dann
  `tsc --noEmit` laufen zu lassen hat exakt die eine Stelle gezeigt, die alle Fälle behandeln
  musste (`getStatusBadge`). Ein neuer Enum-Wert ist ein billiger Weg, „wo überall wird das
  eigentlich verzweigt?" beantwortet zu bekommen.
- **Abhängigkeiten dorthin verschieben, wo sie gebraucht werden, löst mehrere Probleme auf einmal.**
  `express`/`cors`/`dotenv`/`openai` ins Root-`package.json` zu ziehen war für die Vercel-Function
  nötig — und ließ nebenbei `tests/unit/server.routes.test.ts` lokal laufen, das vorher ohne
  `npm ci --prefix server` immer fehlschlug.
- **Ersetzen statt danebenstellen.** `ScanResultDialog` zu löschen, statt den neuen Dialog
  zusätzlich zu bauen, war der Punkt, an dem aus „drei Erfassungswege" wirklich einer wurde. Der
  Scan setzt jetzt nur noch Startwerte für dasselbe Formular.

## Was nicht gut funktioniert hat

- **Große JSX-Blöcke mit `Edit` zu bearbeiten war unzuverlässig.** Beim Ausbau des alten
  Prompt-Modals aus `InventoryPage.tsx` haben mehrere `Edit`-Aufrufe an Einrückung und
  Sonderzeichen gescheitert. Erst der Wechsel auf ein Python-Skript mit `s.index(...)`-Slicing über
  Anfangs- und Endmarke lief zuverlässig. Für Blöcke über ~30 Zeilen sollte das der erste Griff
  sein, nicht der dritte.
- **Zwischenzustände beim Statehauling.** Das Entfernen der Prompt-States lief den Codeänderungen
  voraus, sodass zwischendurch vier Typfehler auf nicht mehr existierende Setter zeigten. Ärgerlich
  war nicht der Fehler, sondern dass er in zwei Runden auftrat: erst die States, dann das JSX, dann
  der Import-Handler. Besser wäre gewesen, alle Fundstellen eines Zustands *vorher* mit einem
  `grep` zu sammeln und in einem Durchgang zu ändern.
- **Testlabels zu früh spezifisch gewählt.** `getByLabelText(/^Flaschen/)` traf auch
  „Flaschengröße" — ein Fehlschlag, der eine volle Testrunde gekostet hat. Bei Formularen mit
  vielen ähnlichen Feldern lohnt es sich, die Query von Anfang an am vollständigen Label zu
  verankern.
- **Der Live-Nachweis für den wichtigsten Fund fehlt weiterhin.** Dass `/api/*` im Deployment
  ins Leere lief, ist aus Konfiguration und Code belegt, aber die Vercel-Preview ist
  SSO-geschützt — ein `curl` gegen die Preview liefert nur einen 302. Die Reparatur ist damit
  bislang nur lokal und durch Tests abgesichert, nicht am laufenden Deployment. Beim nächsten Mal
  früher fragen, ob eine ungeschützte Preview-URL verfügbar ist.
