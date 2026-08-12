
import { supabase } from './supabase.ts';

export type ImageSlot = 'bottle' | 'label' | 'case';

const BUCKET = 'wine-images';
const MAX_WIDTH = 1200;
const QUALITY = 0.82;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB before compression
// The bucket is private (see 20260722000032_private_wine_images_bucket.sql),
// so every displayable image URL is a signed link. This TTL only bounds a
// single signed URL's lifetime, not how long the photo stays viewable - see
// the storage note below for why those are no longer the same thing.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

// A signed URL is minted once and then stored verbatim in ai_details, it goes
// dead a year later with no renewal path - the photo silently stops loading
// and nothing in the app notices. What actually needs to persist is only
// "does this wine have a bottle/label/case photo", because the storage path
// itself is fully deterministic from (user, wine, slot) - see buildPath.
// ai_details.app.images[slot] therefore now holds a boolean flag, and a fresh
// signed URL is minted every time the photo is about to be displayed.
//
// Backward compatible on read: an old record still has the slot set to the
// signed-URL *string* it was saved with. Any truthy value - string or
// boolean - means "present, (re-)sign it now", so existing photos start
// working past their original year without a migration script; they just
// start being re-signed like everything else the next time they're shown.
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const URL_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Compress an image file using Canvas API.
 * Outputs WebP (with JPEG fallback for older Safari).
 */
async function compressImage(file: File, maxWidth = MAX_WIDTH): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context nicht verfügbar.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, then fall back to JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback to JPEG
            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) resolve(jpegBlob);
                else reject(new Error('Bildkomprimierung fehlgeschlagen.'));
              },
              'image/jpeg',
              0.85
            );
          }
        },
        'image/webp',
        QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Bild konnte nicht geladen werden.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Build the storage path for a wine image.
 */
function buildPath(userId: string, wineId: string, slot: ImageSlot): string {
  return `${userId}/${wineId}/${slot}`;
}

/**
 * Get the current user id, or throw.
 */
async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt.');
  return user.id;
}

export const imageStorageService = {
  /**
   * Upload a wine image. Compresses before upload.
   * Returns a signed URL for the uploaded image.
   */
  async upload(wineId: string, slot: ImageSlot, file: File): Promise<string> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Datei ist zu groß (max. ${MAX_FILE_SIZE / 1024 / 1024} MB).`);
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Nur Bilddateien sind erlaubt.');
    }

    const userId = await requireUserId();
    const compressed = await compressImage(file);
    const path = buildPath(userId, wineId, slot);

    // Delete existing file first (upsert is not reliable on storage)
    await supabase.storage.from(BUCKET).remove([path]);

    const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
      contentType: compressed.type || 'image/webp',
      upsert: true,
      cacheControl: '31536000' // 1 year cache
    });

    if (error) {
      throw new Error(`Upload fehlgeschlagen: ${error.message}`);
    }

    urlCache.delete(path);
    return imageStorageService.getSignedUrl(wineId, userId, slot);
  },

  /**
   * Delete a wine image from storage.
   */
  async delete(wineId: string, slot: ImageSlot): Promise<void> {
    const userId = await requireUserId();
    const path = buildPath(userId, wineId, slot);

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
    }
    urlCache.delete(path);
  },

  /**
   * Delete all images for a wine.
   */
  async deleteAll(wineId: string): Promise<void> {
    const userId = await requireUserId();
    const slots: ImageSlot[] = ['bottle', 'label', 'case'];
    const paths = slots.map(slot => buildPath(userId, wineId, slot));

    await supabase.storage.from(BUCKET).remove(paths);
    for (const path of paths) urlCache.delete(path);
  },

  /**
   * Mint a signed URL for a wine image slot. The bucket is private, so this
   * requires the caller's own session to have SELECT rights on the path
   * (owner-scoped RLS policy) - only the uploading user can ever create a
   * working link in the first place.
   */
  async getSignedUrl(wineId: string, userId: string, slot: ImageSlot): Promise<string> {
    const path = buildPath(userId, wineId, slot);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`Signierte URL konnte nicht erstellt werden: ${error?.message ?? 'unbekannter Fehler'}`);
    }
    return data.signedUrl;
  },

  /**
   * True/false per slot, straight from ai_details - no network call. Use this
   * where only presence matters (e.g. deciding whether to bother resolving
   * URLs at all); use resolveImageUrls() to get something to put in <img src>.
   */
  getImageFlags(wine: { ai_details?: any }): Record<ImageSlot, boolean> {
    const images = wine?.ai_details?.app?.images;
    return {
      bottle: Boolean(images?.bottle),
      label: Boolean(images?.label),
      case: Boolean(images?.case)
    };
  },

  /**
   * Resolves every slot that has a photo to a signed URL, minted fresh (or
   * served from the in-memory cache) rather than read back from storage - see
   * the module comment on why a stored URL was the wrong thing to persist.
   * Slots without a photo resolve to null without any network call.
   */
  async resolveImageUrls(wine: { id: string; user_id: string; ai_details?: any }): Promise<Record<ImageSlot, string | null>> {
    const flags = imageStorageService.getImageFlags(wine);
    const slots: ImageSlot[] = ['bottle', 'label', 'case'];

    const entries = await Promise.all(
      slots.map(async (slot): Promise<[ImageSlot, string | null]> => {
        if (!flags[slot]) return [slot, null];

        const path = buildPath(wine.user_id, wine.id, slot);
        const cached = urlCache.get(path);
        if (cached && cached.expiresAt > Date.now()) return [slot, cached.url];

        try {
          const url = await imageStorageService.getSignedUrl(wine.id, wine.user_id, slot);
          urlCache.set(path, { url, expiresAt: Date.now() + URL_CACHE_TTL_MS });
          return [slot, url];
        } catch {
          // A dangling flag with a missing/inaccessible file shouldn't break
          // the whole page - it just renders as "no photo" for that slot.
          return [slot, null];
        }
      })
    );

    return Object.fromEntries(entries) as Record<ImageSlot, string | null>;
  },

  /**
   * Sets or clears the presence flag for a slot in ai_details.app.images.
   * Returns the updated ai_details.
   */
  setImagePresence(
    aiDetails: Record<string, any> | undefined | null,
    slot: ImageSlot,
    present: boolean
  ): Record<string, any> {
    const details = { ...(aiDetails || {}) };
    if (!details.app) details.app = {};
    if (!details.app.images) details.app.images = {};

    if (present) {
      details.app.images[slot] = true;
    } else {
      delete details.app.images[slot];
    }

    return details;
  }
};
