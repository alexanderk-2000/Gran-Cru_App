import type { CellarPocket, Occasion, OccasionInstance, OccasionWinePoolEntry, Tasting, Wine } from '../../types.ts';
import { offlineDb, createLocalId } from './offlineDb.ts';
import { isOnline } from './networkState.ts';
import { bindSyncLoop, clearOfflineUserAndQueues, queueFromNetworkFailure, runSyncCycle } from './syncEngine.ts';

const MAIN_WRITE_OPERATIONS = new Set([
  'saveWine',
  'createCellarPocket',
  'adjustStock',
  'recordPurchase',
  'recordLoss',
  'transferWine',
  'consumeBottle',
  'softDeleteWine',
  'restoreWine',
  'permanentlyDeleteWine',
  'emptyTrash',
  'saveOccasion',
  'deleteOccasion',
  'saveOccasionWinePool',
  'updateInstanceWine',
  'updateInstanceStatus',
  'applyAutoAssignments',
  'clearAutoAssignmentsForOccasion',
  'addTasting',
  'upsertWineCatalog'
]);

const MAIN_READ_OPERATIONS = new Set([
  'getWines',
  'getDeletedWines',
  'getWineById',
  'getCellarPockets',
  'getOccasions',
  'getOccasionInstances',
  'getOccasionInstancesByOccasion',
  'getOccasionWinePool',
  'getTastings',
  'getConsumptionHistory'
]);

const nowIso = () => new Date().toISOString();

const tryCurrentUser = async (backendService: any): Promise<string | null> => {
  try {
    const user = await backendService.getCurrentUser?.();
    return user?.id || null;
  } catch {
    return null;
  }
};

const normalizeWine = (wine: Partial<Wine>, userId: string): Wine => {
  const timestamp = nowIso();
  return {
    id: wine.id || createLocalId('wine'),
    user_id: wine.user_id || userId,
    name: wine.name || 'Unbenannter Wein',
    vintage: typeof wine.vintage === 'number' ? wine.vintage : new Date().getFullYear(),
    region: wine.region || 'Unbekannt',
    subcellar: wine.subcellar,
    barcode: wine.barcode || undefined,
    category: wine.category || 'Genuss',
    wine_type: wine.wine_type,
    quantity: typeof wine.quantity === 'number' ? wine.quantity : 0,
    purchase_price: typeof wine.purchase_price === 'number' ? wine.purchase_price : 0,
    market_price: typeof wine.market_price === 'number' ? wine.market_price : undefined,
    format: wine.format || '0.75L',
    drink_start: typeof wine.drink_start === 'number' ? wine.drink_start : new Date().getFullYear(),
    drink_end: typeof wine.drink_end === 'number' ? wine.drink_end : new Date().getFullYear() + 5,
    peak_year: typeof wine.peak_year === 'number' ? wine.peak_year : undefined,
    producer: wine.producer,
    appellation: wine.appellation,
    subregion: wine.subregion,
    vineyard: wine.vineyard,
    country: wine.country,
    alcohol_percent: wine.alcohol_percent,
    aromas: wine.aromas || [],
    structure: wine.structure || {},
    pairings: wine.pairings || [],
    scores: wine.scores || [],
    confidence: wine.confidence,
    missing_fields: wine.missing_fields || [],
    is_favorite: wine.is_favorite,
    wishlist: Boolean(wine.wishlist),
    ai_details: wine.ai_details,
    ai_sources: wine.ai_sources || [],
    drink_archetype: wine.drink_archetype,
    grapes: wine.grapes || [],
    maturation_profile: wine.maturation_profile,
    fermentation: wine.fermentation,
    aging_process: wine.aging_process,
    farming: wine.farming,
    closure_type: wine.closure_type,
    deleted_reason: wine.deleted_reason,
    deleted_by: wine.deleted_by,
    created_at: wine.created_at || timestamp,
    updated_at: timestamp,
    deleted_at: wine.deleted_at || null
  };
};

const upsertWineLocal = async (wine: Partial<Wine>, userId: string): Promise<Wine> => {
  const normalized = normalizeWine(wine, userId);
  await offlineDb.wines.put(normalized);
  return normalized;
};

