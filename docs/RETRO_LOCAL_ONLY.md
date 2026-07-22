# Retro: Lokaler Betrieb ohne externe KI-API

## Was gut funktioniert hat

- Zuerst wurden alle erreichbaren `/api/ai/*`-Aufrufe gesucht. Dadurch konnten Katalogsuche,
  Scanner, Anlasszuordnung, Offline-Queue und Server-Routen als zusammenhängender Pfad entfernt
  statt nur oberflächlich in der UI versteckt werden.
- Die vorhandene Offline Rule Engine und der lokale Weinkatalog boten einen klaren Ersatz für
  Recherche und Anlasszuordnung, ohne eine zweite fachliche Logik einzuführen.
- Negative Server-Tests sichern jetzt explizit ab, dass die früheren KI-Endpunkte nicht mehr
  angeboten werden.

## Was nicht gut funktioniert hat

- Der erste Umbau ließ zunächst tote Provider-Einstellungen und eine nicht mehr erreichbare
  AI-Queue zurück. Ein repositoryweiter Text- und Referenzscan war nötig, um diese Reste zu finden.
- Die bisherigen Scanner-Tests prüften ausschließlich den externen Vision-Endpunkt. Sie mussten
  durch einen Datenschutz-orientierten Test ersetzt werden, der sicherstellt, dass der lokale
  Barcodepfad keinen Netzwerkrequest auslöst.
- Alte Datenbankschemata enthalten weiterhin historische Provider-Spalten. Sie werden nicht mehr
  verwendet, können aber erst mit einer separaten, rückwärtskompatiblen Migration entfernt werden.
