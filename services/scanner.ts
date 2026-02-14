/**
 * Scanner Service — Camera access, barcode detection, and label OCR.
 *
 * Uses the native BarcodeDetector API (Chrome, Safari 16.4+) for barcode/QR
 * scanning, and the server-side Gemini Vision proxy for label OCR.
 */

import { enqueueAiQueueItem } from './pwa/aiQueue.ts';
import { isOnline } from './pwa/networkState.ts';
import { storageService } from './storage.ts';

/* ---------- Types ---------- */

export interface ScanResult {
    type: 'barcode' | 'label';
    raw: string;           // raw barcode value or OCR text
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

/* ---------- Capture frame as Blob ---------- */

export function captureFrame(video: HTMLVideoElement): Blob | null {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    // Synchronous toBlob via dataURL conversion
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
}

export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // strip data:... prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/* ---------- Label OCR via server ---------- */

const API_BASE = '';

export async function analyzeLabel(imageBlob: Blob): Promise<ScanResult> {
    const base64 = await blobToBase64(imageBlob);
    const payload = { image: base64, mimeType: imageBlob.type || 'image/jpeg' } as const;

    if (!isOnline()) {
        const user = await storageService.getCurrentUser?.();
        if (!user?.id) {
            throw new Error('Offline-Queue benötigt eine aktive Session.');
        }

        const queued = await enqueueAiQueueItem({
            userId: user.id,
            operation: 'vision',
            endpoint: '/api/ai/vision',
            payload: payload as unknown as Record<string, unknown>
        });

        return {
            type: 'label',
            raw: 'Scanner-Analyse wurde offline gespeichert.',
            queued: true,
            queue_id: queued.id
        };
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}/api/ai/vision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        const user = await storageService.getCurrentUser?.();
        if (!user?.id) throw error;

        const queued = await enqueueAiQueueItem({
            userId: user.id,
            operation: 'vision',
            endpoint: '/api/ai/vision',
            payload: payload as unknown as Record<string, unknown>
        });

        return {
            type: 'label',
            raw: 'Scanner-Analyse konnte nicht gesendet werden und wurde in die Queue gelegt.',
            queued: true,
            queue_id: queued.id
        };
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        throw new Error(err.error || `Vision API Fehler: ${res.status}`);
    }

    const data = await res.json();
    return {
        type: 'label',
        raw: data.raw || '',
        name: data.name || undefined,
        producer: data.producer || undefined,
        vintage: data.vintage ? Number(data.vintage) : undefined,
    };
}

/**
 * Parse a raw barcode string into a scan result.
 * For now we just pass the barcode value through – wine lookup
 * happens via the AI pipeline after the user confirms.
 */
export function parseBarcodeResult(rawValue: string): ScanResult {
    return {
        type: 'barcode',
        raw: rawValue,
    };
}
