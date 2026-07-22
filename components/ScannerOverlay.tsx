import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanBarcode, X, Aperture, Loader2 } from 'lucide-react';
import {
    startCamera,
    stopCamera,
    detectBarcode,
    isBarcodeSupported,
    parseBarcodeResult,
    type ScanResult,
} from '../services/scanner.ts';

interface ScannerOverlayProps {
    open: boolean;
    onClose: () => void;
    onResult: (result: ScanResult) => void;
}

export const ScannerOverlay: React.FC<ScannerOverlayProps> = ({ open, onClose, onResult }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<number | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cameraReady, setCameraReady] = useState(false);

    // Start camera when overlay opens
    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setCameraReady(false);
        setError(null);

        (async () => {
            try {
                if (!videoRef.current) return;
                const stream = await startCamera(videoRef.current);
                if (cancelled) {
                    stopCamera(stream);
                    return;
                }
                streamRef.current = stream;
                setCameraReady(true);
            } catch (err: any) {
                if (!cancelled) {
                    setError(
                        err?.name === 'NotAllowedError'
                            ? 'Kamera-Zugriff verweigert. Bitte erlauben Sie den Kamerastand in den Browsereinstellungen.'
                            : 'Kamera konnte nicht gestartet werden.'
                    );
                }
            }
        })();

        return () => {
            cancelled = true;
            stopCamera(streamRef.current);
            streamRef.current = null;
            setCameraReady(false);
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
        };
    }, [open]);

    // Barcode auto-detection loop
    useEffect(() => {
        if (!cameraReady || !isBarcodeSupported()) return;

        const interval = window.setInterval(async () => {
            if (!videoRef.current) return;
            const value = await detectBarcode(videoRef.current);
            if (value) {
                // Stop scanning once we find something
                if (scanIntervalRef.current) {
                    clearInterval(scanIntervalRef.current);
                    scanIntervalRef.current = null;
                }
                onResult(parseBarcodeResult(value));
            }
        }, 300);

        scanIntervalRef.current = interval;
        return () => {
            clearInterval(interval);
            scanIntervalRef.current = null;
        };
    }, [cameraReady, onResult]);

    const handleCapture = useCallback(async () => {
        if (!videoRef.current || isLoading) return;
        setIsLoading(true);
        setError(null);

        try {
            const value = await detectBarcode(videoRef.current);
            if (value) {
                onResult(parseBarcodeResult(value));
            } else {
                setError('Kein Barcode erkannt. Versuchen Sie es erneut oder erfassen Sie den Wein manuell.');
            }
        } catch (err: any) {
            setError(err?.message || 'Scan fehlgeschlagen.');
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, onResult]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
            {/* Top bar */}
            <div className="relative z-10 flex items-center justify-between px-4 py-3">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                >
                    <X className="h-4 w-4" /> Schließen
                </button>

                <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                    <ScanBarcode className="h-3.5 w-3.5" /> Lokaler Barcode-Scan
                </div>
            </div>

            {/* Camera feed */}
            <div className="relative flex-1 overflow-hidden">
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Scan area overlay */}
                {cameraReady && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        {/* Semi-transparent border */}
                        <div
                            className="h-40 w-72 rounded-2xl border-2 border-white/60"
                            style={{
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                            }}
                        />
                    </div>
                )}

                {/* Loading state */}
                {!cameraReady && !error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-white/80">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="text-sm font-medium">Kamera wird gestartet…</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom bar */}
            <div className="relative z-10 flex flex-col items-center gap-3 px-4 pb-8 pt-4">
                {/* Error */}
                {error && (
                    <div className="w-full max-w-sm rounded-xl bg-red-500/20 px-4 py-2 text-center text-sm text-red-200 backdrop-blur-sm">
                        {error}
                    </div>
                )}

                {/* Instruction text */}
                <p className="text-sm text-white/60">
                    {isBarcodeSupported()
                        ? 'Halten Sie den Barcode ins Feld — die Erkennung läuft vollständig lokal'
                        : 'BarcodeDetector wird von diesem Browser nicht unterstützt'}
                </p>

                {/* Capture button */}
                <button
                    onClick={handleCapture}
                    disabled={!cameraReady || isLoading}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white transition-all hover:bg-white/30 active:scale-95 disabled:opacity-40"
                >
                    {isLoading ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                    ) : (
                        <Aperture className="h-7 w-7" />
                    )}
                </button>
            </div>
        </div>
    );
};
