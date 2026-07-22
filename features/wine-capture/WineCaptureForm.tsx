import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Wand2 } from 'lucide-react';
import { Dialog } from '../../components/Dialog.tsx';
import { FormField } from '../../components/form/FormField.tsx';
import { SelectField } from '../../components/form/SelectField.tsx';
import { ImageUploader } from '../../components/ImageUploader.tsx';
import { aiService } from '../../services/ai.ts';
import { storageService } from '../../services/storage.ts';
import { imageStorageService, type ImageSlot } from '../../services/imageStorage.ts';
import { validateWineInput } from '../../domain/wine/validation.ts';
import { findLikelyDuplicates } from '../../domain/wine/duplicateDetection.ts';
import type { Wine } from '../../types.ts';
import {
  buildInitialFormValues,
  buildWinePayload,
  applyAiEnrichment,
  extractAiExtras,
  CATEGORY_OPTIONS,
  WINE_TYPE_OPTIONS,
  FORMAT_OPTIONS,
  type WineCaptureAiExtras,
  type WineCaptureFormValues
} from './wineCaptureMapping.ts';

interface WineCaptureFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  wine?: Wine;
  initialData?: Partial<Wine>;
  existingWines?: Wine[];
  wishlist?: boolean;
  targetSubcellar?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSaved: (wine: Wine) => void;
  onWineImagesChanged?: (wine: Wine) => void;
}

