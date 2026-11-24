import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, connectFirestoreEmulator, getDocs, getFirestore } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const idx = trimmed.indexOf('=');
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
};

const loadEnvFiles = async () => {
  const files = [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')];
  for (const envFile of files) {
    try {
      const raw = await fs.readFile(envFile, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        if (!process.env[parsed.key]) process.env[parsed.key] = parsed.value;
      }
    } catch {
      // File optional; skip.
    }
  }
};

const normalizeDomain = (url) => {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const getPath = (obj, dotPath) => {
  if (!obj || !dotPath) return undefined;
  return dotPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const isFilled = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const createFirebaseClient = () => {
  const useEmulator = process.env.VITE_FIREBASE_USE_EMULATOR === 'true';
  const apiKey = process.env.VITE_FIREBASE_API_KEY || (useEmulator ? 'demo-api-key' : '');
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || (useEmulator ? 'demo-gran-cru' : '');
  if (!apiKey || !projectId) {
    throw new Error('Missing VITE_FIREBASE_API_KEY or VITE_FIREBASE_PROJECT_ID in .env.local');
  }
  const app = initializeApp({ apiKey, projectId, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN }, `baseline-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { auth, db };
};

const authenticate = async (client) => {
  const email = process.env.BASELINE_USER_EMAIL || process.env.E2E_EMAIL;
  const password = process.env.BASELINE_USER_PASSWORD || process.env.E2E_PASSWORD;

  if (email && password) {
    try {
      await signInWithEmailAndPassword(client.auth, email, password);
    } catch (error) {
      throw new Error(`Sign-in failed for BASELINE_USER_EMAIL: ${error.message}`);
    }
    return 'password';
  }

  try {
    await signInAnonymously(client.auth);
  } catch (error) {
    throw new Error(
      `Anonymous sign-in failed (${error.message}). Set BASELINE_USER_EMAIL and BASELINE_USER_PASSWORD in .env.local.`
    );
  }
  return 'anonymous';
};

const fetchActiveWines = async (client) => {
  const uid = client.auth.currentUser?.uid;
  if (!uid) throw new Error('Failed to fetch wines: not signed in');
  try {
    const snapshot = await getDocs(collection(client.db, 'users', uid, 'wines'));
    return snapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }))
      .filter((wine) => !wine.deleted_at)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  } catch (error) {
    throw new Error(`Failed to fetch wines: ${error.message}`);
  }
};

const writeReport = async (filename, payload) => {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const fullPath = path.join(REPORTS_DIR, filename);
  await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), 'utf8');
  return fullPath;
};

export {
  ROOT,
  REPORTS_DIR,
  loadEnvFiles,
  normalizeDomain,
  getPath,
  isFilled,
  createFirebaseClient,
  authenticate,
  fetchActiveWines,
  writeReport
};
