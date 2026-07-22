import { describe, expect, it } from 'vitest';
import {
  applyAiEnrichment,
  blankWineCaptureForm,
  buildInitialFormValues,
  buildWinePayload,
  extractAiExtras,
  wineToFormValues
} from '../../features/wine-capture/wineCaptureMapping.ts';
import type { Wine } from '../../types.ts';

const baseWine: Wine = {
  id: 'wine-1',
  user_id: 'user-1',
  name: 'Chateau Test',
  vintage: 2018,
  region: 'Bordeaux',
  category: 'Genuss',
  quantity: 3,
  purchase_price: 25,
  format: '0.75L',
  drink_start: 2022,
  drink_end: 2030,
  wishlist: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z'
};

describe('blankWineCaptureForm', () => {
  it('defaults category based on wishlist', () => {
    expect(blankWineCaptureForm({ wishlist: false }).category).toBe('Genuss');
    expect(blankWineCaptureForm({ wishlist: true }).category).toBe('Rarität');
  });

  it('normalizes the target subcellar', () => {
    expect(blankWineCaptureForm({ targetSubcellar: '  Keller A  ' }).subcellar).toBe('Keller A');
  });
});

describe('wineToFormValues', () => {
  it('round-trips a wine into string form values', () => {
    const form = wineToFormValues(baseWine);
    expect(form.name).toBe('Chateau Test');
    expect(form.vintage).toBe('2018');
    expect(form.quantity).toBe('3');
    expect(form.wishlist).toBe('false');
  });
});

describe('buildInitialFormValues', () => {
  it('prefers an existing wine over initialData', () => {
    const form = buildInitialFormValues({ wine: baseWine, initialData: { name: 'Ignored' } });
    expect(form.name).toBe('Chateau Test');
  });

  it('patches a blank form from scan initialData', () => {
    const form = buildInitialFormValues({ initialData: { name: 'Scanned Wine', barcode: '123456' }, wishlist: false });
    expect(form.name).toBe('Scanned Wine');
    expect(form.barcode).toBe('123456');
    expect(form.category).toBe('Genuss');
  });
});

describe('applyAiEnrichment', () => {
  it('overwrites only fields present in the AI response', () => {
    const form = blankWineCaptureForm();
    const enriched = applyAiEnrichment(form, { region: 'Piemont', country: 'Italien' });
    expect(enriched.region).toBe('Piemont');
    expect(enriched.country).toBe('Italien');
    expect(enriched.appellation).toBe(form.appellation);
  });
});

describe('extractAiExtras', () => {
  it('returns null when there is no data', () => {
    expect(extractAiExtras(null)).toBeNull();
    expect(extractAiExtras(undefined)).toBeNull();
  });

  it('falls back to empty collections for missing fields', () => {
    const extras = extractAiExtras({});
    expect(extras).toEqual({
      grapes: [],
      aromas: [],
      structure: {},
      pairings: [],
      scores: [],
      missing_fields: [],
      ai_details: {},
      ai_sources: []
    });
  });

  it('prefers details/sources over ai_details/ai_sources', () => {
    const extras = extractAiExtras({ details: { a: 1 }, ai_details: { b: 2 }, sources: [{ title: 'x' }] });
    expect(extras?.ai_details).toEqual({ a: 1 });
    expect(extras?.ai_sources).toEqual([{ title: 'x' }]);
  });
});

describe('buildWinePayload', () => {
  it('converts a blank create-mode form into a valid payload', () => {
    const form = blankWineCaptureForm({ wishlist: false });
    const payload = buildWinePayload({ ...form, name: 'New Wine' });
    expect(payload.name).toBe('New Wine');
    expect(payload.category).toBe('Genuss');
    expect(payload.format).toBe('0.75L');
    expect(payload.quantity).toBeGreaterThanOrEqual(0);
  });

  it('carries over base fields not managed by the form in edit mode', () => {
    const form = wineToFormValues(baseWine);
    const payload = buildWinePayload(form, { base: baseWine });
    expect(payload.id).toBe('wine-1');
    expect(payload.user_id).toBe('user-1');
  });

  it('applies AI extras only when provided', () => {
    const form = blankWineCaptureForm();
    const extras = extractAiExtras({ grapes: [{ name: 'Nebbiolo' }] });
    const payload = buildWinePayload({ ...form, name: 'Enriched Wine' }, { extras });
    expect(payload.grapes).toEqual([{ name: 'Nebbiolo' }]);
  });

  it('rejects a vintage-only format string by falling back to a valid one', () => {
    const form = blankWineCaptureForm();
    const payload = buildWinePayload({ ...form, name: 'Wine', format: 'not-a-format' });
    expect(payload.format).toBe('0.75L');
  });
});
