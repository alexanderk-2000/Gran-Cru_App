import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, PenLine, ScanBarcode, Sparkles, X } from 'lucide-react';
import type { Wine } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { aiService } from '../services/ai.ts';
import { normalizeImportedWine } from '../domain/wine/normalization.ts';
import { findLikelyDuplicates } from '../domain/wine/duplicateDetection.ts';
import { validateWineInput } from '../domain/wine/validation.ts';
import { WineForm, createEmptyDraft, draftFromWine, draftToWine, type WineDraft } from './WineForm.tsx';

/**
 * The single way a wine enters the cellar.
 *
 * It replaces three separate paths: a scan mini-form, a "create" button that
 * only produced a nameless placeholder record, and a dialog that generated a
 * prompt for the user to paste into ChatGPT and paste the JSON answer back -
 * even though the app can run that research itself. All three now start the
 * same form; research and scanning only pre-fill it.
 */
export interface AddWineSeed {
  name?: string;
  producer?: string;
  vintage?: number;
  barcode?: string;
}

interface AddWineDialogProps {
  open: boolean;
  wishlist?: boolean;
  defaultSubcellar?: string;
  subcellarOptions?: string[];
  existingWines?: Wine[];
  /** Pre-filled values from a scan; also skips straight to the form. */
  seed?: AddWineSeed | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onRequestScan?: () => void;
}

type Step = 'choose' | 'form';

