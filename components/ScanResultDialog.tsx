import React, { useCallback, useState } from 'react';
import { Check, Loader2, Wand2, X } from 'lucide-react';
import { aiService } from '../services/ai.ts';
import { storageService } from '../services/storage.ts';
import type { ScanResult } from '../services/scanner.ts';

interface ScanResultDialogProps {
    open: boolean;
    result: ScanResult | null;
    onClose: () => void;
    onSaved: () => void;
    wishlist?: boolean;
    targetSubcellar?: string;
}

export const ScanResultDialog: React.FC<ScanResultDialogProps> = ({
    open,
    result,
    onClose,
    onSaved,
    wishlist = false,
    targetSubcellar = '',
}) => {
    const [name, setName] = useState('');
    const [producer, setProducer] = useState('');
    const [vintage, setVintage] = useState('');
    const [isEnriching, setIsEnriching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [enriched, setEnriched] = useState(false);
    const [enrichedData, setEnrichedData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Populate fields when result changes
    React.useEffect(() => {
        if (!result) return;
        setName(result.name || result.raw || '');
        setProducer(result.producer || '');
        setVintage(result.vintage ? String(result.vintage) : String(new Date().getFullYear()));
        setEnriched(false);
        setEnrichedData(null);
        setError(null);
    }, [result]);

    const handleEnrich = useCallback(async () => {
        if (!name.trim()) return;
        setIsEnriching(true);
        setError(null);

        try {
            const response = await aiService.generateWineInfo(
                name.trim(),
                producer.trim(),
                parseInt(vintage, 10) || new Date().getFullYear()
            );

            if (response.success && response.data) {
                const data = response.data;
                setName(data.name || name);
                setProducer(data.producer || producer);
                setVintage(data.vintage ? String(data.vintage) : vintage);
                setEnrichedData(data);
                setEnriched(true);
            } else {
                setError(response.error || 'AI-Anreicherung fehlgeschlagen.');
            }
        } catch (err: any) {
            setError(err?.message || 'AI-Anreicherung fehlgeschlagen.');
        } finally {
            setIsEnriching(false);
        }
    }, [name, producer, vintage]);

    const handleSave = useCallback(async () => {
        if (!name.trim()) return;
        setIsSaving(true);
        setError(null);

        try {
            const currentYear = new Date().getFullYear();
            const parsedVintage = parseInt(vintage, 10) || currentYear;

            const wineData: Record<string, any> = {
                name: name.trim(),
                producer: producer.trim() || undefined,
                vintage: parsedVintage,
                region: enrichedData?.region || 'Unbekannt',
                country: enrichedData?.country || undefined,
                appellation: enrichedData?.appellation || undefined,
                vineyard: enrichedData?.vineyard || undefined,
                wine_type: enrichedData?.wine_type || undefined,
                category: wishlist ? 'Rarität' : 'Genuss',
                format: enrichedData?.format || '0.75L',
                quantity: 1,
                purchase_price: enrichedData?.purchase_price || 0,
                market_price: enrichedData?.market_price || undefined,
                drink_start: enrichedData?.drink_start || parsedVintage + 2,
                drink_end: enrichedData?.drink_end || parsedVintage + 12,
                peak_year: enrichedData?.peak_year || undefined,
                alcohol_percent: enrichedData?.alcohol_percent || undefined,
                grapes: enrichedData?.grapes || [],
                aromas: enrichedData?.aromas || [],
                structure: enrichedData?.structure || {},
                pairings: enrichedData?.pairings || [],
                scores: enrichedData?.scores || [],
                confidence: enrichedData?.confidence || 'medium',
                missing_fields: enrichedData?.missing_fields || [],
                ai_details: enrichedData?.details || enrichedData?.ai_details || {},
                ai_sources: enrichedData?.sources || enrichedData?.ai_sources || [],
                subcellar: targetSubcellar || undefined,
                wishlist,
            };

            const savedWine = await storageService.saveWine(wineData);

            // Also upsert to catalog
            try {
                await storageService.upsertWineCatalog(savedWine);
            } catch {
                // Non-critical
            }

            onSaved();
        } catch (err: any) {
            setError(err?.message || 'Speichern fehlgeschlagen.');
        } finally {
            setIsSaving(false);
        }
    }, [name, producer, vintage, enrichedData, wishlist, targetSubcellar, onSaved]);

    if (!open || !result) return null;

    const busy = isEnriching || isSaving;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
        >
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h3 className="font-serif text-xl font-bold text-charcoal">
                            {result.type === 'barcode' ? '🔍 Barcode erkannt' : '📸 Etikett erkannt'}
                        </h3>
                        {result.raw && (
                            <p className="mt-0.5 text-xs text-stone-400 font-mono truncate max-w-[260px]">
                                {result.raw}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form */}
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-stone-500">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={busy}
                            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium focus:border-burgundy/30 focus:outline-none transition-colors disabled:opacity-50"
                            placeholder="Weinname"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-stone-500">Produzent</label>
                            <input
                                value={producer}
                                onChange={(e) => setProducer(e.target.value)}
                                disabled={busy}
                                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium focus:border-burgundy/30 focus:outline-none transition-colors disabled:opacity-50"
                                placeholder="Weingut"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-stone-500">Jahrgang</label>
                            <input
                                value={vintage}
                                onChange={(e) => setVintage(e.target.value)}
                                disabled={busy}
                                type="number"
                                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium focus:border-burgundy/30 focus:outline-none transition-colors disabled:opacity-50"
                            />
                        </div>
                    </div>
                </div>

                {/* AI enrichment */}
                <button
                    onClick={handleEnrich}
                    disabled={busy || !name.trim()}
                    className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition-all ${enriched
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-burgundy/15 bg-white text-burgundy hover:border-burgundy/30'
                        } disabled:opacity-40`}
                >
                    {isEnriching ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> AI lädt Daten…</>
                    ) : enriched ? (
                        <><Check className="h-4 w-4" /> AI-Daten geladen</>
                    ) : (
                        <><Wand2 className="h-4 w-4" /> AI-Daten laden</>
                    )}
                </button>

                {/* Error */}
                {error && (
                    <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}

                {/* Actions */}
                <div className="mt-5 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-3 text-xs font-black uppercase tracking-wider text-stone-600 transition-all hover:border-stone-300 disabled:opacity-40"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={busy || !name.trim()}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-premium transition-all hover:bg-burgundy-light disabled:opacity-40"
                    >
                        {isSaving ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Speichern…</>
                        ) : (
                            'In Keller legen'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