const readLocalArray = async <T>(operation: string, args: unknown[]): Promise<T[]> => {
  switch (operation) {
    case 'getWines': {
      return (await offlineDb.wines
        .filter((wine) => !wine.deleted_at)
        .toArray()) as T[];
    }
    case 'getDeletedWines': {
      return (await offlineDb.wines
        .filter((wine) => Boolean(wine.deleted_at))
        .toArray()) as T[];
    }
    case 'getCellarPockets':
      return (await offlineDb.cellar_pockets.toArray()) as T[];
    case 'getOccasions':
      return (await offlineDb.occasions.toArray()) as T[];
    case 'getOccasionInstances':
      return (await offlineDb.occasion_instances.toArray()) as T[];
    case 'getOccasionInstancesByOccasion':
      return (await offlineDb.occasion_instances
        .where('occasion_id')
        .equals(String(args[0] || ''))
        .toArray()) as T[];
    case 'getOccasionWinePool':
      return (await offlineDb.occasion_wine_pool
        .where('occasion_id')
        .equals(String(args[0] || ''))
        .toArray()) as T[];
    case 'getTastings':
      return (await offlineDb.tastings
        .where('wine_id')
        .equals(String(args[0] || ''))
        .toArray()) as T[];
    case 'getConsumptionHistory':
      return (await offlineDb.inventory_events.toArray()) as T[];
    default:
      return [];
  }
};

const readLocalSingle = async <T>(operation: string, args: unknown[]): Promise<T | null> => {
  if (operation === 'getWineById') {
    const row = await offlineDb.wines.get(String(args[0] || ''));
    return (row as T | undefined) || null;
  }
  return null;
};

