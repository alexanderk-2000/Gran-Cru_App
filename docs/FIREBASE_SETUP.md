# Firebase einrichten (einmalig)

Die App läuft komplett auf Firebase:

- **Hosting** für das Frontend
- **Authentication** für E-Mail-Login und Demo-Modus
- **Firestore** für die Daten
- **Cloud Storage** für die Weinfotos
- eine **Cloud Function** `api` für die KI-Funktionen

Alles liegt in der Region **`us-central1`**, weil dort die Freikontingente gelten.

Du brauchst Node.js 20+ und einen Google-Account. Die Firebase-CLI ist als Dev-Abhängigkeit im Projekt enthalten. Alle Befehle laufen im Repo-Ordner über `npx firebase …`.

## Kosten bei 1–2 Nutzungen im Monat

| Dienst | Freikontingent | Erwartete Nutzung |
|---|---|---|
| Hosting | 10 GB Speicher, 360 MB Traffic pro Tag | wenige MB |
| Authentication (E-Mail und anonym) | 50.000 aktive Nutzer pro Monat | 1 |
| Firestore | 1 GiB, 50.000 Lese- und 20.000 Schreibzugriffe pro Tag | einige Hundert pro Besuch |
| Cloud Storage (nur US-Regionen) | 5 GB | etwa 100 MB bei 500 Fotos |
| Cloud Functions | 2 Mio. Aufrufe pro Monat | einige Dutzend |
| Secret Manager | 6 Secret-Versionen, 10.000 Zugriffe pro Monat | 1 Secret |

**Für Cloud Storage und Cloud Functions brauchst du den Blaze-Tarif.** Dafür musst du eine Kreditkarte hinterlegen. Abgerechnet wird nur, was über den Freikontingenten liegt. Die KI-Kosten bei OpenRouter laufen wie bisher getrennt über dein OpenRouter-Konto.

## 1. Projekt anlegen

1. Unter <https://console.firebase.google.com> auf **Projekt hinzufügen** klicken, z. B. mit dem Namen `gran-cru`. Google Analytics brauchst du nicht.
2. Links unten **Upgrade** wählen und auf **Blaze** umstellen.
3. Direkt danach ein Budget setzen: **Google Cloud Console → Abrechnung → Budgets & Benachrichtigungen → Budget erstellen**, z. B. 1 € mit E-Mail-Warnung bei 50 %, 90 % und 100 %.

## 2. Dienste aktivieren

1. **Authentication → Jetzt starten → Anmeldemethoden:** `E-Mail/Passwort` und `Anonym` aktivieren. Anonym wird für den Demo-Modus gebraucht.
2. **Firestore Database → Datenbank erstellen:** Standort **`us-central1 (Iowa)`**, Modus „Produktion“. Die echten Regeln kommen beim Deployment.
3. **Storage → Jetzt starten:** Standort **`US-CENTRAL1`**.

   > Der Standort lässt sich später nicht mehr ändern. Nur US-Regionen haben die 5 GB gratis.

## 3. Web-App registrieren und `.env.local` füllen

1. **Projekteinstellungen → Allgemein → Meine Apps → Web (`</>`)**, z. B. mit dem Namen `gran-cru-web`. Firebase Hosting musst du hier nicht ankreuzen.
2. Die angezeigten Werte in `.env.local` im Repo-Ordner eintragen (Vorlage: `.env.example`):

   ```bash
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<projekt-id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<projekt-id>
   VITE_FIREBASE_STORAGE_BUCKET=<projekt-id>.firebasestorage.app
   VITE_FIREBASE_APP_ID=...
   ```

   Diese Werte sind öffentlich und landen im ausgelieferten JavaScript. Geschützt werden die Daten über `firestore.rules` und `storage.rules`.

## 4. CLI verbinden und OpenRouter-Key hinterlegen

```bash
npx firebase login
```

```bash
npx firebase use --add
```

Bei `use --add` das Projekt auswählen und als Alias `default` vergeben.

```bash
npx firebase functions:secrets:set OPENROUTER_API_KEY
```

Hier den Key von <https://openrouter.ai/keys> einfügen. Er wird im Secret Manager gespeichert, nicht im Code.