export const WineCaptureForm: React.FC<WineCaptureFormProps> = ({
  open,
  mode,
  wine,
  initialData,
  existingWines = [],
  wishlist = false,
  targetSubcellar = '',
  title,
  subtitle,
  onClose,
  onSaved,
  onWineImagesChanged
}) => {
  const [form, setForm] = useState<WineCaptureFormValues>(() =>
    buildInitialFormValues({ wine, initialData, wishlist, targetSubcellar })
  );
  const [aiExtras, setAiExtras] = useState<WineCaptureAiExtras | null>(null);
  const [enriched, setEnriched] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialFormValues({ wine, initialData, wishlist, targetSubcellar }));
    setAiExtras(null);
    setEnriched(false);
    setError(null);
    setValidationErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wine?.id, initialData]);

  const updateField = useCallback((field: keyof WineCaptureFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const duplicates = useMemo(() => {
    if (mode !== 'create') return [];
    const vintage = Number.parseInt(form.vintage, 10);
    return findLikelyDuplicates(
      {
        barcode: form.barcode.trim() || undefined,
        name: form.name.trim(),
        producer: form.producer.trim() || undefined,
        vintage: Number.isFinite(vintage) ? vintage : undefined,
        format: (form.format.trim() || '0.75L') as Wine['format']
      },
      existingWines
    );
  }, [mode, form.barcode, form.name, form.producer, form.vintage, form.format, existingWines]);

  const canSubmit = !isSaving && !isEnriching;

  const handleEnrich = useCallback(async () => {
    if (!form.name.trim() || !canSubmit) return;
    setIsEnriching(true);
    setError(null);
    try {
      const vintage = Number.parseInt(form.vintage, 10) || new Date().getFullYear();
      const response = await aiService.generateWineInfo(form.name.trim(), form.producer.trim(), vintage);
      if (response.success && response.data) {
        setForm((prev) => applyAiEnrichment(prev, response.data));
        setAiExtras(extractAiExtras(response.data));
        setEnriched(true);
      } else {
        setError(response.error || 'AI-Anreicherung fehlgeschlagen.');
      }
    } catch (err: any) {
      setError(err?.message || 'AI-Anreicherung fehlgeschlagen.');
    } finally {
      setIsEnriching(false);
    }
  }, [form.name, form.producer, form.vintage, canSubmit]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !canSubmit) return;
    setError(null);

    const payload = buildWinePayload(form, {
      base: mode === 'edit' ? wine : undefined,
      extras: mode === 'create' ? aiExtras : undefined
    });

    const errors = validateWineInput(payload);
    if (errors.length > 0) {
      setValidationErrors(errors.map((entry) => entry.message));
      return;
    }
    setValidationErrors([]);
    setIsSaving(true);
    try {
      const saved = await storageService.saveWine(payload);
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setIsSaving(false);
    }
  }, [form, mode, wine, aiExtras, canSubmit, onSaved]);

  const wineImages = useMemo<Record<ImageSlot, string | null>>(
    () => (mode === 'edit' && wine ? imageStorageService.getImagesFromWine(wine) : { bottle: null, label: null, case: null }),
    [mode, wine]
  );

  const handleImageUpload = useCallback(
    async (slot: ImageSlot, file: File) => {
      if (!wine) return;
      const url = await imageStorageService.upload(wine.id, slot, file);
      const updatedDetails = imageStorageService.mergeImageUrl(wine.ai_details, slot, url);
      const updated = await storageService.saveWine({ ...wine, ai_details: updatedDetails, updated_at: new Date().toISOString() });
      onWineImagesChanged?.(updated);
    },
    [wine, onWineImagesChanged]
  );

  const handleImageDelete = useCallback(
    async (slot: ImageSlot) => {
      if (!wine) return;
      await imageStorageService.delete(wine.id, slot);
      const updatedDetails = imageStorageService.mergeImageUrl(wine.ai_details, slot, null);
      const updated = await storageService.saveWine({ ...wine, ai_details: updatedDetails, updated_at: new Date().toISOString() });
      onWineImagesChanged?.(updated);
    },
    [wine, onWineImagesChanged]
  );

  return (
    <Dialog
      open={open}
      title={title ?? (mode === 'edit' ? 'Wein bearbeiten' : 'Wein erfassen')}
      subtitle={subtitle}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {mode === 'edit' && wine && (
            <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Fotos</h4>
              <div className="grid grid-cols-3 gap-3">
                {(['bottle', 'label', 'case'] as const).map((slot) => (
                  <ImageUploader
                    key={slot}
                    label={slot === 'bottle' ? 'Flasche' : slot === 'label' ? 'Etikett' : 'Kiste'}
                    currentUrl={wineImages[slot]}
                    onUpload={(file) => handleImageUpload(slot, file)}
                    onDelete={() => handleImageDelete(slot)}
                    disabled={isSaving}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Identifikation</h4>
            <FormField label="Name" value={form.name} onChange={(value) => updateField('name', value)} required />
            <FormField label="Produzent" value={form.producer} onChange={(value) => updateField('producer', value)} />
            <FormField label="Jahrgang" value={form.vintage} onChange={(value) => updateField('vintage', value)} type="number" required />
            <FormField label="Barcode" value={form.barcode} onChange={(value) => updateField('barcode', value)} placeholder="Optional" />

            {mode === 'create' && (
              <button
                type="button"
                onClick={handleEnrich}
                disabled={!canSubmit || !form.name.trim()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                  enriched ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-burgundy/15 bg-white text-burgundy hover:border-burgundy/30'
                } disabled:opacity-40`}
              >
                {isEnriching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> AI lädt Daten…
                  </>
                ) : enriched ? (
                  <>
                    <Check className="h-4 w-4" /> AI-Daten geladen
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Mit AI anreichern
                  </>
                )}
              </button>
            )}

            {mode === 'create' && duplicates.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Möglicherweise bereits im Keller: {duplicates.map((entry) => `${entry.name}${entry.vintage ? ` (${entry.vintage})` : ''}`).join(', ')}
                </span>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Herkunft</h4>
            <FormField label="Region" value={form.region} onChange={(value) => updateField('region', value)} required />
            <FormField label="Unterkeller" value={form.subcellar} onChange={(value) => updateField('subcellar', value)} />
            <FormField label="Appellation" value={form.appellation} onChange={(value) => updateField('appellation', value)} />
            <FormField label="Land" value={form.country} onChange={(value) => updateField('country', value)} />
            <FormField label="Subregion" value={form.subregion} onChange={(value) => updateField('subregion', value)} />
            <FormField label="Lage / Vineyard" value={form.vineyard} onChange={(value) => updateField('vineyard', value)} />
          </section>

          <section className="space-y-3 rounded-2xl border border-stone-200 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Keller & Klassifikation</h4>
            <SelectField
              label="Kategorie"
              value={form.category}
              options={[{ value: '', label: 'Bitte wählen' }, ...CATEGORY_OPTIONS.map((item) => ({ value: item, label: item }))]}
              onChange={(value) => updateField('category', value)}
            />
            <SelectField
              label="Weintyp"
              value={form.wine_type}
              options={[{ value: '', label: 'Bitte wählen' }, ...WINE_TYPE_OPTIONS.map((item) => ({ value: item, label: item }))]}
              onChange={(value) => updateField('wine_type', value)}
            />
            <SelectField
              label="Flaschenformat"
              value={form.format}
              options={[{ value: '', label: 'Bitte wählen' }, ...FORMAT_OPTIONS.map((item) => ({ value: item, label: item }))]}
              onChange={(value) => updateField('format', value)}
            />
            <FormField label="Menge" value={form.quantity} onChange={(value) => updateField('quantity', value)} type="number" required />
            <FormField label="Kaufpreis" value={form.purchase_price} onChange={(value) => updateField('purchase_price', value)} />
            <FormField label="Marktpreis" value={form.market_price} onChange={(value) => updateField('market_price', value)} />
            <FormField label="Alkohol %" value={form.alcohol_percent} onChange={(value) => updateField('alcohol_percent', value)} type="number" />
            <FormField label="Trinkstart" value={form.drink_start} onChange={(value) => updateField('drink_start', value)} type="number" />
            <FormField label="Trinkende" value={form.drink_end} onChange={(value) => updateField('drink_end', value)} type="number" />
            <FormField label="Peak Year" value={form.peak_year} onChange={(value) => updateField('peak_year', value)} type="number" />
            <FormField label="Verschluss" value={form.closure_type} onChange={(value) => updateField('closure_type', value)} />
            <FormField label="Gärung" value={form.fermentation} onChange={(value) => updateField('fermentation', value)} />
            <FormField label="Ausbau" value={form.aging_process} onChange={(value) => updateField('aging_process', value)} />
            <FormField label="Anbau" value={form.farming} onChange={(value) => updateField('farming', value)} />
            <SelectField
              label="Confidence"
              value={form.confidence}
              options={[
                { value: '', label: 'Nicht gesetzt' },
                { value: 'high', label: 'high' },
                { value: 'medium', label: 'medium' },
                { value: 'low', label: 'low' }
              ]}
              onChange={(value) => updateField('confidence', value)}
            />
            <SelectField
              label="Wishlist"
              value={form.wishlist}
              options={[
                { value: 'false', label: 'Nein' },
                { value: 'true', label: 'Ja' }
              ]}
              onChange={(value) => updateField('wishlist', value)}
            />
            <SelectField
              label="Favorit"
              value={form.is_favorite}
              options={[
                { value: 'false', label: 'Nein' },
                { value: 'true', label: 'Ja' }
              ]}
              onChange={(value) => updateField('is_favorite', value)}
            />
          </section>

          {validationErrors.length > 0 && (
            <div className="space-y-1 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-600">
              {validationErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#5B1E2D' }}
        >
          {isSaving ? 'Speichern…' : 'Speichern'}
        </button>
      </form>
    </Dialog>
  );
};
