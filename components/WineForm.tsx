import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BottleFormat, Category, Wine, WineStructure, WineType } from '../types.ts';
import { WINE_CATEGORIES } from '../constants.ts';

/**
 * The one wine form, used for creating and for editing.
 *
 * Entry used to be three unrelated UIs: a scan mini-form, a "create" button
 * that only produced a placeholder record with no fields at all, and an edit
 * dialog with raw JSON textareas. Everything now flows through these fields -
 * name, vintage and quantity are the only required ones, everything else is
 * optional and folded away.
 */

export const WINE_TYPE_OPTIONS: WineType[] = ['Rot', 'Weiß', 'Rosé', 'Schaumwein', 'Süßwein'];
export const FORMAT_OPTIONS: BottleFormat[] = [
  '0.375L',
  '0.75L',
  '1.5L (Magnum)',
  '3.0L (Double Magnum)',
  '6.0L (Imperial)'
];

export interface GrapeDraft {
  name: string;
  percentage: string;
}

/** Numeric fields are kept as strings so typing never fights the parser. */
export interface WineDraft {
  name: string;
  producer: string;
  vintage: string;
  quantity: string;
  region: string;
  country: string;
  appellation: string;
  subcellar: string;
  barcode: string;
  category: Category;
  wine_type: string;
  format: BottleFormat;
  purchase_price: string;
  market_price: string;
  alcohol_percent: string;
  drink_start: string;
  peak_year: string;
  drink_end: string;
  grapes: GrapeDraft[];
  structure: Record<keyof WineStructure, string>;
  note: string;
}

export const EMPTY_STRUCTURE: Record<keyof WineStructure, string> = {
  acidity: '',
  tannin: '',
  body: '',
  sweetness: '',
  oak: ''
};

export const createEmptyDraft = (overrides: Partial<WineDraft> = {}): WineDraft => ({
  name: '',
  producer: '',
  vintage: String(new Date().getFullYear()),
  quantity: '1',
  region: '',
  country: '',
  appellation: '',
  subcellar: '',
  barcode: '',
  category: 'Genuss',
  wine_type: '',
  format: '0.75L',
  purchase_price: '',
  market_price: '',
  alcohol_percent: '',
  drink_start: '',
  peak_year: '',
  drink_end: '',
  grapes: [],
  structure: { ...EMPTY_STRUCTURE },
  note: '',
  ...overrides
});

const toNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toInt = (value: string): number | undefined => {
  const parsed = toNumber(value);
  return parsed === undefined ? undefined : Math.round(parsed);
};

/** Maps a wine coming from AI research or an import onto the form. */
export const draftFromWine = (wine: Partial<Wine>, overrides: Partial<WineDraft> = {}): WineDraft =>
  createEmptyDraft({
    name: wine.name ?? '',
    producer: wine.producer ?? '',
    vintage: wine.vintage ? String(wine.vintage) : String(new Date().getFullYear()),
    quantity: typeof wine.quantity === 'number' ? String(wine.quantity) : '1',
    region: wine.region && wine.region !== 'Unbekannt' ? wine.region : '',
    country: wine.country ?? '',
    appellation: wine.appellation ?? '',
    subcellar: wine.subcellar ?? '',
    barcode: wine.barcode ?? '',
    category: wine.category ?? 'Genuss',
    wine_type: wine.wine_type ?? '',
    format: wine.format ?? '0.75L',
    purchase_price: typeof wine.purchase_price === 'number' && wine.purchase_price > 0 ? String(wine.purchase_price) : '',
    market_price: typeof wine.market_price === 'number' && wine.market_price > 0 ? String(wine.market_price) : '',
    alcohol_percent: typeof wine.alcohol_percent === 'number' ? String(wine.alcohol_percent) : '',
    drink_start: typeof wine.drink_start === 'number' ? String(wine.drink_start) : '',
    peak_year: typeof wine.peak_year === 'number' ? String(wine.peak_year) : '',
    drink_end: typeof wine.drink_end === 'number' ? String(wine.drink_end) : '',
    grapes: (wine.grapes ?? []).map((grape) => ({
      name: grape.name ?? '',
      percentage: typeof grape.percentage === 'number' ? String(grape.percentage) : ''
    })),
    structure: {
      acidity: typeof wine.structure?.acidity === 'number' ? String(wine.structure.acidity) : '',
      tannin: typeof wine.structure?.tannin === 'number' ? String(wine.structure.tannin) : '',
      body: typeof wine.structure?.body === 'number' ? String(wine.structure.body) : '',
      sweetness: typeof wine.structure?.sweetness === 'number' ? String(wine.structure.sweetness) : '',
      oak: typeof wine.structure?.oak === 'number' ? String(wine.structure.oak) : ''
    },
    ...overrides
  });

