
import { Wine, Tasting, Occasion, OccasionInstance, OccasionWinePoolEntry, RepeatRule, CellarPocket } from '../types.ts';
import { PRE_SEED_WINES } from '../constants.ts';
import { supabase } from './supabase.ts';

/**
 * Grundlegende Hilfsmethoden für den lokalen Speicher (ESM kompatibel)
 */
export const getItem = (key: string) => localStorage.getItem(key);
export const setItem = (key: string, value: string) => localStorage.setItem(key, value);
export const removeItem = (key: string) => localStorage.removeItem(key);
const OCCASIONS_SCHEMA_MODE_KEY = 'occasions_schema_mode'; // modern | legacy

const isOccasionSchemaColumnError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  const code = maybe.code || '';
  const message = (maybe.message || '').toLowerCase();
  return (
    code === 'PGRST204' &&
    (message.includes('repeat_weekdays') || message.includes('max_occurrences') || message.includes('drink_anchor_date'))
  );
};

const normalizeOccasionRow = (row: any): Occasion => ({
  ...row,
  drink_anchor_date: typeof row?.drink_anchor_date === 'string' ? row.drink_anchor_date : null,
  repeat_weekdays: Array.isArray(row?.repeat_weekdays) ? row.repeat_weekdays : null,
  max_occurrences: typeof row?.max_occurrences === 'number' ? row.max_occurrences : null
});

const stripOccasionRepeatFields = (payload: Record<string, any>) => {
  const legacy = { ...payload };
  delete legacy.repeat_weekdays;
  delete legacy.max_occurrences;
  delete legacy.drink_anchor_date;
  return legacy;
};

const removeNilValues = <T extends Record<string, any>>(payload: T): Partial<T> => {
  const clean: Partial<T> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      (clean as any)[key] = value;
    }
  }
  return clean;
};

const normalizeCatalogToken = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const buildCatalogCanonicalKey = (name: string, producer?: string | null, vintage?: number | null): string => {
  const normalizedName = normalizeCatalogToken(name);
  const normalizedProducer = normalizeCatalogToken(producer || '');
  const normalizedVintage = Number.isFinite(vintage as number) ? String(vintage) : 'nv';
  return [normalizedVintage, normalizedProducer, normalizedName].filter(Boolean).join('::');
};

const confidenceToInt = (value: Wine['confidence'] | undefined): number => {
  if (value === 'high') return 90;
  if (value === 'low') return 40;
  return 65;
};

const confidenceFromInt = (value: unknown): Wine['confidence'] => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'medium';
  if (value >= 80) return 'high';
  if (value <= 45) return 'low';
  return 'medium';
};

const toShortDescription = (details: unknown): string | undefined => {
  if (!details || typeof details !== 'object') return undefined;
  const extensions = (details as any).extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  const shortText = extensions.short_description_de;
  return typeof shortText === 'string' && shortText.trim() !== '' ? shortText.trim() : undefined;
};

const isSupabaseMissingColumnError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === 'PGRST204' && typeof maybe.message === 'string' && maybe.message.includes("Could not find the '");
};

const extractMissingColumnName = (error: unknown): string | null => {
  if (!isSupabaseMissingColumnError(error)) return null;
  const message = (error as { message?: string }).message || '';
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] || null;
};

const isSupabaseMissingRelationError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; message?: string };
  const code = maybe.code || '';
  const message = (maybe.message || '').toLowerCase();
  return (
    code === '42P01' ||
    message.includes('relation') && message.includes('does not exist') ||
    message.includes("could not find the 'cellar_pockets'") ||
    message.includes("could not find the 'name' column of 'cellar_pockets'")
  );
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

