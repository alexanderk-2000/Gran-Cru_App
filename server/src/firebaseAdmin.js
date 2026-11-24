import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Inside Cloud Functions the project is discovered automatically
// (FIREBASE_CONFIG / GCLOUD_PROJECT). For local `npm run server` set
// FIREBASE_PROJECT_ID in server/.env (and FIREBASE_AUTH_EMULATOR_HOST when
// running against the emulator suite).
const resolveProjectId = () =>
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  (() => {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '';
    } catch {
      return '';
    }
  })();

export const isFirebaseAdminConfigured = () => Boolean(resolveProjectId());

const ensureApp = () => {
  if (getApps().length === 0) {
    const projectId = resolveProjectId();
    initializeApp(projectId ? { projectId } : undefined);
  }
};

export const verifyFirebaseIdToken = async (token) => {
  ensureApp();
  return getAuth().verifyIdToken(token);
};
