import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  type Auth,
  type User
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  type Firestore
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Read a build-time environment variable. Vite inlines `import.meta.env.*`;
 * `process.env` is the fallback for vitest/node.
 */
const getEnv = (key: string): string => {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (metaEnv && metaEnv[key]) return metaEnv[key] || '';
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || '';
    }
  } catch {
    // Ignore errors
  }
  return '';
};

const useEmulator = getEnv('VITE_FIREBASE_USE_EMULATOR') === 'true';

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || (useEmulator ? 'demo-api-key' : ''),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || (useEmulator ? 'demo-gran-cru' : ''),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

if (!useEmulator && (!firebaseConfig.apiKey || !firebaseConfig.projectId)) {
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  console.error(
    `❌ Missing required Firebase configuration!\n\n` +
    `Missing variables: ${missing.join(', ')}\n\n` +
    `Please set these variables in .env.local (see docs/FIREBASE_SETUP.md).`
  );
}

export const isConfigured = useEmulator || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Initialize with placeholders when unconfigured so imports never crash;
// every network call then fails cleanly instead of a blank screen.
export const firebaseApp: FirebaseApp = initializeApp({
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey || 'missing-api-key',
  projectId: firebaseConfig.projectId || 'missing-project-id'
});

export const auth: Auth = getAuth(firebaseApp);
// ignoreUndefinedProperties: the app's payloads routinely carry optional
// fields as `undefined` (they were simply omitted by PostgREST before).
export const db: Firestore = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true });
export const storage: FirebaseStorage = getStorage(firebaseApp);

if (useEmulator) {
  const host = getEnv('VITE_FIREBASE_EMULATOR_HOST') || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}

/**
 * Firebase restores a persisted session asynchronously on page load;
 * `auth.currentUser` is null until that first resolution. Every caller that
 * needs "who is logged in" goes through this so it never races the restore.
 * Works offline (reads the locally persisted session).
 */
let authReady: Promise<void> | null = null;
export const waitForAuth = async (): Promise<User | null> => {
  if (!authReady) {
    authReady = new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }
  await authReady;
  return auth.currentUser;
};

export const getCurrentUid = async (): Promise<string | null> => (await waitForAuth())?.uid ?? null;

export const requireUid = async (): Promise<string> => {
  const uid = await getCurrentUid();
  if (!uid) throw new Error('Nicht eingeloggt.');
  return uid;
};

/**
 * Current Firebase ID token, if any - used to authenticate requests to the
 * backend's /api/ai/* routes. Anonymous (demo) users have tokens too.
 */
export const getAccessToken = async (): Promise<string | null> => {
  const user = await waitForAuth();
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
};