export const AddWineDialog: React.FC<AddWineDialogProps> = ({
  open,
  wishlist = false,
  defaultSubcellar = '',
  subcellarOptions = [],
  existingWines = [],
  seed = null,
  onClose,
  onSaved,
  onRequestScan
}) => {
  const [step, setStep] = useState<Step>('choose');
  const [draft, setDraft] = useState<WineDraft>(() => createEmptyDraft({ subcellar: defaultSubcellar }));
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [researchQuery, setResearchQuery] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setValidationErrors([]);
    setAiFilled(new Set());

    if (seed) {
      setDraft(
        createEmptyDraft({
          subcellar: defaultSubcellar,
          name: seed.name ?? '',
          producer: seed.producer ?? '',
          vintage: seed.vintage ? String(seed.vintage) : String(new Date().getFullYear()),
          barcode: seed.barcode ?? ''
        })
      );
      setResearchQuery([seed.vintage, seed.producer, seed.name].filter(Boolean).join(' '));
      setStep('form');
    } else {
      setDraft(createEmptyDraft({ subcellar: defaultSubcellar }));
      setResearchQuery('');
      setStep('choose');
    }
  }, [open, seed, defaultSubcellar]);

  const duplicates = useMemo(() => {
    if (!draft.name.trim()) return [];
    const candidate = draftToWine(draft);
    return findLikelyDuplicates(candidate, existingWines);
  }, [draft, existingWines]);

  if (!open) return null;

  const runResearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || isResearching) return;

    setIsResearching(true);
    setError(null);
    setNotice(null);

    try {
      const vintageMatch = trimmed.match(/\b(18|19|20)\d{2}\b/);
      const vintage = vintageMatch ? Number(vintageMatch[0]) : Number(draft.vintage) || new Date().getFullYear();
      const response = await aiService.generateWineInfo(trimmed, draft.producer.trim(), vintage);

      if (!response.success || !response.data) {
        setError(response.error || 'Die Recherche hat nichts gefunden. Du kannst die Felder von Hand ausfüllen.');
        setStep('form');
        return;
      }

      if (response.queued) {
        setNotice('Offline: Die Recherche wird nachgeholt, sobald du wieder online bist. Trag solange ein, was du weißt.');
        setStep('form');
        return;
      }

      // Same normalizer the JSON import uses - the AI payload has the same shape.
      const normalized = normalizeImportedWine(response.data, {
        wishlistOnly: wishlist,
        fallbackName: trimmed
      });

      if (!normalized) {
        setError('Die Antwort der Recherche war unvollständig. Bitte die Felder prüfen.');
        setStep('form');
        return;
      }

      const filled = new Set<string>();
      for (const field of [
        'name',
        'producer',
        'vintage',
        'region',
        'country',
        'appellation',
        'wine_type',
        'alcohol_percent',
        'drink_start',
        'drink_end',
        'grapes',
        'structure'
      ] as const) {
        const value = (normalized as Record<string, unknown>)[field];
        if (value !== undefined && value !== null && value !== '') filled.add(field);
      }

      setDraft((previous) =>
        draftFromWine(normalized, {
          // Keep what the user already decided about their own bottles.
          quantity: previous.quantity,
          purchase_price: previous.purchase_price,
          subcellar: previous.subcellar || defaultSubcellar,
          barcode: previous.barcode,
          category: previous.category
        })
      );
      setAiFilled(filled);
      setNotice('Recherchierte Felder sind mit „KI" markiert - bitte kurz prüfen.');
      setStep('form');
    } catch (err) {
      setError((err as Error)?.message || 'Recherche fehlgeschlagen.');
      setStep('form');
    } finally {
      setIsResearching(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    const payload = { ...draftToWine(draft), wishlist };
    const errors = validateWineInput(payload);
    if (errors.length > 0) {
      setValidationErrors(errors.map((entry) => entry.message));
      return;
    }

    setValidationErrors([]);
    setIsSaving(true);
    setError(null);

    try {
      await storageService.saveWine(payload);
      onSaved(`${payload.name} wurde ${wishlist ? 'auf die Wunschliste' : 'in den Keller'} gelegt.`);
    } catch (err) {
      setError((err as Error)?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || isResearching;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Wein hinzufügen"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-burgundy/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-alabaster px-6 py-5">
          <div>
            <h3 className="font-serif text-2xl text-charcoal">
              {wishlist ? 'Wein auf die Wunschliste' : 'Wein hinzufügen'}
            </h3>
            <p className="text-sm text-stone-gray">
              {step === 'choose' ? 'Wie möchtest du starten?' : 'Name, Jahrgang und Flaschen genügen.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 text-stone-gray transition-colors hover:bg-alabaster hover:text-charcoal disabled:opacity-40"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {step === 'choose' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-burgundy" />
                  <p className="text-sm font-bold text-charcoal">Von der App recherchieren lassen</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={researchQuery}
                    onChange={(event) => setResearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void runResearch(researchQuery);
                    }}
                    disabled={busy}
                    autoFocus
                    placeholder="Weingut, Name und Jahrgang"
                    aria-label="Wein suchen"
                    className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void runResearch(researchQuery)}
                    disabled={busy || !researchQuery.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all hover:bg-burgundy-light disabled:opacity-40"
                  >
                    {isResearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Recherchieren
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {onRequestScan && (
                  <button
                    type="button"
                    onClick={onRequestScan}
                    disabled={busy}
                    className="flex items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition-colors hover:border-burgundy/30 hover:bg-alabaster/50 disabled:opacity-40"
                  >
                    <ScanBarcode className="h-5 w-5 text-burgundy" />
                    <span>
                      <span className="block text-sm font-bold text-charcoal">Etikett oder Barcode scannen</span>
                      <span className="block text-xs text-stone-gray">Kamera öffnen, Rest wird vorausgefüllt</span>
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setStep('form')}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition-colors hover:border-burgundy/30 hover:bg-alabaster/50 disabled:opacity-40"
                >
                  <PenLine className="h-5 w-5 text-burgundy" />
                  <span>
                    <span className="block text-sm font-bold text-charcoal">Von Hand eintragen</span>
                    <span className="block text-xs text-stone-gray">Name, Jahrgang, Flaschen – fertig</span>
                  </span>
                </button>
              </div>

              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <>
              {notice && (
                <p className="flex items-start gap-2 rounded-xl bg-burgundy/5 px-3 py-2.5 text-xs text-burgundy">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {notice}
                </p>
              )}

              {duplicates.length > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Sieht aus wie ein Wein, den du schon hast:{' '}
                    {duplicates.map((entry) => `${entry.vintage} ${entry.name}`).join(', ')}. Für weitere Flaschen
                    besser „Nachkauf erfassen“ nutzen.
                  </span>
                </p>
              )}

              <WineForm
                draft={draft}
                onChange={setDraft}
                aiFilled={aiFilled}
                subcellarOptions={subcellarOptions}
                disabled={busy}
              />

              {validationErrors.length > 0 && (
                <div className="space-y-1 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-600">
                  {validationErrors.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}

              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-alabaster px-6 py-4">
          <button
            type="button"
            onClick={step === 'form' && !seed ? () => setStep('choose') : onClose}
            disabled={busy}
            className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-stone-600 transition-all hover:border-stone-300 disabled:opacity-40"
          >
            {step === 'form' && !seed ? 'Zurück' : 'Abbrechen'}
          </button>
          {step === 'form' && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !draft.name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-premium transition-all hover:bg-burgundy-light disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {wishlist ? 'Auf die Wunschliste' : 'In den Keller'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
