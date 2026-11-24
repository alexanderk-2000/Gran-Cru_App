
import {
  collection,
  doc,
  getCountFromServer,
  getDocFromServer,
  getDocsFromServer,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Query,
  type QueryConstraint
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { Wine, Tasting, Occasion, OccasionInstance, OccasionWinePoolEntry, RepeatRule, CellarPocket } from '../types.ts';
import { PRE_SEED_WINES } from '../constants.ts';
import { auth, db, getCurrentUid, requireUid, waitForAuth } from './firebase.ts';
import {
  buildCatalogCanonicalKey,
  normalizeCatalogToken,
  PG_TRGM_THRESHOLD,
  trigramSimilarity
} from '../domain/wine/catalogSearch.ts';

/**
 * Firestore-backed storage service.
 *
 * Data model: everything a user owns lives below `users/{uid}/...`
 * (one subcollection per former Supabase table), so the security rules
 * are a single owner check (see firestore.rules). Timestamps stay ISO-8601
 * strings exactly as before: they sort lexicographically, so the
 * delta-sync cursors in services/pwa/syncEngine.ts keep working unchanged.
 *
 * Reads always go to the server (getDocsFromServer) - the plain getDocs()
 * silently falls back to an (empty) cache when offline, which would make
 * the sync engine's hard-delete reconciliation wipe the local Dexie cache.
 * Failing loudly offline is what the offline adapter expects.
 */

/**
 * Grundlegende Hilfsmethoden für den lokalen Speicher (ESM kompatibel)
 */
export const getItem = (key: string) => localStorage.getItem(key);
export const setItem = (key: string, value: string) => localStorage.setItem(key, value);
export const removeItem = (key: string) => localStorage.removeItem(key);

type CollectionName =
  | 'wines'
  | 'inventory_events'
  | 'occasions'
  | 'occasion_instances'
  | 'occasion_wine_pool'
  | 'tastings'
  | 'cellar_pockets'
  | 'wine_catalog';

const nowIso = () => new Date().toISOString();

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

const userCollection = (uid: string, name: CollectionName) => collection(db, 'users', uid, name);
const userDoc = (uid: string, name: CollectionName, id: string) => doc(db, 'users', uid, name, id);

const fetchAll = async <T>(q: Query): Promise<T[]> => {
  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as T);
};

const fetchCollection = async <T>(uid: string, name: CollectionName, ...constraints: QueryConstraint[]): Promise<T[]> =>
  fetchAll<T>(query(userCollection(uid, name), ...constraints));

const fetchOne = async <T>(ref: DocumentReference): Promise<T | null> => {
  const snapshot = await getDocFromServer(ref);
  if (!snapshot.exists()) return null;
  return { ...(snapshot.data() as Record<string, unknown>), id: snapshot.id } as T;
};

/** Firestore batches are capped at 500 operations. */
const commitInChunks = async (ops: Array<(batch: ReturnType<typeof writeBatch>) => void>) => {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
};

const byString = <T>(key: keyof T, direction: 'asc' | 'desc' = 'asc') => (a: T, b: T) => {
  const left = String(a[key] ?? '');
  const right = String(b[key] ?? '');
  const result = left < right ? -1 : left > right ? 1 : 0;
  return direction === 'asc' ? result : -result;
};

const isActiveWine = (wine: Partial<Wine>) => !wine.deleted_at;

// Column defaults of the former Postgres `wines` table.
const WINE_DEFAULTS: Record<string, unknown> = {
  category: 'Rotwein',
  wine_type: 'Stillwein',
  format: '0.75L',
  quantity: 0,
  purchase_price: 0,
  market_price: 0,
  grapes: [],
  aromas: [],
  structure: {},
  pairings: [],
  scores: [],
  confidence: 'medium',
  missing_fields: [],
  wishlist: false,
  ai_details: {},
  ai_sources: [],
  is_favorite: false,
  deleted_at: null,
  deleted_by: null,
  deleted_reason: null
};

const withDefaults = <T extends Record<string, unknown>>(payload: T, defaults: Record<string, unknown>): T => {
  const result: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(defaults)) {
    if (result[key] === undefined) {
      result[key] = Array.isArray(value) ? [...value] : value && typeof value === 'object' ? { ...value } : value;
    }
  }
  return result as T;
};

const normalizeOccasionRow = (row: any): Occasion => ({
  ...row,
  drink_anchor_date: typeof row?.drink_anchor_date === 'string' ? row.drink_anchor_date : null,
  repeat_weekdays: Array.isArray(row?.repeat_weekdays) ? row.repeat_weekdays : null,
  max_occurrences: typeof row?.max_occurrences === 'number' ? row.max_occurrences : null
});

const removeNilValues = <T extends Record<string, any>>(payload: T): Partial<T> => {
  const clean: Partial<T> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      (clean as any)[key] = value;
    }
  }
  return clean;
};

const withoutId = <T extends { id?: unknown }>(payload: T): Omit<T, 'id'> => {
  const { id: _id, ...rest } = payload;
  return rest;
};

// --- Wine catalog (formerly a Postgres trigger + pg_trgm search) ---

