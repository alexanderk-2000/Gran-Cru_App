import { describe, expect, it } from 'vitest';
import { applyDeterministicAssignment, maturityFit } from '../../domain/enjoymentPlan/autoAssignment.ts';
import type { OccasionInstance, OccasionWinePoolEntry, Wine } from '../../types.ts';

const currentYear = new Date().getFullYear();

const makeWine = (overrides: Partial<Wine>): Wine => ({
  id: overrides.id ?? 'wine-1',
  user_id: 'user-1',
  name: 'Chateau Test',
  vintage: 2018,
  region: 'Bordeaux',
  category: 'Genuss',
  quantity: 5,
  purchase_price: 20,
  format: '0.75L',
  drink_start: currentYear - 1,
  drink_end: currentYear + 1,
  wishlist: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides
});

const makeInstance = (overrides: Partial<OccasionInstance>): OccasionInstance => ({
  id: overrides.id ?? 'instance-1',
  occasion_id: 'occasion-1',
  user_id: 'user-1',
  instance_date: `${currentYear}-06-01`,
  wine_id: null,
  status: 'planned',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides
});

const makePoolRow = (overrides: Partial<OccasionWinePoolEntry>): OccasionWinePoolEntry => ({
  id: overrides.id ?? 'pool-1',
  occasion_id: 'occasion-1',
  user_id: 'user-1',
  wine_id: overrides.wine_id ?? 'wine-1',
  bottles_reserved: 1,
  priority: 'medium',
  created_at: '2024-01-01T00:00:00.000Z',
  ...overrides
});

describe('maturityFit', () => {
  it('returns -1 for a wine with no drinking window when unknowns are disallowed', () => {
    const wine = makeWine({ drink_start: undefined, drink_end: undefined });
    expect(maturityFit(`${currentYear}-01-01`, wine, false)).toBe(-1);
  });

  it('returns a moderate fit for an unknown window when unknowns are allowed', () => {
    const wine = makeWine({ drink_start: undefined, drink_end: undefined });
    expect(maturityFit(`${currentYear}-01-01`, wine, true)).toBeCloseTo(0.35);
  });

  it('scores higher inside the drinking window than far outside it', () => {
    const wine = makeWine({ drink_start: currentYear - 1, drink_end: currentYear + 1 });
    const inWindow = maturityFit(`${currentYear}-01-01`, wine, false);
    const farPast = maturityFit(`${currentYear + 6}-01-01`, wine, false);
    expect(inWindow).toBeGreaterThan(farPast);
  });

  it('excludes a wine whose window is too far in the past or future', () => {
    const wine = makeWine({ drink_start: currentYear - 1, drink_end: currentYear + 1 });
    expect(maturityFit(`${currentYear + 20}-01-01`, wine, false)).toBe(-1);
  });
});

describe('applyDeterministicAssignment', () => {
  it('assigns the only pool wine to a single open instance', () => {
    const wine = makeWine({ id: 'wine-1' });
    const instance = makeInstance({ id: 'instance-1' });
    const pool = [makePoolRow({ wine_id: 'wine-1', bottles_reserved: 1 })];

    const result = applyDeterministicAssignment([wine], [instance], pool, { allowUnknown: false, preferRare: false, preferDaily: false });

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]).toMatchObject({ instanceId: 'instance-1', wineId: 'wine-1' });
  });

  it('never exceeds the reserved bottle count for a pool entry', () => {
    const wine = makeWine({ id: 'wine-1', quantity: 5 });
    const instances = [
      makeInstance({ id: 'a', instance_date: `${currentYear}-01-01` }),
      makeInstance({ id: 'b', instance_date: `${currentYear}-02-01` }),
      makeInstance({ id: 'c', instance_date: `${currentYear}-03-01` })
    ];
    const pool = [makePoolRow({ wine_id: 'wine-1', bottles_reserved: 2 })];

    const result = applyDeterministicAssignment([wine], instances, pool, { allowUnknown: false, preferRare: false, preferDaily: false });

    expect(result.selected.filter((entry) => entry.wineId === 'wine-1')).toHaveLength(2);
  });

  it('leaves locked (manually assigned) instances untouched and counts them against the usage limit', () => {
    const wine = makeWine({ id: 'wine-1', quantity: 5 });
    const locked = makeInstance({ id: 'locked', wine_id: 'wine-1', auto_assigned: false });
    const open = makeInstance({ id: 'open', instance_date: `${currentYear}-02-01` });
    const pool = [makePoolRow({ wine_id: 'wine-1', bottles_reserved: 1 })];

    const result = applyDeterministicAssignment([wine], [locked, open], pool, { allowUnknown: false, preferRare: false, preferDaily: false });

    expect(result.selected.some((entry) => entry.instanceId === 'locked')).toBe(false);
    expect(result.selected.some((entry) => entry.instanceId === 'open')).toBe(false);
  });

  it('prefers a different wine over repeating the most recently used one when both fit', () => {
    const wineA = makeWine({ id: 'wine-a' });
    const wineB = makeWine({ id: 'wine-b' });
    const priorInstance = makeInstance({ id: 'prior', instance_date: `${currentYear}-01-01`, wine_id: 'wine-a', auto_assigned: false });
    const nextInstance = makeInstance({ id: 'next', instance_date: `${currentYear}-01-08` });
    const pool = [
      makePoolRow({ wine_id: 'wine-a', bottles_reserved: 5 }),
      makePoolRow({ wine_id: 'wine-b', bottles_reserved: 5 })
    ];

    const result = applyDeterministicAssignment([wineA, wineB], [priorInstance, nextInstance], pool, {
      allowUnknown: false,
      preferRare: false,
      preferDaily: false
    });

    const nextAssignment = result.selected.find((entry) => entry.instanceId === 'next');
    expect(nextAssignment?.wineId).toBe('wine-b');
  });
});
