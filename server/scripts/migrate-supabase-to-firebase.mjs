#!/usr/bin/env node
/**
 * One-off data move: Supabase (Postgres + Storage) → Firebase (Firestore + Storage).
 *
 * Copies one Supabase user's cellar into one Firebase user:
 *   wines, inventory_events, occasions, occasion_instances,
 *   occasion_wine_pool, tastings, cellar_pockets, user_settings
 * plus the wine photos, and rebuilds the per-user wine_catalog.
 *
 * Document ids are kept, so the script is idempotent: running it twice
 * overwrites the same documents instead of duplicating them.
 *
 * Usage (from the repo root, see docs/FIREBASE_SETUP.md step 6):
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *   SUPABASE_USER_EMAIL=you@example.com \
 *   FIREBASE_PROJECT_ID=<project id> \
 *   FIREBASE_STORAGE_BUCKET=<project id>.firebasestorage.app \
 *   FIREBASE_USER_EMAIL=you@example.com \
 *   npm run migrate:supabase -- --dry-run
 *
 * Firebase credentials come from Application Default Credentials
 * (`gcloud auth application-default login`) or GOOGLE_APPLICATION_CREDENTIALS.
 * The Firebase user must exist already (sign up once in the new app).
 */
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_IMAGES = process.argv.includes('--skip-images');

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Missing environment variable ${name} (see the header of this script).`);
    process.exit(1);
  }
  return value;
};

const SUPABASE_URL = required('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const FIREBASE_PROJECT_ID = required('FIREBASE_PROJECT_ID');
const FIREBASE_STORAGE_BUCKET = required('FIREBASE_STORAGE_BUCKET');

const supabaseHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const supabaseJson = async (path) => {
  const response = await fetch(`${SUPABASE_URL}${path}`, { headers: supabaseHeaders });
  if (!response.ok) {
    throw new Error(`Supabase ${path} → HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