/** Turns the form back into the payload `storageService.saveWine` expects. */
export const draftToWine = (draft: WineDraft): Partial<Wine> => {
  const vintage = toInt(draft.vintage) ?? new Date().getFullYear();
  const drinkStart = toInt(draft.drink_start);
  const drinkEnd = toInt(draft.drink_end);

  const structure: WineStructure = {};
  for (const key of Object.keys(draft.structure) as Array<keyof WineStructure>) {
    const value = toNumber(draft.structure[key]);
    if (value !== undefined) structure[key] = value;
  }

  const grapes = draft.grapes
    .map((grape) => ({ name: grape.name.trim(), percentage: toNumber(grape.percentage) }))
    .filter((grape) => grape.name.length > 0);

  return {
    name: draft.name.trim(),
    producer: draft.producer.trim() || undefined,
    vintage,
    quantity: Math.max(0, toInt(draft.quantity) ?? 0),
    // The cellar list and several filters read `region` as a plain string.
    region: draft.region.trim() || 'Unbekannt',
    country: draft.country.trim() || undefined,
    appellation: draft.appellation.trim() || undefined,
    subcellar: draft.subcellar.trim() || undefined,
    barcode: draft.barcode.trim() || undefined,
    category: draft.category,
    wine_type: (draft.wine_type as WineType) || undefined,
    format: draft.format,
    purchase_price: toNumber(draft.purchase_price) ?? 0,
    market_price: toNumber(draft.market_price),
    alcohol_percent: toNumber(draft.alcohol_percent),
    // Without a window the app says "Kein Fenster" rather than inventing one.
    drink_start: drinkStart ?? undefined,
    drink_end: drinkEnd ?? undefined,
    peak_year: toInt(draft.peak_year),
    grapes: grapes.length > 0 ? grapes : undefined,
    structure: Object.keys(structure).length > 0 ? structure : undefined
  } as Partial<Wine>;
};

const STRUCTURE_LABELS: Array<{ key: keyof WineStructure; label: string; low: string; high: string }> = [
  { key: 'acidity', label: 'Säure', low: 'weich', high: 'frisch' },
  { key: 'tannin', label: 'Tannin', low: 'zart', high: 'kräftig' },
  { key: 'body', label: 'Körper', low: 'leicht', high: 'vollmundig' },
  { key: 'sweetness', label: 'Süße', low: 'trocken', high: 'süß' },
  { key: 'oak', label: 'Holz', low: 'keins', high: 'deutlich' }
];

interface WineFormProps {
  draft: WineDraft;
  onChange: (draft: WineDraft) => void;
  /** Field names the AI filled in - marked so the user knows what to check. */
  aiFilled?: Set<string>;
  subcellarOptions?: string[];
  disabled?: boolean;
}

const labelClass = 'mb-1 block text-[11px] font-black uppercase tracking-widest text-stone-gray';
const inputClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:border-burgundy/30 focus:outline-none disabled:opacity-50';