const updateLocalForWrite = async (operation: string, args: unknown[], userId: string): Promise<unknown> => {
  switch (operation) {
    case 'saveWine': {
      const payload = (args[0] || {}) as Partial<Wine>;
      return upsertWineLocal(payload, userId);
    }
    case 'createCellarPocket': {
      const name = String(args[0] || '').trim();
      if (!name) return null;
      const pocket: CellarPocket = {
        id: createLocalId('pocket'),
        user_id: userId,
        name,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      await offlineDb.cellar_pockets.put(pocket);
      return pocket;
    }
    case 'adjustStock': {
      const wineId = String(args[0] || '');
      const delta = Number(args[1] || 0);
      const context = args[2] ? String(args[2]) : 'manual';
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const updated: Wine = {
        ...wine,
        quantity: Math.max(0, (wine.quantity || 0) + delta),
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      if (delta !== 0) {
        await offlineDb.inventory_events.put({
          id: createLocalId('evt'),
          user_id: userId,
          wine_id: wineId,
          type: 'adjustment',
          delta,
          source: context,
          timestamp: nowIso()
        });
      }
      return updated;
    }
    case 'recordPurchase': {
      const purchase = (args[0] || {}) as { wine_id: string; quantity: number; price_per_bottle: number; date: string };
      const wineId = String(purchase.wine_id || '');
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const newQuantity = (wine.quantity || 0) + purchase.quantity;
      const newPrice = ((wine.purchase_price || 0) * (wine.quantity || 0) + purchase.price_per_bottle * purchase.quantity) / (newQuantity || 1);
      const updated: Wine = {
        ...wine,
        quantity: newQuantity,
        purchase_price: newPrice,
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'purchase',
        delta: purchase.quantity,
        source: 'purchase',
        note: purchase.date,
        timestamp: nowIso()
      });
      return updated;
    }
    case 'recordLoss': {
      const wineId = String(args[0] || '');
      const quantity = Number(args[1] || 0);
      const reason = args[2] ? String(args[2]) : undefined;
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const lostQuantity = Math.min(quantity, wine.quantity || 0);
      if (lostQuantity <= 0) return wine;
      const updated: Wine = {
        ...wine,
        quantity: Math.max(0, (wine.quantity || 0) - lostQuantity),
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'loss',
        delta: -lostQuantity,
        source: 'detail',
        note: reason,
        timestamp: nowIso()
      });
      return updated;
    }
    case 'transferWine': {
      const wineId = String(args[0] || '');
      const targetSubcellar = String(args[1] || '');
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const previousSubcellar = wine.subcellar || '';
      const updated: Wine = {
        ...wine,
        subcellar: targetSubcellar || undefined,
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'transfer',
        delta: 0,
        source: 'pocket',
        note: `${previousSubcellar || 'Hauptkeller'} -> ${targetSubcellar || 'Hauptkeller'}`,
        timestamp: nowIso()
      });
      return updated;
    }
    case 'consumeBottle': {
      const wineId = String(args[0] || '');
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const updated: Wine = {
        ...wine,
        quantity: Math.max(0, (wine.quantity || 0) - 1),
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'consume',
        delta: -1,
        source: args[1] || 'detail',
        timestamp: nowIso()
      });
      return updated;
    }
    case 'softDeleteWine': {
      const wineId = String(args[0] || '');
      const reason = args[1] ? String(args[1]) : undefined;
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const updated: Wine = {
        ...wine,
        deleted_at: nowIso(),
        deleted_reason: reason,
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'soft_delete',
        delta: 0,
        source: 'trash',
        note: reason,
        timestamp: nowIso()
      });
      return updated;
    }
    case 'restoreWine': {
      const wineId = String(args[0] || '');
      const wine = await offlineDb.wines.get(wineId);
      if (!wine) return null;
      const updated: Wine = {
        ...wine,
        deleted_at: null,
        deleted_reason: undefined,
        updated_at: nowIso()
      };
      await offlineDb.wines.put(updated);
      await offlineDb.inventory_events.put({
        id: createLocalId('evt'),
        user_id: userId,
        wine_id: wineId,
        type: 'restore',
        delta: 0,
        source: 'trash',
        timestamp: nowIso()
      });
      return updated;
    }
    case 'permanentlyDeleteWine': {
      const wineId = String(args[0] || '');
      await offlineDb.wines.delete(wineId);
      await offlineDb.tastings.where('wine_id').equals(wineId).delete();
      return null;
    }
    case 'emptyTrash': {
      const deleted = await offlineDb.wines.filter((wine) => Boolean(wine.deleted_at)).toArray();
      await Promise.all(deleted.map((wine) => offlineDb.wines.delete(wine.id)));
      return null;
    }
    case 'saveOccasion': {
      const payload = (args[0] || {}) as Partial<Occasion>;
      const occasion: Occasion = {
        id: payload.id || createLocalId('occ'),
        user_id: payload.user_id || userId,
        title: payload.title || 'Neuer Anlass',
        start_date: payload.start_date || nowIso().slice(0, 10),
        end_date: payload.end_date || payload.start_date || nowIso().slice(0, 10),
        drink_anchor_date: payload.drink_anchor_date || null,
        repeat_rule: payload.repeat_rule || 'none',
        repeat_interval: typeof payload.repeat_interval === 'number' ? payload.repeat_interval : 1,
        repeat_weekdays: payload.repeat_weekdays || null,
        max_occurrences: payload.max_occurrences || null,
        created_at: payload.created_at || nowIso(),
        updated_at: nowIso()
      };
      await offlineDb.occasions.put(occasion);
      return occasion;
    }
    case 'deleteOccasion': {
      const occasionId = String(args[0] || '');
      await offlineDb.occasions.delete(occasionId);
      await offlineDb.occasion_instances.where('occasion_id').equals(occasionId).delete();
      await offlineDb.occasion_wine_pool.where('occasion_id').equals(occasionId).delete();
      return null;
    }
    case 'updateInstanceWine': {
      const instanceId = String(args[0] || '');
      const wineId = args[1] ? String(args[1]) : null;
      const row = await offlineDb.occasion_instances.get(instanceId);
      if (!row) return null;
      const updated: OccasionInstance = {
        ...row,
        wine_id: wineId,
        updated_at: nowIso()
      };
      await offlineDb.occasion_instances.put(updated);
      return updated;
    }
    case 'updateInstanceStatus': {
      const instanceId = String(args[0] || '');
      const status = String(args[1] || 'planned') as OccasionInstance['status'];
      const row = await offlineDb.occasion_instances.get(instanceId);
      if (!row) return null;
      const updated: OccasionInstance = {
        ...row,
        status,
        updated_at: nowIso()
      };
      await offlineDb.occasion_instances.put(updated);
      return updated;
    }
    case 'saveOccasionWinePool': {
      const occasionId = String(args[0] || '');
      const entries = Array.isArray(args[1]) ? (args[1] as OccasionWinePoolEntry[]) : [];
      const mapped = entries.map((entry) => ({
        ...entry,
        id: entry.id || createLocalId('pool'),
        occasion_id: occasionId,
        user_id: entry.user_id || userId,
        created_at: entry.created_at || nowIso()
      }));
      await offlineDb.occasion_wine_pool.where('occasion_id').equals(occasionId).delete();
      await offlineDb.occasion_wine_pool.bulkPut(mapped);
      return mapped;
    }
    case 'addTasting': {
      const payload = (args[0] || {}) as Partial<Tasting>;
      const tasting: Tasting = {
        id: payload.id || createLocalId('tasting'),
        wine_id: payload.wine_id || '',
        user_id: payload.user_id || userId,
        date: payload.date || nowIso(),
        rating: payload.rating || 0,
        note: payload.note || ''
      };
      await offlineDb.tastings.put(tasting);
      return tasting;
    }
    default:
      return null;
  }
};