const resolveSupabaseUserId = async () => {
  if (process.env.SUPABASE_USER_ID) return process.env.SUPABASE_USER_ID;
  const email = required('SUPABASE_USER_EMAIL').toLowerCase();
  for (let page = 1; page < 50; page += 1) {
    const body = await supabaseJson(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = body.users || [];
    const match = users.find((user) => (user.email || '').toLowerCase() === email);
    if (match) return match.id;
    if (users.length < 200) break;
  }
  throw new Error(`No Supabase user with email ${email}.`);
};

const fetchTable = async (table, ownerColumn, ownerId) => {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseJson(
      `/rest/v1/${table}?${ownerColumn}=eq.${ownerId}&select=*&order=created_at.asc&limit=${pageSize}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

// Postgres timestamptz comes back as "2026-02-04T09:51:06.102254+00:00";
// the app compares timestamps as strings, so normalize to JS ISO format.
const TIMESTAMP_FIELDS = ['created_at', 'updated_at', 'deleted_at', 'date'];
const NUMERIC_FIELDS = ['purchase_price', 'market_price', 'alcohol_percent', 'assignment_score'];

const transformRow = (row, sourceUid, targetUid) => {
  const result = { ...row };
  if ('user_id' in result) result.user_id = targetUid;
  if (result.deleted_by === sourceUid) result.deleted_by = targetUid;
  for (const field of TIMESTAMP_FIELDS) {
    if (typeof result[field] === 'string' && result[field]) {
      const parsed = new Date(result[field]);
      if (!Number.isNaN(parsed.getTime())) result[field] = parsed.toISOString();
    }
  }
  for (const field of NUMERIC_FIELDS) {
    if (typeof result[field] === 'string' && result[field].trim() !== '') {
      const parsed = Number(result[field]);
      if (Number.isFinite(parsed)) result[field] = parsed;
    }
  }
  return result;
};

// Same normalization as domain/wine/catalogSearch.ts.
const normalizeCatalogToken = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const trimOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
};

const confidenceToInt = (value) => {
  const normalized = String(value || 'medium').toLowerCase();
  if (normalized === 'high') return 90;
  if (normalized === 'low') return 40;
  return 65;
};

const buildCatalogEntry = (wine) => {
  const nameNorm = normalizeCatalogToken(wine.name);
  if (!nameNorm) return null;
  const producerNorm = normalizeCatalogToken(wine.producer);
  const vintage = Number.isFinite(wine.vintage) ? wine.vintage : null;
  const details = wine.ai_details && typeof wine.ai_details === 'object' ? wine.ai_details : {};
  const vinification = Object.fromEntries(Object.entries({
    ...(details.vinification && typeof details.vinification === 'object' ? details.vinification : {}),
    fermentation_vessel: trimOrNull(wine.fermentation),
    aging_vessel: trimOrNull(wine.aging_process)
  }).filter(([, value]) => value !== null && value !== undefined));
  const canonicalKey = [vintage === null ? 'nv' : String(vintage), producerNorm, nameNorm].filter(Boolean).join('::');
  return {
    canonical_key: canonicalKey,
    name: String(wine.name).trim(),
    producer: trimOrNull(wine.producer),
    vintage,
    region: trimOrNull(wine.region),
    country: trimOrNull(wine.country),
    appellation: trimOrNull(wine.appellation),
    vineyard: trimOrNull(wine.vineyard),
    wine_type: trimOrNull(wine.wine_type),
    grapes: wine.grapes ?? [],
    alcohol_percent: wine.alcohol_percent ?? null,
    drink_start: wine.drink_start ?? null,
    peak_year: wine.peak_year ?? null,
    drink_end: wine.drink_end ?? null,
    aromas: wine.aromas ?? [],
    structure: wine.structure ?? {},
    pairings: wine.pairings ?? [],
    vinification,
    scores: wine.scores ?? [],
    details,
    sources: wine.ai_sources ?? [],
    confidence: confidenceToInt(wine.confidence),
    missing_fields: wine.missing_fields ?? [],
    inferred_fields: [],
    name_norm: nameNorm,
    producer_norm: producerNorm,
    search_norm: [nameNorm, producerNorm, vintage === null ? '' : String(vintage)].filter(Boolean).join(' '),
    updated_at: new Date().toISOString()
  };
};

const IMAGE_SLOTS = ['bottle', 'label', 'case'];

const copyImages = async (wine, sourceUid, targetUid, bucket) => {
  const images = wine.ai_details?.app?.images;
  if (!images || typeof images !== 'object') return 0;
  let copied = 0;
  for (const slot of IMAGE_SLOTS) {
    if (!images[slot]) continue;
    const sourcePath = `${sourceUid}/${wine.id}/${slot}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/wine-images/${sourcePath}`, { headers: supabaseHeaders });
    if (!response.ok) {
      console.warn(`   ⚠️  Bild ${sourcePath} nicht gefunden (HTTP ${response.status}) - Verweis wird entfernt.`);
      delete images[slot];
      continue;
    }
    const contentType = response.headers.get('content-type') || 'image/webp';
    const bytes = Buffer.from(await response.arrayBuffer());
    const targetPath = `users/${targetUid}/wine-images/${wine.id}/${slot}`;
    const token = randomUUID();
    if (!DRY_RUN) {
      await bucket.file(targetPath).save(bytes, {
        contentType,
        metadata: {
          cacheControl: 'private, max-age=31536000',
          metadata: { firebaseStorageDownloadTokens: token }
        }
      });
    }
    images[slot] = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(targetPath)}?alt=media&token=${token}`;
    copied += 1;
  }
  return copied;
};

const main = async () => {
  initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID, storageBucket: FIREBASE_STORAGE_BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const sourceUid = await resolveSupabaseUserId();
  const targetUid = process.env.FIREBASE_UID || (await getAuth().getUserByEmail(required('FIREBASE_USER_EMAIL'))).uid;
  console.log(`${DRY_RUN ? '🔎 Probelauf' : '🚚 Umzug'}: Supabase-User ${sourceUid} → Firebase-User ${targetUid}`);

  const tables = ['wines', 'inventory_events', 'occasions', 'occasion_instances', 'occasion_wine_pool', 'tastings', 'cellar_pockets'];
  const data = {};
  for (const table of tables) {
    try {
      data[table] = (await fetchTable(table, 'user_id', sourceUid)).map((row) => transformRow(row, sourceUid, targetUid));
    } catch (error) {
      if (/42P01|does not exist|Could not find the table/i.test(String(error.message))) {
        console.warn(`   ⚠️  Tabelle ${table} existiert nicht - übersprungen.`);
        data[table] = [];
      } else {
        throw error;
      }
    }
    console.log(`   ${table.padEnd(20)} ${data[table].length}`);
  }
  const settingsRows = await supabaseJson(`/rest/v1/user_settings?user_id=eq.${sourceUid}&select=*`).catch(() => []);
  const settings = settingsRows[0] ? transformRow(settingsRows[0], sourceUid, targetUid) : null;
  console.log(`   ${'user_settings'.padEnd(20)} ${settings ? 1 : 0}`);

  let imageCount = 0;
  if (!SKIP_IMAGES) {
    for (const wine of data.wines) imageCount += await copyImages(wine, sourceUid, targetUid, bucket);
    console.log(`   ${'Fotos'.padEnd(20)} ${imageCount}`);
  }

  const catalog = new Map();
  for (const wine of data.wines) {
    const entry = buildCatalogEntry(wine);
    if (entry) catalog.set(entry.canonical_key.replace(/\//g, '_'), entry);
  }
  console.log(`   ${'wine_catalog'.padEnd(20)} ${catalog.size}`);

  if (DRY_RUN) {
    console.log('\nProbelauf beendet - nichts wurde geschrieben. Ohne --dry-run erneut starten, um zu kopieren.');
    return;
  }

  const writer = db.bulkWriter();
  const userRef = db.collection('users').doc(targetUid);
  for (const table of tables) {
    for (const row of data[table]) writer.set(userRef.collection(table).doc(String(row.id)), row);
  }
  for (const [id, entry] of catalog) writer.set(userRef.collection('wine_catalog').doc(id), entry);
  if (settings) writer.set(userRef, { ...settings, user_id: targetUid }, { merge: true });
  await writer.close();

  console.log('\n✅ Fertig. Melde dich in der App neu an, damit der Offline-Speicher neu geladen wird.');
};

main().catch((error) => {
  console.error(`\n❌ Umzug fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
