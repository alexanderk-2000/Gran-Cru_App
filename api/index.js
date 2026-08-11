// Vercel Serverless Function: mounts the same Express app that `npm run server`
// runs locally.
//
// Without this file the deployed app had no backend at all: vercel.json
// rewrote *every* path to /index.html, so `/api/ai/search` answered with the
// SPA's HTML at status 200. The client then failed in `response.json()` with
// "Unexpected token '<'", and `/api/health` looked healthy for the same wrong
// reason - the Settings screen reported "API-Server online" while no server
// existed. Every AI feature (scan enrichment, wine research, occasion
// assignment) was therefore dead in production while working locally through
// the Vite dev proxy.
//
// Vercel routes `/api/*` here via the rewrite in vercel.json and passes the
// original request path, which is why the app's own `/api/...` route
// definitions keep matching unchanged.
export { app as default } from '../server/src/app.js';
