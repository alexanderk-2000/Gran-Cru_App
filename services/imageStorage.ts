
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { requireUid, storage } from './firebase.ts';

export type ImageSlot = 'bottle' | 'label' | 'case';

const MAX_WIDTH = 1200;
const QUALITY = 0.82;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB before compression

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
  return `users/${userId}/wine-images/${wineId}/${slot}`;
}

/** deleteObject() rejects for missing files; deleting a missing image is a no-op here. */
async function deleteIfExists(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    if ((error as { code?: string })?.code !== 'storage/object-not-found') throw error;
  }
}

export const imageStorageService = {
  /**
   * Upload a wine image. Compresses before upload.
   * Returns a download URL for the uploaded image.
   */
  async upload(wineId: string, slot: ImageSlot, file: File): Promise<string> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Datei ist zu groß (max. ${MAX_FILE_SIZE / 1024 / 1024} MB).`);
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Nur Bilddateien sind erlaubt.');
    }

    const userId = await requireUid();
    const compressed = await compressImage(file);
    const path = buildPath(userId, wineId, slot);

    try {
      // Storage rules only allow the owner to read/write below users/{uid}/.
      // The download URL carries an unguessable token and does not expire.
      await uploadBytes(ref(storage, path), compressed, {
        contentType: compressed.type || 'image/webp',
        cacheControl: 'private, max-age=31536000'
      });
      return await getDownloadURL(ref(storage, path));
    } catch (error) {
      throw new Error(`Upload fehlgeschlagen: ${(error as Error)?.message ?? 'unbekannter Fehler'}`);
    }
  },

  /**
   * Delete a wine image from storage.
   */
  async delete(wineId: string, slot: ImageSlot): Promise<void> {
    const userId = await requireUid();
    try {
      await deleteIfExists(buildPath(userId, wineId, slot));
    } catch (error) {
      throw new Error(`Löschen fehlgeschlagen: ${(error as Error)?.message ?? 'unbekannter Fehler'}`);
    }
  },

  /**
   * Delete all images for a wine.
   */
  async deleteAll(wineId: string): Promise<void> {
    const userId = await requireUid();
    const slots: ImageSlot[] = ['bottle', 'label', 'case'];
    await Promise.all(slots.map((slot) => deleteIfExists(buildPath(userId, wineId, slot)).catch(() => undefined)));
  },

  /**
   * Extract current image URLs from wine ai_details.
   */
  getImagesFromWine(wine: { ai_details?: any }): Record<ImageSlot, string | null> {
    const images = wine?.ai_details?.app?.images;
    return {
      bottle: images?.bottle || null,
      label: images?.label || null,
      case: images?.case || null
    };
  },

  /**
   * Merge a new image URL into the ai_details.app.images object.
   * Returns the updated ai_details.
   */
  mergeImageUrl(
    aiDetails: Record<string, any> | undefined | null,
    slot: ImageSlot,
    url: string | null
  ): Record<string, any> {
    const details = { ...(aiDetails || {}) };
    if (!details.app) details.app = {};
    if (!details.app.images) details.app.images = {};

    if (url) {
      details.app.images[slot] = url;
    } else {
      delete details.app.images[slot];
    }

    return details;
  }
};
