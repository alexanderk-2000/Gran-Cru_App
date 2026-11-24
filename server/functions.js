// Cloud Functions entry point (firebase.json → functions.source = "server").
// Firebase Hosting rewrites /api/** to this function, so the Express routes
// keep their /api/... paths and the browser calls them same-origin.
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

// Region must match Firestore/Storage (us-central1 = inside the free tier).
setGlobalOptions({ region: 'us-central1', maxInstances: 2 });

// Set once with: firebase functions:secrets:set OPENROUTER_API_KEY
const openrouterApiKey = defineSecret('OPENROUTER_API_KEY');

let appPromise = null;
const loadApp = () => {
  // app.js reads process.env.OPENROUTER_API_KEY at import time; secrets are
  // only populated at runtime, so import lazily on the first request.
  appPromise ??= import('./src/app.js').then((module) => module.app);
  return appPromise;
};

export const api = onRequest(
  {
    secrets: [openrouterApiKey],
    timeoutSeconds: 120,
    memory: '512MiB'
  },
  async (req, res) => {
    const app = await loadApp();
    return app(req, res);
  }
);
