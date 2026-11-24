import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signOut } from 'firebase/auth';
import { auth } from '../../services/firebase.ts';
import { storageService } from '../../services/storage.legacy.ts';
import { settingsService } from '../../services/settings.ts';
import { PRE_SEED_WINES } from '../../constants.ts';
import type { Wine } from '../../types.ts';

// End-to-end check of the Firestore storage service against the emulator:
// the same calls the app makes, including the cascades and the catalog
// sync that Postgres triggers/foreign keys used to handle.

let uid = '';

beforeAll(async () => {
  const user = await storageService.signInAnonymously();
  uid = user.uid;
});

afterAll(async () => {
  await signOut(auth);
});

const newWine = (overrides: Partial<Wine> = {}): Partial<Wine> => ({
  name: 'Barolo Riserva Monprivato',
  producer: 'Giuseppe Mascarello',
  vintage: 2016,
  region: 'Piemont',
  quantity: 6,
  purchase_price: 80,
  drink_start: 2026,
  drink_end: 2045,
  wishlist: false,
  ...overrides
});

describe('storageService on Firestore', () => {
  it('signs in anonymously and seeds the demo cellar once', async () => {
    expect(uid).toBeTruthy();
    const current = await storageService.getCurrentUser();
    expect(current?.id).toBe(uid);

    const wines = await storageService.getWines();
    expect(wines).toHaveLength(PRE_SEED_WINES.length);

    await storageService.seedIfNewUser(uid);
    expect(await storageService.getWines()).toHaveLength(PRE_SEED_WINES.length);
  });

  it('creates a wine with defaults, a purchase event and a catalog entry', async () => {
    const saved = await storageService.saveWine(newWine());
    expect(saved.id).toBeTruthy();
    expect(saved.user_id).toBe(uid);
    expect(saved.deleted_at).toBeNull();
    expect(saved.ai_details).toEqual({});

    const fetched = await storageService.getWineById(saved.id);
    expect(fetched?.quantity).toBe(6);

    const catalogHit = await storageService.findWineInCatalog({
      name: 'Barolo Riserva Monprivato',
      producer: 'Giuseppe Mascarello',
      vintage: 2016
    });
    expect(catalogHit?.producer).toBe('Giuseppe Mascarello');

    const fuzzyHit = await storageService.findWineInCatalog({ name: 'Barolo Monprivato Riserva', vintage: 2016 });
    expect(fuzzyHit?.name).toBe('Barolo Riserva Monprivato');

    expect(await storageService.findWineInCatalog({ name: 'Completely Different Sauvignon' })).toBeNull();
  });

  it('tracks stock changes through inventory events', async () => {
    const wine = await storageService.saveWine(newWine({ name: 'Riesling GG Kirchenstück', producer: 'Bürklin-Wolf', quantity: 3 }));

    const consumed = await storageService.consumeBottle(wine.id);
    expect(consumed.quantity).toBe(2);

    const adjusted = await storageService.adjustStock(wine.id, 2, 'manual');
    expect(adjusted?.quantity).toBe(4);

    const purchased = await storageService.recordPurchase({ wine_id: wine.id, quantity: 4, price_per_bottle: 40, date: '2026-11-01' });
    expect(purchased?.quantity).toBe(8);
    expect(purchased?.purchase_price).toBeCloseTo(60);

    const lost = await storageService.recordLoss(wine.id, 1, 'Korkfehler');
    expect(lost.quantity).toBe(7);

    const edited = await storageService.saveWine({ ...lost, quantity: 5 });
    expect(edited.quantity).toBe(5);

    const history = await storageService.getConsumptionHistory();
    const entry = history.find((row) => row.wine_id === wine.id);
    expect(entry?.wines?.name).toBe('Riesling GG Kirchenstück');

    const since = await storageService.getConsumptionHistorySince('2000-01-01T00:00:00.000Z');
    expect(since.some((row) => row.wine_id === wine.id)).toBe(true);
  });

  it('moves wines through the trash and cascades hard deletes', async () => {
    const wine = await storageService.saveWine(newWine({ name: 'Trash Candidate', producer: 'Test' }));
    await storageService.addTasting({ wine_id: wine.id, rating: 90, note: 'gut' });
    expect(await storageService.getTastings(wine.id)).toHaveLength(1);

    await storageService.softDeleteWine(wine.id, 'Test');
    expect(await storageService.getWineById(wine.id)).toBeNull();
    expect((await storageService.getDeletedWines()).map((w) => w.id)).toContain(wine.id);

    await storageService.restoreWine(wine.id);
    expect(await storageService.getWineById(wine.id)).not.toBeNull();

    await storageService.softDeleteWine(wine.id);
    await storageService.emptyTrash();
    expect(await storageService.getDeletedWines()).toHaveLength(0);
    expect(await storageService.getTastings(wine.id)).toHaveLength(0);
    const ids = await storageService.getSyncReconciliationIds();
    expect(ids.wines).not.toContain(wine.id);
  });

  it('manages occasions, generated instances and the wine pool', async () => {
    const [wine] = await storageService.getWines();
    const occasion = await storageService.saveOccasion({
      title: 'Wochenende',
      start_date: '2027-01-01',
      end_date: '2027-03-31',
      repeat_rule: 'monthly',
      repeat_interval: 1
    });
    expect(occasion.id).toBeTruthy();

    let instances = await storageService.getOccasionInstancesByOccasion(occasion.id);
    expect(instances.map((i) => i.instance_date)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
    expect(instances[0].occasion?.title).toBe('Wochenende');

    // Re-saving with a shorter range drops the surplus instance only.
    await storageService.saveOccasion({ ...occasion, end_date: '2027-02-15' });
    instances = await storageService.getOccasionInstancesByOccasion(occasion.id);
    expect(instances).toHaveLength(2);

    await storageService.updateInstanceWine(instances[0].id, wine.id);
    await storageService.applyAutoAssignments([{ instanceId: instances[1].id, wineId: wine.id, score: 0.9, reason: 'auto' }]);
    await storageService.clearAutoAssignmentsForOccasion(occasion.id);
    instances = await storageService.getOccasionInstancesByOccasion(occasion.id);
    expect(instances.find((i) => i.id === instances[0].id)?.wine_id).toBe(wine.id);
    expect(instances.find((i) => i.auto_assigned)).toBeUndefined();

    const pool = await storageService.saveOccasionWinePool(occasion.id, [
      { wine_id: wine.id, bottles_reserved: 2, priority: 'high' }
    ]);
    expect(pool).toHaveLength(1);
    expect(pool[0].wine?.id).toBe(wine.id);

    const emptied = await storageService.saveOccasionWinePool(occasion.id, []);
    expect(emptied).toHaveLength(0);

    const allInstances = await storageService.getOccasionInstances();
    expect(allInstances.some((i) => i.occasion_id === occasion.id && i.occasion?.title === 'Wochenende')).toBe(true);

    await storageService.deleteOccasion(occasion.id);
    expect(await storageService.getOccasionInstancesByOccasion(occasion.id)).toHaveLength(0);
    expect((await storageService.getOccasions()).map((o) => o.id)).not.toContain(occasion.id);
  });

  it('keeps cellar pocket names unique', async () => {
    const first = await storageService.createCellarPocket('Weinkühlschrank');
    const second = await storageService.createCellarPocket('Weinkühlschrank');
    expect(second?.id).toBe(first?.id);
    expect((await storageService.getCellarPockets()).filter((p) => p.name === 'Weinkühlschrank')).toHaveLength(1);
  });

  it('serves delta queries by updated_at cursor', async () => {
    const cursor = new Date().toISOString();
    // The cursor comparison is strict (>), so step past the cursor's millisecond.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const wine = await storageService.saveWine(newWine({ name: 'Delta Wine', producer: 'Cursor' }));
    const changed = await storageService.getWinesUpdatedSince(cursor);
    expect(changed.map((w) => w.id)).toEqual([wine.id]);
  });

  it('persists user settings in Firestore', async () => {
    const initial = await settingsService.getUserSettings();
    expect(initial?.user_id).toBe(uid);
    const updated = await settingsService.updateSettings({ openrouter_model: 'test/model' });
    expect(updated.openrouter_model).toBe('test/model');
    localStorage.clear();
    const reloaded = await settingsService.getUserSettings();
    expect(reloaded?.openrouter_model).toBe('test/model');
  });
});