/** Firestore document ids may not contain '/'; canonical keys never do, but be safe. */
const catalogDocId = (canonicalKey: string) => canonicalKey.replace(/\//g, '_');

const confidenceFromInt = (value: unknown): Wine['confidence'] => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'medium';
  if (value >= 80) return 'high';
  if (value <= 45) return 'low';
  return 'medium';
};

const confidenceToInt = (value: unknown): number => {
  const normalized = String(value || 'medium').toLowerCase();
  if (normalized === 'high') return 90;
  if (normalized === 'low') return 40;
  return 65;
};

const trimOrNull = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
};

const toShortDescription = (details: unknown): string | undefined => {
  if (!details || typeof details !== 'object') return undefined;
  const extensions = (details as any).extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  const shortText = extensions.short_description_de;
  return typeof shortText === 'string' && shortText.trim() !== '' ? shortText.trim() : undefined;
};

/** Mirror of the former `sync_wine_row_to_catalog()` trigger. */
const buildCatalogEntry = (wine: Partial<Wine>): Record<string, unknown> | null => {
  const nameNorm = normalizeCatalogToken(wine.name);
  if (!nameNorm) return null;
  const producerNorm = normalizeCatalogToken(wine.producer);
  const vintage = typeof wine.vintage === 'number' && Number.isFinite(wine.vintage) ? wine.vintage : null;
  const details = wine.ai_details && typeof wine.ai_details === 'object' ? wine.ai_details : {};
  const baseVinification = (details as any).vinification && typeof (details as any).vinification === 'object'
    ? (details as any).vinification
    : {};
  const vinification = removeNilValues({
    ...baseVinification,
    fermentation_vessel: trimOrNull(wine.fermentation),
    aging_vessel: trimOrNull(wine.aging_process)
  });

  return {
    canonical_key: buildCatalogCanonicalKey(String(wine.name), wine.producer || null, vintage),
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
    updated_at: nowIso()
  };
};

const mapCatalogRowToAiPayload = (row: any): Record<string, any> => {
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  const shortDescription = toShortDescription(details);
  const sources = Array.isArray(row?.sources) ? row.sources : [];

  return {
    name: row?.name || null,
    producer: row?.producer || null,
    vintage: typeof row?.vintage === 'number' ? row.vintage : null,
    short_description_de: shortDescription || null,
    country: row?.country || null,
    region: row?.region || null,
    appellation: row?.appellation || null,
    vineyard: row?.vineyard || null,
    wine_type: row?.wine_type || null,
    grapes: Array.isArray(row?.grapes) ? row.grapes : [],
    alcohol_percent: typeof row?.alcohol_percent === 'number' ? row.alcohol_percent : null,
    drink_start: typeof row?.drink_start === 'number' ? row.drink_start : null,
    peak_year: typeof row?.peak_year === 'number' ? row.peak_year : null,
    drink_end: typeof row?.drink_end === 'number' ? row.drink_end : null,
    aromas: Array.isArray(row?.aromas) ? row.aromas : [],
    structure: row?.structure && typeof row.structure === 'object' ? row.structure : {},
    pairings: Array.isArray(row?.pairings) ? row.pairings : [],
    vinification: row?.vinification && typeof row.vinification === 'object' ? row.vinification : {},
    scores: Array.isArray(row?.scores) ? row.scores : [],
    confidence: confidenceFromInt(row?.confidence),
    missing_fields: Array.isArray(row?.missing_fields) ? row.missing_fields : [],
    sources,
    details
  };
};

type InventoryEventType = 'purchase' | 'adjustment' | 'loss' | 'transfer' | 'consume' | 'soft_delete' | 'restore';

const buildInventoryEvent = (uid: string, event: {
  wine_id: string;
  type: InventoryEventType;
  delta: number;
  source: string;
  note?: string | null;
}) => ({
  id: newId(),
  user_id: uid,
  wine_id: event.wine_id,
  type: event.type,
  delta: event.delta,
  source: event.source || 'detail',
  note: event.note ?? null,
  created_at: nowIso()
});

type ConsumptionRow = {
  id: string;
  wine_id: string;
  user_id: string;
  type: string;
  delta: number;
  source: string;
  created_at: string;
  wines: { name: string; producer?: string; vintage?: number } | null;
};

/** Client-side replacement for PostgREST's `wines(name,producer,vintage)` embed. */
const attachWineSummaries = async (uid: string, events: Array<Omit<ConsumptionRow, 'wines'>>): Promise<ConsumptionRow[]> => {
  const wineIds = [...new Set(events.map((event) => event.wine_id).filter(Boolean))];
  const wines = await Promise.all(wineIds.map((id) => fetchOne<Wine>(userDoc(uid, 'wines', id))));
  const byId = new Map(wines.filter((wine): wine is Wine => !!wine).map((wine) => [wine.id, wine]));
  return events.map((event) => {
    const wine = byId.get(event.wine_id);
    return {
      ...event,
      wines: wine ? { name: wine.name, producer: wine.producer, vintage: wine.vintage } : null
    };
  });
};

