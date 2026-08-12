// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } });

vi.mock('../../services/supabase.ts', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: (...args: unknown[]) => createSignedUrl(...args) }) },
    auth: { getUser: () => getUser() }
  }
}));

const { imageStorageService } = await import('../../services/imageStorage.ts');

let wineCounter = 0;
// Each call gets its own wine id so the module-level URL cache (keyed by the
// deterministic user/wine/slot path) never lets one test's result leak into
// another's assertions.
const wine = (images: Record<string, unknown> = {}) => ({
  id: `wine-${++wineCounter}`,
  user_id: 'user-1',
  ai_details: { app: { images } }
});

afterEach(() => {
  createSignedUrl.mockReset();
});

describe('getImageFlags', () => {
  it('reads presence without any network call', () => {
    expect(imageStorageService.getImageFlags(wine({ bottle: true }))).toEqual({
      bottle: true,
      label: false,
      case: false
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('treats a missing ai_details as no photos', () => {
    expect(imageStorageService.getImageFlags({})).toEqual({ bottle: false, label: false, case: false });
  });
});

describe('setImagePresence', () => {
  it('sets a flag rather than storing a URL', () => {
    const details = imageStorageService.setImagePresence({}, 'bottle', true);
    expect(details.app.images.bottle).toBe(true);
  });

  it('clears a flag on removal', () => {
    const withFlag = imageStorageService.setImagePresence({}, 'bottle', true);
    const cleared = imageStorageService.setImagePresence(withFlag, 'bottle', false);
    expect(cleared.app.images.bottle).toBeUndefined();
  });
});

describe('resolveImageUrls', () => {
  it('skips the network entirely for slots without a photo', async () => {
    const resolved = await imageStorageService.resolveImageUrls(wine());
    expect(resolved).toEqual({ bottle: null, label: null, case: null });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  // The regression this guards: a signed URL used to be stored verbatim and
  // went dead a year later with no renewal path. The path is deterministic
  // from (user, wine, slot), so a fresh URL is minted every time instead.
  it('mints a fresh signed URL for a flagged slot', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/bottle' }, error: null });
    const w = wine({ bottle: true });

    const resolved = await imageStorageService.resolveImageUrls(w);

    expect(resolved.bottle).toBe('https://signed.example/bottle');
    expect(createSignedUrl).toHaveBeenCalledWith(`${w.user_id}/${w.id}/bottle`, expect.any(Number));
  });

  // Old records still have the slot set to the signed-URL string itself
  // (pre-migration shape). Any truthy value must be treated as "present" so
  // those photos start working again without a backfill script.
  it('treats a legacy stored URL string as a presence flag, not the URL to use', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/fresh' }, error: null });

    const resolved = await imageStorageService.resolveImageUrls(
      wine({ bottle: 'https://old-expired-url.example/bottle?token=stale' })
    );

    expect(resolved.bottle).toBe('https://signed.example/fresh');
  });

  it('caches a resolved URL instead of re-signing on every call', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/bottle' }, error: null });
    const w = wine({ bottle: true });

    await imageStorageService.resolveImageUrls(w);
    await imageStorageService.resolveImageUrls(w);

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('resolves a flagged slot to null instead of throwing when signing fails', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const resolved = await imageStorageService.resolveImageUrls(wine({ bottle: true }));

    expect(resolved.bottle).toBeNull();
  });
});