const callWithOfflineWriteQueue = async (params: {
  backendService: any;
  userId: string;
  operation: string;
  args: unknown[];
  localResult: unknown;
}): Promise<unknown> => {
  const fn = params.backendService[params.operation];
  const dedupe = `${params.operation}:${String(params.args[0] || 'none')}`;

  if (!isOnline()) {
    await queueFromNetworkFailure({
      backendService: params.backendService,
      userId: params.userId,
      operation: {
        entity: params.operation,
        operation: params.operation,
        args: params.args,
        dedupe_key: dedupe
      },
      originalError: new Error('offline')
    });
    return params.localResult;
  }

  try {
    const response = await fn(...params.args);

    if (params.operation === 'saveWine' && response?.id) {
      await offlineDb.wines.put(response as Wine);
    }
    if (params.operation === 'createCellarPocket' && response?.id) {
      await offlineDb.cellar_pockets.put(response as CellarPocket);
    }
    if (params.operation === 'addTasting' && response?.id) {
      await offlineDb.tastings.put(response as Tasting);
    }
    if (params.operation === 'saveOccasion' && response?.id) {
      await offlineDb.occasions.put(response as Occasion);
    }

    void runSyncCycle(params.backendService);
    return response;
  } catch (error) {
    await queueFromNetworkFailure({
      backendService: params.backendService,
      userId: params.userId,
      operation: {
        entity: params.operation,
        operation: params.operation,
        args: params.args,
        dedupe_key: dedupe
      },
      originalError: error
    });
    return params.localResult;
  }
};

export const createStorageOfflineAdapter = <T extends Record<string, unknown>>(backendService: T): T => {
  bindSyncLoop(backendService);

  return new Proxy(backendService, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof original !== 'function') {
        return original;
      }
      const originalFn = original as (...args: unknown[]) => unknown;

      if (MAIN_READ_OPERATIONS.has(property)) {
        return async (...args: unknown[]) => {
          if (property === 'getWineById') {
            const localSingle = await readLocalSingle<any>(property, args);
            if (!isOnline() || localSingle) {
              return localSingle;
            }
            return originalFn(...args);
          }

          if (!isOnline()) {
            return readLocalArray<any>(property, args);
          }

          try {
            const response = await originalFn(...args);
            if (property === 'getWines') {
              await offlineDb.wines.bulkPut((response as Wine[]).filter(Boolean));
            }
            if (property === 'getDeletedWines') {
              await offlineDb.wines.bulkPut((response as Wine[]).filter(Boolean));
            }
            if (property === 'getCellarPockets') {
              await offlineDb.cellar_pockets.bulkPut((response as CellarPocket[]).filter(Boolean));
            }
            if (property === 'getOccasions') {
              await offlineDb.occasions.bulkPut((response as Occasion[]).filter(Boolean));
            }
            if (property === 'getOccasionInstances') {
              await offlineDb.occasion_instances.bulkPut((response as OccasionInstance[]).filter(Boolean));
            }
            if (property === 'getOccasionWinePool') {
              await offlineDb.occasion_wine_pool.bulkPut((response as OccasionWinePoolEntry[]).filter(Boolean));
            }
            if (property === 'getTastings') {
              await offlineDb.tastings.bulkPut((response as Tasting[]).filter(Boolean));
            }
            if (property === 'getConsumptionHistory') {
              const mapped = (response as Array<Record<string, unknown>>).map((entry) => ({
                id: String(entry.id || createLocalId('evt')),
                ...entry
              }));
              await offlineDb.inventory_events.bulkPut(mapped);
            }

            return response;
          } catch {
            return readLocalArray<any>(property, args);
          }
        };
      }

      if (MAIN_WRITE_OPERATIONS.has(property)) {
        return async (...args: unknown[]) => {
          const userId = await tryCurrentUser(target);
          if (!userId) {
            return originalFn(...args);
          }

          const localResult = await updateLocalForWrite(property, args, userId);
          return callWithOfflineWriteQueue({
            backendService: target,
            userId,
            operation: property,
            args,
            localResult
          });
        };
      }

      if (property === 'logout') {
        return async (...args: unknown[]) => {
          const userId = await tryCurrentUser(target);
          if (userId) {
            await clearOfflineUserAndQueues(userId);
          }
          return originalFn(...args);
        };
      }

      return (...args: unknown[]) => originalFn(...args);
    }
  }) as T;
};
