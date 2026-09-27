# Retro: Phase 6.6 (Barrierefreiheit) + Plandoc-Reparatur (2026-09-27)

Loop: auf „Analysiere und optimiere die App weiter" hin den nächsten offenen Plan-Punkt auswählen
und umsetzen — gelandet bei 6.6 (Fokus-Trap für alle Dialoge, `aria-live` für Status), plus eine
nebenbei gefundene Beschädigung im Plandokument selbst.

## Was gut funktioniert hat

- **Eine funktionierende Referenzimplementierung spart die Design-Phase komplett.** Der
  Weindetail-Dialog hatte schon einen vollständigen, getesteten Fokus-Trap (Anfangsfokus,
  Tab-Wrap, Escape). Die Aufgabe war nicht „wie baut man das", sondern „extrahieren und
  wiederverwenden" — `hooks/useFocusTrap.ts` ist fast wörtlich der alte Code, nur ohne die
  Kopplung an den einen Dialog. Das reduziert auch das Risiko: die Logik war schon in Produktion
  bewährt, nicht neu erfunden.
- **`grep -rl "fixed inset-0"` als vollständige Bestandsaufnahme.** Statt Dialog für Dialog zu
  suchen, lieferte ein einziger Grep über `components/` und `features/` alle neun Stellen mit
  modalem Overlay auf einen Schlag, inklusive zwei (`PurchaseDialog.tsx`, die beiden Modals in
  `InventoryPage.tsx`), die nicht einmal `role="dialog"`/`aria-modal` hatten — die wären bei einer
  Suche nach „Dialog-Komponenten" vermutlich übersehen worden, weil sie sich selbst nicht wie
  Dialoge deklarierten.
- **Den `Escape`-Handler an vorhandene „busy"-Guards koppeln statt pauschal zu schließen.**
  `MoveToPocketDialog` hatte schon eine Regel „kein Schließen per Hintergrundklick während eine
  Verschiebung läuft" — die gleiche Bedingung für `Escape` zu übernehmen (statt die Hook immer mit
  `onClose` direkt aufzurufen) hat eine neue Race-Condition vermieden, ohne dass ein Test das
  vorher explizit verlangt hätte.
- **Der volle Gate-Lauf (typecheck/lint/test/build/playwright --list) hat einen echten Fehler
  gefangen:** Nach dem Herausziehen der Fokus-Trap-Logik aus `WineDetailPage.tsx` blieb `useRef`
  im Import stehen, obwohl es nur noch für die entfernte Logik gebraucht wurde — `tsc --noEmit`
  meldete das sofort als unbenutzt. Ein zweiter, unabhängiger `useRef`-Aufruf in derselben Datei
  (für die Tab-Navigation) hätte das bei reinem Ausprobieren im Browser leicht verdeckt.

## Was nicht gut funktioniert hat

- **Das Plandokument hatte sich selbst dupliziert.** Vier identische Kopien der Abschnitte
  „Umsetzungsnotizen zu 6.5" und „6.2" sowie sechs leere „Umsetzungsnotizen zu 4.2"-Überschriften
  standen hintereinander (Zeilen 280–327) — vermutlich ein Artefakt aus einem früheren
  Kontext-Kompaktierungs- oder Wiederholungslauf, das nie auffiel, weil niemand das Dokument am
  Stück gelesen hat. Für ein Dokument, das laut CLAUDE.md die „autoritative Quelle" für den
  Fortschritt ist, hätte das früher auffallen müssen — ein kurzer `grep -c "^####"` gegen die
  erwartete Anzahl an Arbeitspaketen wäre ein billiger Sanity-Check am Ende jeder Sitzung.
- **Der `Edit`-Tool-Aufruf zum Bereinigen der Duplikate schlug beim ersten Versuch fehl**, obwohl
  der angezeigte Text zeichengenau kopiert wirkte — vermutlich unsichtbare Whitespace- oder
  Anführungszeichen-Abweichungen zwischen dem, was `Read` anzeigt, und dem tatsächlichen Byteinhalt.
  `sed -i '<start>,<end>d'` mit vorher per `grep -n` ermittelten Zeilennummern war zuverlässiger für
  einen großen, mehrfach wiederholten Block — dieselbe Lehre wie in der Retro vom 11.08. schon für
  große JSX-Blöcke festgehalten, jetzt bestätigt für reinen Markdown-Text.
- **Der Container startete ohne installierte Dependencies** (`node_modules` fehlte komplett), was
  erst beim ersten `tsc --noEmit` auffiel. Kein großer Zeitverlust (`npm ci` lief in unter 20s),
  aber es lohnt sich, das als ersten Schritt jeder neuen Sitzung zu prüfen, statt es implizit über
  einen fehlschlagenden Befehl zu entdecken.