> Falls es noch eine alte `server/.env` gibt, benenne sie in `server/.env.local` um und entferne die `SUPABASE_*`-Zeilen. Die Firebase-CLI liest `server/.env` beim Deployment als Konfiguration der Function ein. Ein `OPENROUTER_API_KEY` darin kollidiert mit dem Secret und lässt das Deployment abbrechen.

## 5. Deployen

```bash
npm run deploy
```

Das baut das Frontend und deployt Hosting, die Function `api`, die Firestore- und Storage-Regeln sowie die Indizes.

- Beim ersten Mal fragt die CLI, wie lange alte Container-Images aufbewahrt werden sollen. Wähle **1 Tag**, damit kein Speicher anfällt.
- Danach läuft die App unter `https://<projekt-id>.web.app`.
- Firebase Hosting leitet `/api/**` an die Function weiter. Dabei gilt ein Zeitlimit von 60 Sekunden pro KI-Anfrage.

## 6. Bestehende Daten aus Supabase übernehmen (optional)

Das Skript `npm run migrate:supabase` kopiert Weine, Bestandsbuchungen, Anlässe, Termine, Weinpool, Verkostungen, Pockets, Einstellungen und Weinfotos eines Supabase-Nutzers zu einem Firebase-Nutzer. Die IDs bleiben dabei erhalten. Du kannst das Skript also gefahrlos mehrfach ausführen, es entstehen keine Duplikate.

1. **Supabase-Projekt aufwecken:** Kostenlose Projekte pausieren nach etwa einer Woche ohne Nutzung. Im Supabase-Dashboard das Projekt öffnen und **Restore project** klicken.
2. **In der neuen App einmal registrieren** (`https://<projekt-id>.web.app`). Am einfachsten mit derselben E-Mail-Adresse wie bei Supabase.
3. **Zugang für das Skript zu Firebase:**

   ```bash
   gcloud auth application-default login
   ```

   Ohne `gcloud` geht es auch so: Unter **Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren** eine Schlüsseldatei herunterladen und `GOOGLE_APPLICATION_CREDENTIALS=/pfad/zur/datei.json` setzen. Die Datei nicht ins Repo legen und nach dem Umzug löschen.
4. **Probelauf.** Er zeigt nur an, was kopiert würde:

   ```bash
   SUPABASE_URL=https://<supabase-ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
   SUPABASE_USER_EMAIL=du@example.com \
   FIREBASE_PROJECT_ID=<projekt-id> \
   FIREBASE_STORAGE_BUCKET=<projekt-id>.firebasestorage.app \
   FIREBASE_USER_EMAIL=du@example.com \
   npm run migrate:supabase -- --dry-run
   ```

   Den Service-Role-Key findest du in Supabase unter **Project Settings → API**. Er hat Vollzugriff, also nur lokal verwenden und nirgends speichern.
5. **Echter Lauf:** denselben Befehl ohne `--dry-run` ausführen. Mit `--skip-images` lassen sich die Fotos überspringen.
6. **In der App ab- und wieder anmelden,** damit der Offline-Speicher neu geladen wird.

## 7. Aufräumen

Wenn in Firebase alles da ist:

- **Vercel:** Das Projekt unter Vercel → Settings → Advanced trennen oder löschen. `vercel.json` ist aus dem Repo entfernt.
- **Supabase:** Das Projekt „Gran Cru AG“ pausieren oder löschen. Exportiere vorher bei Bedarf noch ein Backup.

## Lokale Entwicklung ohne Firebase-Projekt

Mit den Emulatoren läuft alles auf deinem Rechner. Dafür brauchst du Java 11+.

```bash
npm run emulators
```

In einem zweiten Terminal:

```bash
VITE_FIREBASE_USE_EMULATOR=true npm run dev
```

Für die KI-Funktionen zusätzlich `server/.env.local` aus `server/.env.example` anlegen. Darin `FIREBASE_PROJECT_ID=demo-gran-cru` und `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` setzen und dann `npm run server` starten.

Tests gegen die Emulatoren, also Sicherheitsregeln und die komplette Datenschicht:

```bash
npm run test:emulator
```