/**
 * Hard-delete cascade that Postgres foreign keys used to do: events,
 * tastings and pool entries go with the wine, occasion instances keep
 * existing but lose their wine reference (ON DELETE SET NULL).
 */
const buildWineDeleteOps = async (uid: string, wineId: string) => {
  const [events, tastings, pool, instances] = await Promise.all([
    fetchCollection<{ id: string }>(uid, 'inventory_events', where('wine_id', '==', wineId)),
    fetchCollection<{ id: string }>(uid, 'tastings', where('wine_id', '==', wineId)),
    fetchCollection<{ id: string }>(uid, 'occasion_wine_pool', where('wine_id', '==', wineId)),
    fetchCollection<{ id: string }>(uid, 'occasion_instances', where('wine_id', '==', wineId))
  ]);
  const timestamp = nowIso();
  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  events.forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'inventory_events', row.id))));
  tastings.forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'tastings', row.id))));
  pool.forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'occasion_wine_pool', row.id))));
  instances.forEach((row) => ops.push((batch) => batch.update(userDoc(uid, 'occasion_instances', row.id), {
    wine_id: null,
    updated_at: timestamp
  })));
  ops.push((batch) => batch.delete(userDoc(uid, 'wines', wineId)));
  return ops;
};

/**
 * Update a wine and append an inventory event atomically - replaces the
 * old "update, insert event, roll back the update if the insert failed"
 * dance, which a Firestore batch makes unnecessary.
 */
const updateWineWithEvent = async (
  uid: string,
  wineId: string,
  changes: Partial<Wine>,
  event: Parameters<typeof buildInventoryEvent>[1] | null
): Promise<Wine> => {
  const batch = writeBatch(db);
  const timestamp = nowIso();
  batch.update(userDoc(uid, 'wines', wineId), { ...changes, updated_at: timestamp });
  if (event) {
    const payload = buildInventoryEvent(uid, event);
    batch.set(userDoc(uid, 'inventory_events', payload.id), payload);
  }
  await batch.commit();
  const updated = await fetchOne<Wine>(userDoc(uid, 'wines', wineId));
  if (!updated) throw new Error('Wein nicht gefunden.');
  return updated;
};

const getActiveWine = async (uid: string, wineId: string): Promise<Wine | null> => {
  const wine = await fetchOne<Wine>(userDoc(uid, 'wines', wineId));
  return wine && isActiveWine(wine) ? wine : null;
};

