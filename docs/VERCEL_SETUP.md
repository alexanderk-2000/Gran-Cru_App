# Vercel Deployment Setup

Das Deployment besteht aus zwei Teilen: dem statischen Frontend (`dist/`) und der
API-Funktion (`api/index.js`), die dieselbe Express-App bereitstellt wie `npm run server`
lokal.

## 1. Umgebungsvariablen

In den Vercel-Projekteinstellungen (Settings → Environment Variables) setzen:

### Frontend (Build-Zeit, `VITE_`-Präfix nötig)

| Key | Wert |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase-Projekt-URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key |

Ohne diese beiden startet die App mit dem Hinweisbildschirm „Konfiguration fehlt".

### API-Funktion (Laufzeit, **ohne** `VITE_`-Präfix)

| Key | Wert | Wofür |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter API Key | Recherche, Etikett-Scan, Anlass-Vorschläge |
| `SUPABASE_URL` | dieselbe Projekt-URL | Session-Prüfung vor jedem KI-Aufruf |
| `SUPABASE_ANON_KEY` | derselbe Anon Key | Session-Prüfung vor jedem KI-Aufruf |

Optional:

| Key | Standard | Wirkung |
| --- | --- | --- |
| `AI_RATE_LIMIT_MAX_REQUESTS` | `30` | KI-Anfragen pro Fenster und Nutzer |
| `AI_RATE_LIMIT_WINDOW_MS` | `300000` | Länge des Fensters |
| `REQUEST_TIMEOUT` | `55000` auf Vercel | Muss unter `maxDuration` bleiben (60 s, siehe `vercel.json`) |
| `CORS_ORIGINS` | localhost:3000 | Nur für getrennte Origins relevant; im Deployment teilen sich SPA und API eine Origin |

Fehlen `SUPABASE_URL`/`SUPABASE_ANON_KEY`, antworten die KI-Endpunkte bewusst mit
500 „Server auth not configured" — ohne Session-Prüfung würde jeder Aufruf
kostenpflichtige Provider-Anfragen auslösen.

## 2. Routing

`vercel.json` leitet in dieser Reihenfolge:

1. `/api/(.*)` → die Serverless-Funktion `api/index.js`
2. `/(.*)` → `/index.html` (Client-seitiges Routing der SPA)

Die Reihenfolge ist wesentlich. Vorher fehlte die erste Regel, wodurch `/api/ai/search`
mit dem HTML der SPA (Status 200) beantwortet wurde: Der Client scheiterte an
`response.json()`, und `/api/health` meldete aus demselben Grund fälschlich einen
laufenden Server.

## 3. Prüfen, ob es funktioniert

Nach dem Deployment:

```bash
curl -s https://<deployment>/api/health
```

Erwartet wird JSON wie `{"status":"ok","timestamp":"…","openrouter":true}`.
Kommt HTML zurück, greift das Routing nicht; steht dort `"openrouter":false`,
fehlt der Schlüssel. Beides zeigt die App auch unter Einstellungen → API Server Status an.

## 4. Redeploy

Nach dem Ändern von Umgebungsvariablen ist ein **Redeploy** nötig — Frontend-Variablen
werden zur Build-Zeit eingesetzt.
