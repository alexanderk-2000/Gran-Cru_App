/**
 * Scanner Service — camera access and local barcode detection.
 *
 * Uses the native BarcodeDetector API (Chrome, Safari 16.4+) for barcode/QR
 * scanning. Images never leave the device.
 */

/* ---------- Types ---------- */

export interface ScanResult {
  type: 'barcode' | 'label';
  raw: string; // raw barcode value or OCR text
  name?: string;
  producer?: string;
  vintage?: number;
  queued?: boolean;
  queue_id?: string;
}

/* ---------- Camera ---------- */

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/* ---------- Barcode Detection ---------- */

const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

let detector: any = null;
function getDetector(): any {
  if (!hasBarcodeDetector) return null;
  if (!detector) {
    detector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
    });
  }
  return detector;
}

export function isBarcodeSupported(): boolean {
  return hasBarcodeDetector;
}

/**
 * Attempt to detect a barcode in the current video frame.
 * Returns the first detected barcode value or null.
 */
export async function detectBarcode(video: HTMLVideoElement): Promise<string | null> {
  const det = getDetector();
  if (!det) return null;
  try {
    const results = await det.detect(video);
    if (results.length > 0) return results[0].rawValue as string;
  } catch {
    // Detection failed — ignore
  }
  return null;
}

/**
 * Parse a raw barcode string into a scan result.
 * For now we just pass the barcode value through – wine lookup
 * happens via the local catalog after the user confirms.
 */
export function parseBarcodeResult(rawValue: string): ScanResult {
  return {
    type: 'barcode',
    raw: rawValue,
  };
}