export const storageService = {
  // --- AUTHENTIFIZIERUNG ---
  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      currency: 'EUR',
      target_date: '2044-12-31'
    };
  },

  logout: async () => {
    await supabase.auth.signOut();
    window.location.reload();
  },

  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.user;
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (data.user) await storageService.seedIfNewUser(data.user.id);
    return data.user;
  },

  seedIfNewUser: async (userId: string) => {
    const { count } = await supabase.from('wines').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    if (count === 0) {
      const seeded = PRE_SEED_WINES.map(w => ({
        ...w,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      await supabase.from('wines').insert(seeded);
    }
  },

  // --- WEINBESTAND ---
  getWines: async (): Promise<Wine[]> => {
    const { data, error } = await supabase
      .from('wines')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as Wine[]) || [];
  },

  getCellarPockets: async (): Promise<CellarPocket[]> => {
    const { data, error } = await supabase
      .from('cellar_pockets')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      if (isSupabaseMissingRelationError(error)) return [];
      throw error;
    }
    return (data as CellarPocket[]) || [];
  },

  createCellarPocket: async (name: string): Promise<CellarPocket | null> => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht eingeloggt.');

    const insertPayload = {
      user_id: user.id,
      name: normalizedName
    };

    const { data, error } = await supabase
      .from('cellar_pockets')
      .insert([insertPayload])
      .select()
      .single();

    if (!error) return data as CellarPocket;

    if (isSupabaseMissingRelationError(error)) return null;

    const isUniqueViolation = (error as { code?: string }).code === '23505';
    if (isUniqueViolation) {
      const { data: existing, error: fetchError } = await supabase
        .from('cellar_pockets')
        .select('*')
        .eq('user_id', user.id)
        .eq('name', normalizedName)
        .maybeSingle();
      if (fetchError) throw fetchError;
      return (existing as CellarPocket) || null;
    }

    throw error;
  },

  getWineById: async (id: string): Promise<Wine | null> => {
    const { data, error } = await supabase
      .from('wines')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return (data as Wine) || null;
  },

  saveWine: async (wine: Partial<Wine>): Promise<Wine> => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...wine, user_id: user?.id, updated_at: new Date().toISOString() };

    const attemptPayload: Record<string, any> = { ...payload };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, error } = wine.id
        ? await supabase.from('wines').update(attemptPayload).eq('id', wine.id).select().single()
        : await supabase
            .from('wines')
            .insert([{ ...attemptPayload, created_at: new Date().toISOString() }])
            .select()
            .single();

      if (!error) {
        return data as Wine;
      }

      const missingColumn = extractMissingColumnName(error);
      if (!missingColumn || !(missingColumn in attemptPayload)) {
        throw error;
      }

      delete attemptPayload[missingColumn];
    }

    throw new Error('Speichern fehlgeschlagen: wiederholter Schema-Konflikt.');
  },

  upsertWineCatalog: async (wine: Partial<Wine>): Promise<void> => {
    const name = (wine.name || '').trim();
    if (!name) return;

    const producer = (wine.producer || '').trim() || null;
    const vintage = typeof wine.vintage === 'number' && Number.isFinite(wine.vintage) ? wine.vintage : null;
    const canonicalKey = buildCatalogCanonicalKey(name, producer, vintage);

    const details = wine.ai_details && typeof wine.ai_details === 'object' ? wine.ai_details : {};
    const vinificationFromDetails = (details as any).vinification && typeof (details as any).vinification === 'object'
      ? (details as any).vinification
      : {};
    const baseVinification = {
      ...vinificationFromDetails,
      ...(wine.fermentation ? { fermentation_vessel: wine.fermentation } : {}),
      ...(wine.aging_process ? { aging_vessel: wine.aging_process } : {})
    };

    const sources = Array.isArray(wine.ai_sources) ? wine.ai_sources : [];
    const missingFields = Array.isArray(wine.missing_fields) ? wine.missing_fields : [];

    const nameNorm = normalizeCatalogToken(name);
    const producerNorm = normalizeCatalogToken(producer || '');
    const searchNorm = [nameNorm, producerNorm, vintage ? String(vintage) : ''].filter(Boolean).join(' ').trim();

    const payload = {
      canonical_key: canonicalKey,
      name,
      producer,
      vintage,
      region: wine.region || null,
      country: wine.country || null,
      appellation: wine.appellation || null,
      vineyard: wine.vineyard || null,
      wine_type: wine.wine_type || null,
      grapes: Array.isArray(wine.grapes) ? wine.grapes : [],
      alcohol_percent: typeof wine.alcohol_percent === 'number' ? wine.alcohol_percent : null,
      drink_start: typeof wine.drink_start === 'number' ? wine.drink_start : null,
      peak_year: typeof wine.peak_year === 'number' ? wine.peak_year : null,
      drink_end: typeof wine.drink_end === 'number' ? wine.drink_end : null,
      aromas: Array.isArray(wine.aromas) ? wine.aromas : [],
      structure: wine.structure && typeof wine.structure === 'object' ? wine.structure : {},
      pairings: Array.isArray(wine.pairings) ? wine.pairings : [],
      vinification: baseVinification,
      scores: Array.isArray(wine.scores) ? wine.scores : [],
      details,
      sources,
      confidence: confidenceToInt(wine.confidence),
      missing_fields: missingFields,
      inferred_fields: [],
      name_norm: nameNorm,
      producer_norm: producerNorm,
      search_norm: searchNorm,
      updated_at: new Date().toISOString()
    };

    const attemptPayload: Record<string, any> = { ...payload };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await supabase
        .from('wine_catalog')
        .upsert(attemptPayload, { onConflict: 'canonical_key' });
      if (!error) return;

      const missingColumn = extractMissingColumnName(error);
      if (!missingColumn || !(missingColumn in attemptPayload)) {
        throw error;
      }

      // Schema cache / migration drift fallback: retry without unknown column.
      delete attemptPayload[missingColumn];
    }
    throw new Error('wine_catalog upsert failed after fallback attempts');
  },

  findWineInCatalog: async (query: { name: string; producer?: string; vintage?: number | null }): Promise<Record<string, any> | null> => {
    const name = (query.name || '').trim();
    const producer = (query.producer || '').trim();
    const vintage = typeof query.vintage === 'number' && Number.isFinite(query.vintage) ? query.vintage : null;
    if (!name) return null;

    const canonicalKey = buildCatalogCanonicalKey(name, producer || null, vintage);
    const exact = await supabase
      .from('wine_catalog')
      .select('*')
      .eq('canonical_key', canonicalKey)
      .maybeSingle();
    if (exact.data) return mapCatalogRowToAiPayload(exact.data);

    const { data: fuzzy, error: fuzzyError } = await supabase.rpc('search_wine_catalog', {
      q_name: name,
      q_producer: producer || null,
      q_vintage: vintage
    });

    if (!fuzzyError && Array.isArray(fuzzy) && fuzzy.length > 0) {
      const best = fuzzy[0];
      const score = typeof best?.score === 'number' ? best.score : Number(best?.score ?? 0);
      if (best?.id && Number.isFinite(score) && score >= 0.35) {
        const { data: row } = await supabase
          .from('wine_catalog')
          .select('*')
          .eq('id', best.id)
          .maybeSingle();
        if (row) return mapCatalogRowToAiPayload(row);
      }
    }

    const normalizedName = normalizeCatalogToken(name);
    const fallbackByNorm = await supabase
      .from('wine_catalog')
      .select('*')
      .ilike('name_norm', `%${normalizedName}%`)
      .limit(1)
      .maybeSingle();
    if (fallbackByNorm.data) return mapCatalogRowToAiPayload(fallbackByNorm.data);
    if (!fallbackByNorm.error || !isSupabaseMissingColumnError(fallbackByNorm.error)) return null;

    const fallbackByName = await supabase
      .from('wine_catalog')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1)
      .maybeSingle();
    if (fallbackByName.data) return mapCatalogRowToAiPayload(fallbackByName.data);
    return null;
  },

  adjustStock: async (id: string, delta: number, _context?: string) => {
    const { data: wine } = await supabase
      .from('wines')
      .select('quantity')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (!wine) return null;
    const { data } = await supabase.from('wines').update({
      quantity: Math.max(0, wine.quantity + delta),
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single();
    return data;
  },

  recordPurchase: async (purchase: { wine_id: string; quantity: number; price_per_bottle: number; date: string }) => {
    const { data: wine } = await supabase
      .from('wines')
      .select('*')
      .eq('id', purchase.wine_id)
      .is('deleted_at', null)
      .single();
    if (!wine) return null;
    const newQuantity = wine.quantity + purchase.quantity;
    const newPrice = ((wine.purchase_price * wine.quantity) + (purchase.price_per_bottle * purchase.quantity)) / (newQuantity || 1);
    const { data, error } = await supabase.from('wines').update({
      quantity: newQuantity,
      purchase_price: newPrice,
      updated_at: new Date().toISOString()
    }).eq('id', purchase.wine_id).select().single();
    if (error) throw error;
    return data as Wine;
  },

  consumeBottle: async (wineId: string, source: string = 'detail'): Promise<Wine> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht eingeloggt.');

    const { data: wine, error: wineError } = await supabase
      .from('wines')
      .select('*')
      .eq('id', wineId)
      .is('deleted_at', null)
      .single();
    if (wineError) throw wineError;
    if (!wine) throw new Error('Wein nicht gefunden.');
    if (wine.quantity <= 0) throw new Error('Keine Flaschen mehr im Bestand.');

    const nextQuantity = Math.max(0, wine.quantity - 1);

    const { data: updatedWine, error: updateError } = await supabase
      .from('wines')
      .update({
        quantity: nextQuantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', wineId)
      .select()
      .single();
    if (updateError) throw updateError;

    const { error: eventError } = await supabase
      .from('inventory_events')
      .insert([{
        wine_id: wineId,
        user_id: user.id,
        type: 'consume',
        delta: -1,
        source
      }]);

    if (eventError) {
      await supabase
        .from('wines')
        .update({ quantity: wine.quantity, updated_at: new Date().toISOString() })
        .eq('id', wineId);
      throw eventError;
    }
    return updatedWine as Wine;
  },

  getConsumptionHistory: async (): Promise<Array<{
    id: string;
    wine_id: string;
    user_id: string;
    type: string;
    delta: number;
    source: string;
    created_at: string;
    wines: { name: string; producer?: string; vintage?: number } | null;
  }>> => {
    const { data, error } = await supabase
      .from('inventory_events')
      .select('id,wine_id,user_id,type,delta,source,created_at,wines(name,producer,vintage)')
      .eq('type', 'consume')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []) as Array<{
      id: string;
      wine_id: string;
      user_id: string;
      type: string;
      delta: number;
      source: string;
      created_at: string;
      wines: { name: string; producer?: string; vintage?: number }[] | { name: string; producer?: string; vintage?: number } | null;
    }>;

    return rows.map((row) => ({
      ...row,
      wines: Array.isArray(row.wines) ? row.wines[0] || null : row.wines
    }));
  },

  // --- SOFT DELETE & PAPIERKORB ---
  softDeleteWine: async (id: string, reason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('wines').update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
      deleted_reason: reason ?? null,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
  },

  getDeletedWines: async (): Promise<Wine[]> => {
    const { data, error } = await supabase
      .from('wines')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data as Wine[]) || [];
  },

  restoreWine: async (id: string) => {
    const { error } = await supabase.from('wines').update({
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
  },

  permanentlyDeleteWine: async (id: string) => {
    const { error } = await supabase.from('wines').delete().eq('id', id);
    if (error) throw error;
  },

  emptyTrash: async () => {
    const { error } = await supabase
      .from('wines')
      .delete()
      .not('deleted_at', 'is', null);
    if (error) throw error;
  },

  // --- EVENTS & TASTINGS ---
  getOccasions: async (): Promise<Occasion[]> => {
    const { data, error } = await supabase
      .from('occasions')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data as any[]) || []).map(normalizeOccasionRow);
  },

  getOccasionInstances: async (): Promise<OccasionInstance[]> => {
    const { data, error } = await supabase
      .from('occasion_instances')
      .select('*, occasion:occasions(*)')
      .order('instance_date', { ascending: true });
    if (error) throw error;
    return (data as any[]) || [];
  },

  getOccasionInstancesByOccasion: async (occasionId: string): Promise<OccasionInstance[]> => {
    const { data, error } = await supabase
      .from('occasion_instances')
      .select('*, occasion:occasions(*)')
      .eq('occasion_id', occasionId)
      .order('instance_date', { ascending: true });
    if (error) throw error;
    return (data as OccasionInstance[]) || [];
  },

  getOccasionWinePool: async (occasionId: string): Promise<OccasionWinePoolEntry[]> => {
    const { data, error } = await supabase
      .from('occasion_wine_pool')
      .select('*, wine:wines(*)')
      .eq('occasion_id', occasionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as OccasionWinePoolEntry[]) || [];
  },

  saveOccasionWinePool: async (
    occasionId: string,
    entries: Array<{ wine_id: string; bottles_reserved: number; priority: 'low' | 'medium' | 'high' }>
  ): Promise<OccasionWinePoolEntry[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Nicht eingeloggt.');

    const clean = entries
      .filter((entry) => !!entry.wine_id)
      .map((entry) => ({
        occasion_id: occasionId,
        user_id: user.id,
        wine_id: entry.wine_id,
        bottles_reserved: Math.max(1, Math.round(entry.bottles_reserved || 1)),
        priority: entry.priority || 'medium'
      }));

    const keepWineIds = clean.map((entry) => entry.wine_id);

    if (keepWineIds.length > 0) {
      const { error: upsertError } = await supabase
        .from('occasion_wine_pool')
        .upsert(clean, { onConflict: 'occasion_id,wine_id' });
      if (upsertError) throw upsertError;

      const { data: currentRows, error: currentError } = await supabase
        .from('occasion_wine_pool')
        .select('id,wine_id')
        .eq('occasion_id', occasionId)
        .eq('user_id', user.id);
      if (currentError) throw currentError;

      const deleteIds = (currentRows || [])
        .filter((row) => !keepWineIds.includes(row.wine_id))
        .map((row) => row.id);

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('occasion_wine_pool')
          .delete()
          .in('id', deleteIds);
        if (deleteError) throw deleteError;
      }
    } else {
      const { error: clearError } = await supabase
        .from('occasion_wine_pool')
        .delete()
        .eq('occasion_id', occasionId)
        .eq('user_id', user.id);
      if (clearError) throw clearError;
    }

    return storageService.getOccasionWinePool(occasionId);
  },

  updateInstanceWine: async (instanceId: string, wineId: string | null) => {
    const { error } = await supabase
      .from('occasion_instances')
      .update({
        wine_id: wineId,
        auto_assigned: false,
        assignment_score: null,
        assignment_reason: wineId ? 'Manuell zugeordnet' : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId);
    if (error) throw error;
  },

  updateInstanceStatus: async (instanceId: string, status: string) => {
    const { error } = await supabase
      .from('occasion_instances')
      .update({ status: status, updated_at: new Date().toISOString() })
      .eq('id', instanceId);
    if (error) throw error;
  },

  applyAutoAssignments: async (
    updates: Array<{ instanceId: string; wineId: string; score: number; reason: string }>
  ) => {
    if (updates.length === 0) return;
    for (const update of updates) {
      const { error } = await supabase
        .from('occasion_instances')
        .update({
          wine_id: update.wineId,
          auto_assigned: true,
          assignment_score: update.score,
          assignment_reason: update.reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.instanceId);
      if (error) throw error;
    }
  },

  clearAutoAssignmentsForOccasion: async (occasionId: string) => {
    const { error } = await supabase
      .from('occasion_instances')
      .update({
        wine_id: null,
        auto_assigned: false,
        assignment_score: null,
        assignment_reason: null,
        updated_at: new Date().toISOString()
      })
      .eq('occasion_id', occasionId)
      .eq('status', 'planned')
      .eq('auto_assigned', true);
    if (error) throw error;
  },

  saveOccasion: async (occ: Partial<Occasion>): Promise<Occasion> => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = removeNilValues({ ...occ, user_id: user?.id }) as Record<string, any>;
    const schemaMode = getItem(OCCASIONS_SCHEMA_MODE_KEY);
    const shouldUseLegacyPayload = schemaMode === 'legacy';
    const initialPayload = shouldUseLegacyPayload ? stripOccasionRepeatFields(payload) : payload;

    let data: any = null;
    let error: any = null;

    if (occ.id) {
      const result = await supabase.from('occasions').update(initialPayload).eq('id', occ.id).select().single();
      data = result.data;
      error = result.error;
    } else {
      // Never send id on insert; let DB default generate it.
      const insertPayload = removeNilValues({
        ...initialPayload,
        id: undefined
      });
      const result = await supabase.from('occasions').insert([insertPayload]).select().single();
      data = result.data;
      error = result.error;
    }

    // Backward-compatible fallback for distributed databases where new columns are not migrated yet.
    if (!error && !shouldUseLegacyPayload) {
      setItem(OCCASIONS_SCHEMA_MODE_KEY, 'modern');
    }

    if (error && isOccasionSchemaColumnError(error)) {
      const legacyPayload = stripOccasionRepeatFields(payload);
      setItem(OCCASIONS_SCHEMA_MODE_KEY, 'legacy');
      if (occ.id) {
        const legacyResult = await supabase
          .from('occasions')
          .update(legacyPayload)
          .eq('id', occ.id)
          .select()
          .single();
        data = legacyResult.data;
        error = legacyResult.error;
      } else {
        const legacyInsertPayload = removeNilValues({
          ...legacyPayload,
          id: undefined
        });
        const legacyResult = await supabase
          .from('occasions')
          .insert([legacyInsertPayload])
          .select()
          .single();
        data = legacyResult.data;
        error = legacyResult.error;
      }
    }

    if (error) throw error;

    const savedOcc = normalizeOccasionRow(data);
    await storageService.syncInstances(savedOcc);
    return savedOcc;
  },

  deleteOccasion: async (id: string) => {
    await supabase.from('occasions').delete().eq('id', id);
  },

  syncInstances: async (occ: Occasion) => {
    const dates = storageService.generateDates(
      occ.start_date,
      occ.end_date,
      occ.repeat_rule,
      occ.repeat_interval,
      occ.repeat_weekdays ?? undefined,
      occ.max_occurrences ?? undefined,
      occ.drink_anchor_date ?? undefined
    );

    const instances = dates.map((date) => ({
      occasion_id: occ.id,
      user_id: occ.user_id,
      instance_date: date
    }));

    const { error: upsertError } = await supabase
      .from('occasion_instances')
      .upsert(instances, {
        onConflict: 'user_id, occasion_id, instance_date',
        ignoreDuplicates: true
      });
    if (upsertError) throw upsertError;

    const { data: existing, error: existingError } = await supabase
      .from('occasion_instances')
      .select('id, instance_date, status')
      .eq('occasion_id', occ.id)
      .eq('user_id', occ.user_id);
    if (existingError) throw existingError;

    const generated = new Set(dates);
    const deletableIds = (existing || [])
      .filter((row) => !generated.has(row.instance_date) && row.status !== 'consumed')
      .map((row) => row.id);

    if (deletableIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('occasion_instances')
        .delete()
        .in('id', deletableIds);
      if (deleteError) throw deleteError;
    }
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
    const { data } = await supabase.from('tastings').select('*').eq('wine_id', wineId).order('date', { ascending: false });
    return (data as Tasting[]) || [];
  },

  addTasting: async (tasting: Partial<Tasting>): Promise<Tasting> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('tastings').insert([{ ...tasting, user_id: user?.id, date: new Date().toISOString() }]).select().single();
    if (error) throw error;
    await storageService.adjustStock(tasting.wine_id!, -1);
    return data as Tasting;
  }
};
