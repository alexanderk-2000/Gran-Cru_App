
import React, { useCallback, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';

interface ImageUploaderProps {
    /** Label shown below the slot (e.g. "Flasche", "Etikett", "Kiste") */
    label: string;
    /** Current image URL, or null if empty */
    currentUrl: string | null;
    /** Called when a new image is uploaded, with the new URL */
    onUpload: (file: File) => Promise<void>;
    /** Called when the image is deleted */
    onDelete: () => Promise<void>;
    /** Disable interactions */
    disabled?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    label,
    currentUrl,
    onUpload,
    onDelete,
    disabled = false
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const busy = isUploading || isDeleting || disabled;

    const handleFile = useCallback(
        async (file: File) => {
            if (busy) return;
            if (!file.type.startsWith('image/')) {
                setError('Nur Bilder erlaubt');
                return;
            }

            setError(null);
            setIsUploading(true);

            // Show instant preview
            const localUrl = URL.createObjectURL(file);
            setPreviewUrl(localUrl);

            try {
                await onUpload(file);
            } catch (err: any) {
                setError(err?.message || 'Upload fehlgeschlagen');
                setPreviewUrl(null);
            } finally {
                URL.revokeObjectURL(localUrl);
                setIsUploading(false);
            }
        },
        [busy, onUpload]
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset input so same file can be selected again
            e.target.value = '';
        },
        [handleFile]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDelete = useCallback(async () => {
        if (busy) return;
        setError(null);
        setIsDeleting(true);
        try {
            await onDelete();
            setPreviewUrl(null);
        } catch (err: any) {
            setError(err?.message || 'Löschen fehlgeschlagen');
        } finally {
            setIsDeleting(false);
        }
    }, [busy, onDelete]);

    const displayUrl = previewUrl || currentUrl;

    return (
        <div className="flex flex-col items-center gap-2">
            <div
                className={`
          relative w-full aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer
          border-2 transition-all duration-200
          ${isDragOver ? 'border-burgundy/40 bg-burgundy/5 scale-[1.02]' : 'border-burgundy/10 bg-alabaster'}
          ${busy ? 'opacity-60 pointer-events-none' : 'hover:border-burgundy/25 hover:shadow-md'}
          ${error ? 'border-red-300' : ''}
        `}
                onClick={() => !busy && inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {displayUrl ? (
                    <>
                        <img
                            src={displayUrl}
                            alt={label}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={() => setPreviewUrl(null)}
                        />
                        {/* Overlay gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                        {/* Delete button */}
                        {!busy && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete();
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur rounded-full
                  text-red-600 hover:bg-red-50 hover:text-red-700 transition-all shadow-sm
                  opacity-0 group-hover:opacity-100 hover:!opacity-100"
                                style={{ opacity: 1 }}
                                aria-label={`${label} löschen`}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {/* Replace hint */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                            <span className="px-2 py-1 bg-white/80 backdrop-blur rounded-full
                text-[9px] font-bold uppercase tracking-widest text-stone-600
                opacity-0 hover:opacity-100 transition-opacity">
                                Ersetzen
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-stone-400">
                        {isDragOver ? (
                            <Upload className="w-8 h-8 text-burgundy/50" />
                        ) : (
                            <Camera className="w-8 h-8" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                            {isDragOver ? 'Ablegen' : 'Hochladen'}
                        </span>
                    </div>
                )}

                {/* Loading overlay */}
                {(isUploading || isDeleting) && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-burgundy animate-spin" />
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={busy}
                />
            </div>

            {/* Label */}
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-gray">
                {label}
            </span>

            {/* Error */}
            {error && (
                <span className="text-[10px] text-red-500 font-medium">{error}</span>
            )}
        </div>
    );
};
