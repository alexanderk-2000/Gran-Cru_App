import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

const createSupabaseClient = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  }
  return createClient(url, anon, { auth: { persistSession: false } });
};

const authenticate = async (supabase) => {
  const email = process.env.BASELINE_USER_EMAIL || process.env.E2E_EMAIL;
  const password = process.env.BASELINE_USER_PASSWORD || process.env.E2E_PASSWORD;

  if (email && password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Sign-in failed for BASELINE_USER_EMAIL: ${error.message}`);
    return 'password';
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      `Anonymous sign-in failed (${error.message}). Set BASELINE_USER_EMAIL and BASELINE_USER_PASSWORD in .env.local.`
    );
  }
  return 'anonymous';
};

const fetchActiveWines = async (supabase) => {
  const { data, error } = await supabase
    .from('wines')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch wines: ${error.message}`);
  return data || [];
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
  createSupabaseClient,
  authenticate,
  fetchActiveWines,
  writeReport
};