export const WineForm: React.FC<WineFormProps> = ({
  draft,
  onChange,
  aiFilled,
  subcellarOptions = [],
  disabled = false
}) => {
  const set = <K extends keyof WineDraft>(key: K, value: WineDraft[K]) => onChange({ ...draft, [key]: value });

  const aiMark = (field: string) =>
    aiFilled?.has(field) ? (
      <span className="ml-2 rounded bg-burgundy/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-burgundy">
        KI
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="wine-name" className={labelClass}>
            Name *{aiMark('name')}
          </label>
          <input
            id="wine-name"
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
            disabled={disabled}
            className={inputClass}
            placeholder="z. B. Barolo Cannubi"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wine-producer" className={labelClass}>
              Weingut{aiMark('producer')}
            </label>
            <input
              id="wine-producer"
              value={draft.producer}
              onChange={(event) => set('producer', event.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wine-vintage" className={labelClass}>
              Jahrgang *{aiMark('vintage')}
            </label>
            <input
              id="wine-vintage"
              type="number"
              value={draft.vintage}
              onChange={(event) => set('vintage', event.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wine-quantity" className={labelClass}>
              Flaschen *
            </label>
            <input
              id="wine-quantity"
              type="number"
              min={0}
              value={draft.quantity}
              onChange={(event) => set('quantity', event.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wine-price" className={labelClass}>
              Einstand je Flasche (€)
            </label>
            <input
              id="wine-price"
              type="number"
              min={0}
              step="0.01"
              value={draft.purchase_price}
              onChange={(event) => set('purchase_price', event.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="wine-subcellar" className={labelClass}>
            Pocket / Unterkeller
          </label>
          <input
            id="wine-subcellar"
            list="wine-form-subcellars"
            value={draft.subcellar}
            onChange={(event) => set('subcellar', event.target.value)}
            disabled={disabled}
            placeholder="Hauptkeller, wenn leer"
            className={inputClass}
          />
          <datalist id="wine-form-subcellars">
            {subcellarOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <details className="rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer text-sm font-bold text-charcoal">Herkunft & Art</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wine-region" className={labelClass}>
                Region{aiMark('region')}
              </label>
              <input
                id="wine-region"
                value={draft.region}
                onChange={(event) => set('region', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wine-country" className={labelClass}>
                Land{aiMark('country')}
              </label>
              <input
                id="wine-country"
                value={draft.country}
                onChange={(event) => set('country', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="wine-appellation" className={labelClass}>
              Appellation / Lage{aiMark('appellation')}
            </label>
            <input
              id="wine-appellation"
              value={draft.appellation}
              onChange={(event) => set('appellation', event.target.value)}
              disabled={disabled}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wine-type" className={labelClass}>
                Weinart{aiMark('wine_type')}
              </label>
              <select
                id="wine-type"
                value={draft.wine_type}
                onChange={(event) => set('wine_type', event.target.value)}
                disabled={disabled}
                className={inputClass}
              >
                <option value="">— nicht gesetzt —</option>
                {WINE_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wine-category" className={labelClass}>
                Kategorie
              </label>
              <select
                id="wine-category"
                value={draft.category}
                onChange={(event) => set('category', event.target.value as Category)}
                disabled={disabled}
                className={inputClass}
              >
                {WINE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="wine-format" className={labelClass}>
                Flaschengröße
              </label>
              <select
                id="wine-format"
                value={draft.format}
                onChange={(event) => set('format', event.target.value as BottleFormat)}
                disabled={disabled}
                className={inputClass}
              >
                {FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wine-alcohol" className={labelClass}>
                Alkohol (%){aiMark('alcohol_percent')}
              </label>
              <input
                id="wine-alcohol"
                type="number"
                step="0.1"
                value={draft.alcohol_percent}
                onChange={(event) => set('alcohol_percent', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer text-sm font-bold text-charcoal">
          Trinkfenster{aiFilled?.has('drink_start') || aiFilled?.has('drink_end') ? aiMark('drink_start') : null}
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-stone-gray">
            Ohne Fenster kann die App keine Reife berechnen – der Wein erscheint dann als „Kein Fenster“.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="wine-drink-start" className={labelClass}>
                Ab
              </label>
              <input
                id="wine-drink-start"
                type="number"
                value={draft.drink_start}
                onChange={(event) => set('drink_start', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wine-peak" className={labelClass}>
                Peak
              </label>
              <input
                id="wine-peak"
                type="number"
                value={draft.peak_year}
                onChange={(event) => set('peak_year', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="wine-drink-end" className={labelClass}>
                Bis
              </label>
              <input
                id="wine-drink-end"
                type="number"
                value={draft.drink_end}
                onChange={(event) => set('drink_end', event.target.value)}
                disabled={disabled}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-2xl border border-stone-200 p-4">
        <summary className="cursor-pointer text-sm font-bold text-charcoal">Rebsorten & Struktur</summary>
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <span className={labelClass}>Rebsorten{aiMark('grapes')}</span>
            {draft.grapes.map((grape, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={grape.name}
                  onChange={(event) => {
                    const next = [...draft.grapes];
                    next[index] = { ...next[index], name: event.target.value };
                    set('grapes', next);
                  }}
                  disabled={disabled}
                  placeholder="Rebsorte"
                  aria-label={`Rebsorte ${index + 1}`}
                  className={inputClass}
                />
                <input
                  value={grape.percentage}
                  onChange={(event) => {
                    const next = [...draft.grapes];
                    next[index] = { ...next[index], percentage: event.target.value };
                    set('grapes', next);
                  }}
                  disabled={disabled}
                  type="number"
                  placeholder="%"
                  aria-label={`Anteil Rebsorte ${index + 1}`}
                  className={`${inputClass} w-24`}
                />
                <button
                  type="button"
                  onClick={() => set('grapes', draft.grapes.filter((_, i) => i !== index))}
                  disabled={disabled}
                  aria-label={`Rebsorte ${index + 1} entfernen`}
                  className="rounded-xl border border-stone-200 px-3 text-stone-gray hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('grapes', [...draft.grapes, { name: '', percentage: '' }])}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-xl border border-burgundy/20 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-burgundy"
            >
              <Plus className="h-3.5 w-3.5" /> Rebsorte
            </button>
          </div>

          <div className="space-y-3">
            <span className={labelClass}>Struktur (1–5){aiMark('structure')}</span>
            <p className="text-xs text-stone-gray">
              Je vollständiger, desto genauer die Reifeberechnung.
            </p>
            {STRUCTURE_LABELS.map(({ key, label, low, high }) => {
              const value = draft.structure[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`structure-${key}`} className="w-20 shrink-0 text-xs font-bold text-charcoal">
                    {label}
                  </label>
                  <input
                    id={`structure-${key}`}
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={value === '' ? 0 : value}
                    onChange={(event) => {
                      const next = event.target.value === '0' ? '' : event.target.value;
                      set('structure', { ...draft.structure, [key]: next });
                    }}
                    disabled={disabled}
                    className="flex-1 accent-burgundy"
                  />
                  <span className="w-24 shrink-0 text-right text-xs text-stone-gray">
                    {value === '' ? '—' : `${value} · ${Number(value) <= 2 ? low : high}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
};