export const storageService = {
  // --- AUTHENTIFIZIERUNG ---
  getCurrentUser: async () => {
    // Reads the locally persisted session - works offline.
    const user = await waitForAuth();
    if (!user) return null;
    return {
      id: user.uid,
      email: user.email || '',
      currency: 'EUR',
      target_date: '2044-12-31'
    };
  },

  logout: async () => {
    await signOut(auth);
    window.location.reload();
  },

  signUp: async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await sendEmailVerification(credential.user);
    } catch (error) {
      console.warn('Could not send verification email:', error);
    }
    return credential.user;
  },

  signIn: async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  },

  signInAnonymously: async () => {
    const credential = await firebaseSignInAnonymously(auth);
    if (credential.user) await storageService.seedIfNewUser(credential.user.uid);
    return credential.user;
  },

  seedIfNewUser: async (userId: string) => {
    try {
      const countSnapshot = await getCountFromServer(userCollection(userId, 'wines'));
      if (countSnapshot.data().count > 0) return;
      const timestamp = nowIso();
      await commitInChunks(PRE_SEED_WINES.map((wine) => (batch) => {
        const id = newId();
        batch.set(userDoc(userId, 'wines', id), withDefaults({
          ...wine,
          id,
          user_id: userId,
          created_at: timestamp,
          updated_at: timestamp
        } as Record<string, unknown>, WINE_DEFAULTS));
      }));
    } catch (error) {
      console.error('Failed to seed demo wines:', error);
    }
  },

  // --- WEINBESTAND ---
  getWines: async (): Promise<Wine[]> => {
    const uid = await requireUid();
    const wines = await fetchCollection<Wine>(uid, 'wines', orderBy('created_at', 'desc'));
    return wines.filter(isActiveWine);
  },

  /**
   * Delta-sync counterpart to getWines()/getDeletedWines(): covers both
   * active and deleted wines, filtered to what changed since `cursor`.
   * Pass `null` for a first-sync bootstrap (returns everything).
   */
  getWinesUpdatedSince: async (cursor: string | null): Promise<Wine[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('updated_at', '>', cursor), orderBy('updated_at', 'asc')]
      : [orderBy('updated_at', 'asc')];
    return fetchCollection<Wine>(uid, 'wines', ...constraints);
  },

  getCellarPockets: async (): Promise<CellarPocket[]> => {
    const uid = await requireUid();
    return fetchCollection<CellarPocket>(uid, 'cellar_pockets', orderBy('created_at', 'asc'));
  },

  createCellarPocket: async (name: string): Promise<CellarPocket | null> => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return null;
    const uid = await requireUid();

    // Names are unique per user (former UNIQUE (user_id, name) constraint).
    const existing = await fetchCollection<CellarPocket>(uid, 'cellar_pockets', where('name', '==', normalizedName));
    if (existing.length > 0) return existing[0];

    const timestamp = nowIso();
    const pocket: CellarPocket = {
      id: newId(),
      user_id: uid,
      name: normalizedName,
      created_at: timestamp,
      updated_at: timestamp
    };
    await setDoc(userDoc(uid, 'cellar_pockets', pocket.id), pocket);
    return pocket;
  },

  getWineById: async (id: string): Promise<Wine | null> => {
    const uid = await requireUid();
    return getActiveWine(uid, id);
  },

  saveWine: async (wine: Partial<Wine>): Promise<Wine> => {
    const uid = await requireUid();
    const timestamp = nowIso();
    const existing = wine.id ? await fetchOne<Wine>(userDoc(uid, 'wines', wine.id)) : null;
    const previousQuantity = existing && typeof existing.quantity === 'number' ? existing.quantity : null;

    let savedWine: Wine;
    const batch = writeBatch(db);
    if (existing) {
      const changes = { ...withoutId(wine), user_id: uid, updated_at: timestamp };
      batch.update(userDoc(uid, 'wines', existing.id), changes);
      savedWine = { ...existing, ...changes, id: existing.id } as Wine;
    } else {
      const id = wine.id || newId();
      savedWine = withDefaults({
        ...wine,
        id,
        user_id: uid,
        created_at: timestamp,
        updated_at: timestamp
      } as Record<string, unknown>, WINE_DEFAULTS) as unknown as Wine;
      batch.set(userDoc(uid, 'wines', id), savedWine);
    }

    // Keep the event log the single source of truth for stock changes,
    // regardless of which UI path (capture, edit form, import) touched quantity.
    if (typeof savedWine.quantity === 'number') {
      const delta = previousQuantity === null ? savedWine.quantity : savedWine.quantity - previousQuantity;
      if (delta !== 0) {
        const event = buildInventoryEvent(uid, {
          wine_id: savedWine.id,
          type: previousQuantity === null ? 'purchase' : 'adjustment',
          delta,
          source: previousQuantity === null ? 'capture' : 'edit'
        });
        batch.set(userDoc(uid, 'inventory_events', event.id), event);
      }
    }

    const catalogEntry = buildCatalogEntry(savedWine);
    if (catalogEntry) {
      batch.set(userDoc(uid, 'wine_catalog', catalogDocId(String(catalogEntry.canonical_key))), catalogEntry);
    }

    await batch.commit();
    return savedWine;
  },

  findWineInCatalog: async (searchQuery: { name: string; producer?: string; vintage?: number | null }): Promise<Record<string, any> | null> => {
    const name = (searchQuery.name || '').trim();
    const producer = (searchQuery.producer || '').trim();
    const vintage = typeof searchQuery.vintage === 'number' && Number.isFinite(searchQuery.vintage) ? searchQuery.vintage : null;
    if (!name) return null;
    const uid = await getCurrentUid();
    if (!uid) return null;

    const canonicalKey = buildCatalogCanonicalKey(name, producer || null, vintage);
    const exact = await fetchOne<Record<string, any>>(userDoc(uid, 'wine_catalog', catalogDocId(canonicalKey)));
    if (exact) return mapCatalogRowToAiPayload(exact);

    // Fuzzy match - same scoring as the former search_wine_catalog() SQL function.
    const entries = await fetchCollection<Record<string, any>>(uid, 'wine_catalog');
    const qn = normalizeCatalogToken(name);
    const qp = normalizeCatalogToken(producer);
    const ranked = entries
      .map((entry) => {
        const nameSimilarity = trigramSimilarity(String(entry.name_norm || ''), qn);
        const producerSimilarity = qp ? trigramSimilarity(String(entry.producer_norm || ''), qp) : 0;
        const matches = (qn !== '' && nameSimilarity >= PG_TRGM_THRESHOLD) || (qp !== '' && producerSimilarity >= PG_TRGM_THRESHOLD);
        const vintageBonus = vintage === null ? 0 : entry.vintage === vintage ? 0.05 : -0.05;
        return { entry, matches, score: 0.75 * nameSimilarity + (qp ? 0.25 * producerSimilarity : 0) + vintageBonus };
      })
      .filter((candidate) => candidate.matches)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (best && best.score >= 0.35) return mapCatalogRowToAiPayload(best.entry);

    const substringMatch = entries.find((entry) => String(entry.name_norm || '').includes(qn));
    return substringMatch ? mapCatalogRowToAiPayload(substringMatch) : null;
  },

  adjustStock: async (id: string, delta: number, context?: string) => {
    const uid = await requireUid();
    const wine = await getActiveWine(uid, id);
    if (!wine) return null;
    return updateWineWithEvent(
      uid,
      id,
      { quantity: Math.max(0, (wine.quantity || 0) + delta) },
      delta !== 0 ? { wine_id: id, type: 'adjustment', delta, source: context || 'manual' } : null
    );
  },

  recordPurchase: async (purchase: { wine_id: string; quantity: number; price_per_bottle: number; date: string }) => {
    const uid = await requireUid();
    const wine = await getActiveWine(uid, purchase.wine_id);
    if (!wine) return null;
    const currentQuantity = wine.quantity || 0;
    const newQuantity = currentQuantity + purchase.quantity;
    const newPrice = (((wine.purchase_price || 0) * currentQuantity) + (purchase.price_per_bottle * purchase.quantity)) / (newQuantity || 1);
    return updateWineWithEvent(
      uid,
      purchase.wine_id,
      { quantity: newQuantity, purchase_price: newPrice },
      { wine_id: purchase.wine_id, type: 'purchase', delta: purchase.quantity, source: 'purchase', note: purchase.date }
    );
  },

  recordLoss: async (wineId: string, quantity: number, reason?: string) => {
    const uid = await requireUid();
    const wine = await getActiveWine(uid, wineId);
    if (!wine) throw new Error('Wein nicht gefunden.');

    const lostQuantity = Math.min(quantity, wine.quantity);
    if (lostQuantity <= 0) return wine;
    return updateWineWithEvent(
      uid,
      wineId,
      { quantity: Math.max(0, wine.quantity - lostQuantity) },
      { wine_id: wineId, type: 'loss', delta: -lostQuantity, source: 'detail', note: reason }
    );
  },

  transferWine: async (wineId: string, targetSubcellar: string) => {
    const uid = await requireUid();
    const wine = await getActiveWine(uid, wineId);
    if (!wine) return null;
    const previousSubcellar = wine.subcellar || '';
    return updateWineWithEvent(
      uid,
      wineId,
      { subcellar: (targetSubcellar || null) as Wine['subcellar'] },
      {
        wine_id: wineId,
        type: 'transfer',
        delta: 0,
        source: 'pocket',
        note: `${previousSubcellar || 'Hauptkeller'} -> ${targetSubcellar || 'Hauptkeller'}`
      }
    );
  },

  consumeBottle: async (wineId: string, source: string = 'detail'): Promise<Wine> => {
    const uid = await requireUid();
    const wine = await getActiveWine(uid, wineId);
    if (!wine) throw new Error('Wein nicht gefunden.');
    if (wine.quantity <= 0) throw new Error('Keine Flaschen mehr im Bestand.');
    return updateWineWithEvent(
      uid,
      wineId,
      { quantity: Math.max(0, wine.quantity - 1) },
      { wine_id: wineId, type: 'consume', delta: -1, source }
    );
  },

  getConsumptionHistory: async (): Promise<ConsumptionRow[]> => {
    const uid = await requireUid();
    const events = await fetchCollection<Omit<ConsumptionRow, 'wines'>>(uid, 'inventory_events', where('type', '==', 'consume'));
    events.sort(byString('created_at', 'desc'));
    return attachWineSummaries(uid, events);
  },

  /**
   * Delta-sync counterpart to getConsumptionHistory(): inventory_events is
   * append-only, so created_at alone is a correct cursor. Filtering by type
   * happens client-side so no composite index is needed.
   */
  getConsumptionHistorySince: async (cursor: string | null): Promise<ConsumptionRow[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('created_at', '>', cursor), orderBy('created_at', 'asc')]
      : [orderBy('created_at', 'asc')];
    const events = (await fetchCollection<Omit<ConsumptionRow, 'wines'>>(uid, 'inventory_events', ...constraints))
      .filter((event) => event.type === 'consume');
    return attachWineSummaries(uid, events);
  },

  // --- SOFT DELETE & PAPIERKORB ---
  softDeleteWine: async (id: string, reason?: string) => {
    const uid = await requireUid();
    const timestamp = nowIso();
    await updateWineWithEvent(
      uid,
      id,
      { deleted_at: timestamp, deleted_by: uid, deleted_reason: (reason ?? null) as Wine['deleted_reason'] },
      { wine_id: id, type: 'soft_delete', delta: 0, source: 'trash', note: reason }
    );
  },

  getDeletedWines: async (): Promise<Wine[]> => {
    const uid = await requireUid();
    const wines = await fetchCollection<Wine>(uid, 'wines');
    return wines.filter((wine) => !isActiveWine(wine)).sort(byString('deleted_at', 'desc'));
  },

  restoreWine: async (id: string) => {
    const uid = await requireUid();
    await updateWineWithEvent(
      uid,
      id,
      { deleted_at: null, deleted_by: null, deleted_reason: null as unknown as Wine['deleted_reason'] },
      { wine_id: id, type: 'restore', delta: 0, source: 'trash' }
    );
  },

  permanentlyDeleteWine: async (id: string) => {
    const uid = await requireUid();
    await commitInChunks(await buildWineDeleteOps(uid, id));
  },

  emptyTrash: async () => {
    const uid = await requireUid();
    const deleted = await storageService.getDeletedWines();
    const ops = (await Promise.all(deleted.map((wine) => buildWineDeleteOps(uid, wine.id)))).flat();
    await commitInChunks(ops);
  },

  // --- EVENTS & TASTINGS ---
  getOccasions: async (): Promise<Occasion[]> => {
    const uid = await requireUid();
    const rows = await fetchCollection<Occasion>(uid, 'occasions', orderBy('created_at', 'desc'));
    return rows.map(normalizeOccasionRow);
  },

  /** Delta-sync counterpart to getOccasions() - see getWinesUpdatedSince(). */
  getOccasionsUpdatedSince: async (cursor: string | null): Promise<Occasion[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('updated_at', '>', cursor), orderBy('updated_at', 'asc')]
      : [orderBy('updated_at', 'asc')];
    const rows = await fetchCollection<Occasion>(uid, 'occasions', ...constraints);
    return rows.map(normalizeOccasionRow);
  },

  getOccasionInstances: async (): Promise<OccasionInstance[]> => {
    const uid = await requireUid();
    const [instances, occasions] = await Promise.all([
      fetchCollection<OccasionInstance>(uid, 'occasion_instances', orderBy('instance_date', 'asc')),
      fetchCollection<Occasion>(uid, 'occasions')
    ]);
    const byId = new Map(occasions.map((occasion) => [occasion.id, normalizeOccasionRow(occasion)]));
    return instances.map((instance) => ({ ...instance, occasion: byId.get(instance.occasion_id) }));
  },

  /** Delta-sync counterpart to getOccasionInstances() - see getWinesUpdatedSince(). */
  getOccasionInstancesUpdatedSince: async (cursor: string | null): Promise<OccasionInstance[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('updated_at', '>', cursor), orderBy('updated_at', 'asc')]
      : [orderBy('updated_at', 'asc')];
    return fetchCollection<OccasionInstance>(uid, 'occasion_instances', ...constraints);
  },

  getOccasionInstancesByOccasion: async (occasionId: string): Promise<OccasionInstance[]> => {
    const uid = await requireUid();
    const [instances, occasion] = await Promise.all([
      fetchCollection<OccasionInstance>(uid, 'occasion_instances', where('occasion_id', '==', occasionId)),
      fetchOne<Occasion>(userDoc(uid, 'occasions', occasionId))
    ]);
    const normalizedOccasion = occasion ? normalizeOccasionRow(occasion) : undefined;
    return instances
      .sort(byString('instance_date', 'asc'))
      .map((instance) => ({ ...instance, occasion: normalizedOccasion }));
  },

  getOccasionWinePool: async (occasionId: string): Promise<OccasionWinePoolEntry[]> => {
    const uid = await requireUid();
    const entries = (await fetchCollection<OccasionWinePoolEntry>(uid, 'occasion_wine_pool', where('occasion_id', '==', occasionId)))
      .sort(byString('created_at', 'asc'));
    const wines = await Promise.all(entries.map((entry) => fetchOne<Wine>(userDoc(uid, 'wines', entry.wine_id))));
    return entries.map((entry, index) => ({ ...entry, wine: wines[index] || undefined }));
  },

  /**
   * Delta-sync counterpart to getOccasionWinePool(): pool entries for ALL
   * of the user's occasions in one query, filtered by `updated_at`.
   */
  getOccasionWinePoolUpdatedSince: async (cursor: string | null): Promise<OccasionWinePoolEntry[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('updated_at', '>', cursor), orderBy('updated_at', 'asc')]
      : [orderBy('updated_at', 'asc')];
    return fetchCollection<OccasionWinePoolEntry>(uid, 'occasion_wine_pool', ...constraints);
  },

  saveOccasionWinePool: async (
    occasionId: string,
    entries: Array<{ wine_id: string; bottles_reserved: number; priority: 'low' | 'medium' | 'high' }>
  ): Promise<OccasionWinePoolEntry[]> => {
    const uid = await requireUid();
    const timestamp = nowIso();

    // Unique per (occasion_id, wine_id): dedupe the input, then upsert
    // against what already exists.
    const clean = new Map<string, { wine_id: string; bottles_reserved: number; priority: 'low' | 'medium' | 'high' }>();
    entries
      .filter((entry) => !!entry.wine_id)
      .forEach((entry) => clean.set(entry.wine_id, {
        wine_id: entry.wine_id,
        bottles_reserved: Math.max(1, Math.round(entry.bottles_reserved || 1)),
        priority: entry.priority || 'medium'
      }));

    const current = await fetchCollection<OccasionWinePoolEntry>(uid, 'occasion_wine_pool', where('occasion_id', '==', occasionId));
    const currentByWine = new Map(current.map((row) => [row.wine_id, row]));

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    clean.forEach((entry) => {
      const existing = currentByWine.get(entry.wine_id);
      if (existing) {
        ops.push((batch) => batch.update(userDoc(uid, 'occasion_wine_pool', existing.id), {
          bottles_reserved: entry.bottles_reserved,
          priority: entry.priority,
          updated_at: timestamp
        }));
      } else {
        const id = newId();
        ops.push((batch) => batch.set(userDoc(uid, 'occasion_wine_pool', id), {
          id,
          occasion_id: occasionId,
          user_id: uid,
          ...entry,
          created_at: timestamp,
          updated_at: timestamp
        }));
      }
    });
    current
      .filter((row) => !clean.has(row.wine_id))
      .forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'occasion_wine_pool', row.id))));

    await commitInChunks(ops);
    return storageService.getOccasionWinePool(occasionId);
  },

  updateInstanceWine: async (instanceId: string, wineId: string | null) => {
    const uid = await requireUid();
    await updateDoc(userDoc(uid, 'occasion_instances', instanceId), {
      wine_id: wineId,
      auto_assigned: false,
      assignment_score: null,
      assignment_reason: wineId ? 'Manuell zugeordnet' : null,
      updated_at: nowIso()
    });
  },

  updateInstanceStatus: async (instanceId: string, status: string) => {
    const uid = await requireUid();
    await updateDoc(userDoc(uid, 'occasion_instances', instanceId), { status, updated_at: nowIso() });
  },

  applyAutoAssignments: async (
    updates: Array<{ instanceId: string; wineId: string; score: number; reason: string }>
  ) => {
    if (updates.length === 0) return;
    const uid = await requireUid();
    const timestamp = nowIso();
    await commitInChunks(updates.map((update) => (batch) => batch.update(userDoc(uid, 'occasion_instances', update.instanceId), {
      wine_id: update.wineId,
      auto_assigned: true,
      assignment_score: update.score,
      assignment_reason: update.reason,
      updated_at: timestamp
    })));
  },

  clearAutoAssignmentsForOccasion: async (occasionId: string) => {
    const uid = await requireUid();
    const instances = (await fetchCollection<OccasionInstance>(uid, 'occasion_instances', where('occasion_id', '==', occasionId)))
      .filter((instance) => instance.status === 'planned' && instance.auto_assigned === true);
    const timestamp = nowIso();
    await commitInChunks(instances.map((instance) => (batch) => batch.update(userDoc(uid, 'occasion_instances', instance.id), {
      wine_id: null,
      auto_assigned: false,
      assignment_score: null,
      assignment_reason: null,
      updated_at: timestamp
    })));
  },

  saveOccasion: async (occ: Partial<Occasion>): Promise<Occasion> => {
    const uid = await requireUid();
    const timestamp = nowIso();
    const payload = removeNilValues({ ...withoutId(occ), user_id: uid }) as Record<string, any>;

    const existing = occ.id ? await fetchOne<Occasion>(userDoc(uid, 'occasions', occ.id)) : null;
    let saved: Occasion;
    if (existing) {
      const changes = { ...payload, updated_at: timestamp };
      await updateDoc(userDoc(uid, 'occasions', existing.id), changes);
      saved = { ...existing, ...changes, id: existing.id } as Occasion;
    } else {
      const id = newId();
      saved = withDefaults({
        ...payload,
        id,
        created_at: timestamp,
        updated_at: timestamp
      }, { repeat_rule: 'none', repeat_interval: 1 }) as unknown as Occasion;
      await setDoc(userDoc(uid, 'occasions', id), saved);
    }

    const savedOcc = normalizeOccasionRow(saved);
    await storageService.syncInstances(savedOcc);
    return savedOcc;
  },

  deleteOccasion: async (id: string) => {
    const uid = await requireUid();
    // Former ON DELETE CASCADE to occasion_instances and occasion_wine_pool.
    const [instances, pool] = await Promise.all([
      fetchCollection<{ id: string }>(uid, 'occasion_instances', where('occasion_id', '==', id)),
      fetchCollection<{ id: string }>(uid, 'occasion_wine_pool', where('occasion_id', '==', id))
    ]);
    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    instances.forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'occasion_instances', row.id))));
    pool.forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'occasion_wine_pool', row.id))));
    ops.push((batch) => batch.delete(userDoc(uid, 'occasions', id)));
    await commitInChunks(ops);
  },

  syncInstances: async (occ: Occasion) => {
    const uid = await requireUid();
    const dates = storageService.generateDates(
      occ.start_date,
      occ.end_date,
      occ.repeat_rule,
      occ.repeat_interval,
      occ.repeat_weekdays ?? undefined,
      occ.max_occurrences ?? undefined,
      occ.drink_anchor_date ?? undefined
    );

    const existing = await fetchCollection<OccasionInstance>(uid, 'occasion_instances', where('occasion_id', '==', occ.id));
    const existingDates = new Set(existing.map((row) => row.instance_date));
    const generated = new Set(dates);
    const timestamp = nowIso();

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    // Insert missing dates (former upsert ... ignoreDuplicates).
    dates
      .filter((date) => !existingDates.has(date))
      .forEach((date) => {
        const id = newId();
        ops.push((batch) => batch.set(userDoc(uid, 'occasion_instances', id), {
          id,
          occasion_id: occ.id,
          user_id: uid,
          instance_date: date,
          wine_id: null,
          status: 'planned',
          auto_assigned: false,
          assignment_score: null,
          assignment_reason: null,
          created_at: timestamp,
          updated_at: timestamp
        }));
      });
    existing
      .filter((row) => !generated.has(row.instance_date) && row.status !== 'consumed')
      .forEach((row) => ops.push((batch) => batch.delete(userDoc(uid, 'occasion_instances', row.id))));

    await commitInChunks(ops);
  },

  generateDates: (
    start: string,
    end: string,
    rule: RepeatRule,
    interval: number,
    weekdays?: number[],
    maxOccurrences?: number,
    drinkAnchorDate?: string
  ): string[] => {
    const dates: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    const anchorDate = drinkAnchorDate ? new Date(drinkAnchorDate) : null;
    const hasValidAnchor = !!anchorDate && !Number.isNaN(anchorDate.getTime());
    const anchor = hasValidAnchor ? anchorDate : startDate;
    const step = Math.max(1, interval || 1);
    const maxItems = maxOccurrences && maxOccurrences > 0 ? maxOccurrences : Infinity;
    let current = new Date(startDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return [];
    }

    if (rule === 'none') {
      const single = hasValidAnchor && anchor >= startDate && anchor <= endDate ? anchor : startDate;
      return [single.toISOString().split('T')[0]];
    }

    if (rule === 'daily') {
      while (current <= endDate && dates.length < maxItems) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + step);
      }
      return dates;
    }

    if (rule === 'weekly') {
      const activeWeekdays = (weekdays && weekdays.length > 0 ? weekdays : [anchor.getDay()])
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
      const selected = new Set(activeWeekdays);
      const iter = new Date(startDate);
      while (iter <= endDate && dates.length < maxItems) {
        const diffDays = Math.floor((iter.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);
        if (weekIndex % step === 0 && selected.has(iter.getDay())) {
          dates.push(iter.toISOString().split('T')[0]);
        }
        iter.setDate(iter.getDate() + 1);
      }
      return dates;
    }

    if (rule === 'monthly') {
      const targetDay = anchor.getDate();
      while (current <= endDate && dates.length < maxItems) {
        const year = current.getFullYear();
        const month = current.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const day = Math.min(targetDay, lastDay);
        const candidate = new Date(year, month, day);
        if (candidate >= startDate && candidate <= endDate) {
          dates.push(candidate.toISOString().split('T')[0]);
        }
        current = new Date(year, month + step, 1);
      }
      return dates;
    }

    if (rule === 'yearly') {
      const targetMonth = anchor.getMonth();
      const targetDay = anchor.getDate();
      while (current <= endDate && dates.length < maxItems) {
        const year = current.getFullYear();
        const lastDay = new Date(year, targetMonth + 1, 0).getDate();
        const day = Math.min(targetDay, lastDay);
        const candidate = new Date(year, targetMonth, day);
        if (candidate >= startDate && candidate <= endDate) {
          dates.push(candidate.toISOString().split('T')[0]);
        }
        current = new Date(year + step, targetMonth, 1);
      }
      return dates;
    }

    return dates;
  },

  getTastings: async (wineId: string): Promise<Tasting[]> => {
    const uid = await requireUid();
    const tastings = await fetchCollection<Tasting>(uid, 'tastings', where('wine_id', '==', wineId));
    return tastings.sort(byString('date', 'desc'));
  },

  /**
   * Delta-sync counterpart to getTastings(): tastings for ALL of the user's
   * wines in one query. Tastings are insert-only, so created_at is a
   * correct cursor.
   */
  getTastingsCreatedSince: async (cursor: string | null): Promise<Tasting[]> => {
    const uid = await requireUid();
    const constraints: QueryConstraint[] = cursor
      ? [where('created_at', '>', cursor), orderBy('created_at', 'asc')]
      : [orderBy('created_at', 'asc')];
    return fetchCollection<Tasting>(uid, 'tastings', ...constraints);
  },

  addTasting: async (tasting: Partial<Tasting>): Promise<Tasting> => {
    const uid = await requireUid();
    const timestamp = nowIso();
    const saved = {
      ...withoutId(tasting),
      id: newId(),
      user_id: uid,
      date: timestamp,
      created_at: timestamp
    } as Tasting;
    await setDoc(userDoc(uid, 'tastings', saved.id), saved);
    await storageService.adjustStock(tasting.wine_id!, -1);
    return saved;
  },

  /**
   * ID-only reconciliation for hard deletes: delta pulls above only see
   * updated/created documents, never deleted ones. Fetching every id lets
   * syncEngine diff against the local Dexie cache and drop anything no
   * longer present remotely, without needing a tombstone collection.
   */
  getSyncReconciliationIds: async (): Promise<{
    wines: string[];
    occasions: string[];
    occasion_instances: string[];
    occasion_wine_pool: string[];
  }> => {
    const uid = await requireUid();
    const ids = async (name: CollectionName) => (await getDocsFromServer(userCollection(uid, name))).docs.map((d) => d.id);
    const [wines, occasions, occasionInstances, occasionWinePool] = await Promise.all([
      ids('wines'),
      ids('occasions'),
      ids('occasion_instances'),
      ids('occasion_wine_pool')
    ]);
    return {
      wines,
      occasions,
      occasion_instances: occasionInstances,
      occasion_wine_pool: occasionWinePool
    };
  }
};
