import React, { useRef, useState } from 'react';
import { Check, Copy, Wand2, X } from 'lucide-react';
import type { Wine } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';
import { parseJsonInput } from '../../../domain/wine/jsonParsers.ts';
import { getImportCandidates, normalizeImportedWine, normalizeSubcellar } from '../../../domain/wine/normalization.ts';
import { validateWineInput } from '../../../domain/wine/validation.ts';
import { findLikelyDuplicates } from '../../../domain/wine/duplicateDetection.ts';
import { MAIN_CELLAR_LABEL } from '../constants.ts';

const buildPromptForWine = (wineQuery: string): string => {
  const target = wineQuery.trim();
  return `Du bist ein Wein-Daten-Assistent. Erzeuge nur valides JSON ohne Markdown und ohne Zusatztext.

Suche nach diesem Wein:
"${target}"

Liefere exakt dieses Schema:
{
  "name": string,
  "producer": string|null,
  "vintage": number|null,
  "country": string|null,
  "region": string|null,
  "appellation": string|null,
  "vineyard": string|null,
  "wine_type": string|null,
  "format": string|null,
  "quantity": number,
  "purchase_price": number,
  "market_price": number|null,
  "drink_start": number|null,
  "peak_year": number|null,
  "drink_end": number|null,
  "alcohol_percent": number|null,
  "closure_type": string|null,
  "grapes": [{"name": string, "percentage": number|null}],
  "aromas": [{"tag": string, "intensity": number|null}],
  "structure": {"acidity": number|null, "tannin": number|null, "body": number|null, "sweetness": number|null, "oak": number|null},
  "pairings": [{"item": string, "category": string|null, "note": string|null}],
  "scores": [{"critic": string, "score": number|string, "year": number|null}],
  "short_description_de": string|null,
  "sources": [{"title": string, "url": string}],
  "confidence": "high"|"medium"|"low",
  "missing_fields": string[]
}

Regeln:
- Keine Felder außerhalb des Schemas.
- Fehlende Werte als null setzen.
- "quantity" standardmäßig 1.
- Zahlen als JSON-Zahl ausgeben (nicht als String).
- Antwortsprache für Texte: Deutsch.
`;
};

interface JsonImportModalProps {
  open: boolean;
  onClose: () => void;
  wines: Wine[];
  wishlistOnly: boolean;
  onImported: () => void;
  targetSubcellar: string;
  onTargetSubcellarChange: (value: string) => void;
  availableSubcellars: string[];
}

export const JsonImportModal: React.FC<JsonImportModalProps> = ({
  open,
  onClose,
  wines,
  wishlistOnly,
  onImported,
  targetSubcellar,
  onTargetSubcellarChange,
  availableSubcellars
}) => {
  const [aiInput, setAiInput] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [isJsonImporting, setIsJsonImporting] = useState(false);
  const [jsonCodeInput, setJsonCodeInput] = useState('');
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const openJsonImportPicker = () => {
    if (isJsonImporting) return;
    jsonFileInputRef.current?.click();
  };

  const importWinesFromJsonText = async (jsonText: string) => {
    setIsJsonImporting(true);
    try {
      const parsed = parseJsonInput(jsonText);
      const candidates = getImportCandidates(parsed);
      if (candidates.length === 0) {
        throw new Error('Keine importierbaren Weindaten gefunden.');
      }

      const mapped = candidates
        .map((entry: any, index: number) => normalizeImportedWine(entry, { wishlistOnly, fallbackName: `Importierter Wein ${index + 1}` }))
        .filter((entry: Partial<Wine> | null): entry is Partial<Wine> => Boolean(entry));

      if (mapped.length === 0) {
        throw new Error('JSON erkannt, aber keine gültigen Weinobjekte enthalten.');
      }

      let saved = 0;
      let failed = 0;
      let invalid = 0;
      let duplicateSkipped = 0;
      const normalizedTargetSubcellar = normalizeSubcellar(targetSubcellar);
      const knownWines = [...wines];
      for (const wine of mapped) {
        const wineWithTarget = {
          ...wine,
          subcellar: normalizeSubcellar(wine.subcellar) || normalizedTargetSubcellar || undefined
        };

        if (validateWineInput(wineWithTarget).length > 0) {
          invalid += 1;
          continue;
        }

        if (findLikelyDuplicates(wineWithTarget, knownWines).length > 0) {
          duplicateSkipped += 1;
          continue;
        }

        try {
          const savedWine = await storageService.saveWine(wineWithTarget);
          knownWines.push(savedWine);
          saved += 1;
        } catch {
          failed += 1;
        }
      }

      onImported();
      onClose();
      setAiInput('');
      setJsonCodeInput('');
      setGeneratedPrompt('');
      setPromptCopied(false);

      if (failed > 0 || invalid > 0 || duplicateSkipped > 0) {
        const parts = [`${saved} Wein(e) importiert`];
        if (invalid > 0) parts.push(`${invalid} Eintrag/Einträge waren ungültig`);
        if (duplicateSkipped > 0) parts.push(`${duplicateSkipped} Eintrag/Einträge übersprungen (bereits im Keller)`);
        if (failed > 0) parts.push(`${failed} Eintrag/Einträge konnten nicht gespeichert werden`);
        alert(`${parts.join(', ')}.`);
      } else {
        alert(`${saved} Wein(e) erfolgreich importiert und global verfügbar.`);
      }
    } catch (error: any) {
      console.error('JSON import failed:', error);
      alert(`JSON-Import fehlgeschlagen: ${error?.message || 'Ungültige Datei.'}\n\nTipp: Nur JSON einfügen oder den generierten Prompt nutzen und die Antwort 1:1 kopieren.`);
    } finally {
      setIsJsonImporting(false);
    }
  };

  const handleJsonImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileText = await file.text();
    await importWinesFromJsonText(fileText);
  };

  const handleJsonCodeImport = async () => {
    if (!jsonCodeInput.trim()) return;
    await importWinesFromJsonText(jsonCodeInput);
  };

  const handleGeneratePrompt = () => {
    const query = aiInput.trim();
    if (!query) return;
    setGeneratedPrompt(buildPromptForWine(query));
    setPromptCopied(false);
  };

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      alert('Prompt konnte nicht kopiert werden.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in">
      <input ref={jsonFileInputRef} type="file" accept=".json,application/json" onChange={handleJsonImport} className="hidden" />
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl border border-burgundy/5 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-alabaster flex justify-between items-center bg-alabaster/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-burgundy text-white rounded-2xl shadow-burgundy-glow">
              <Wand2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-2xl font-bold text-charcoal">JSON-Import</h3>
          </div>
          <button onClick={onClose} className="p-2">
            <X />
          </button>
        </div>
        <div className="p-10 space-y-10 overflow-y-auto">
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest">1) Wein eingeben</p>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Weinname & Jahrgang..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGeneratePrompt()}
                  className="flex-1 px-6 py-4 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-serif"
                />
                <button
                  onClick={handleGeneratePrompt}
                  disabled={!aiInput.trim()}
                  className="px-8 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                  PROMPT ERSTELLEN
                </button>
              </div>
            </div>

            {generatedPrompt ? (
              <div className="space-y-3 rounded-2xl border border-burgundy/10 bg-alabaster/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest">2) Prompt kopieren</p>
                  <button
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-2 rounded-xl border border-burgundy/25 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-burgundy hover:bg-burgundy/5"
                  >
                    {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {promptCopied ? 'Kopiert' : 'Kopieren'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={generatedPrompt}
                  rows={12}
                  className="w-full px-4 py-3 bg-white border-2 border-burgundy/10 rounded-2xl font-mono text-xs text-charcoal"
                />
                <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs text-stone-600">
                  <p className="font-semibold text-stone-700">So gehst du vor:</p>
                  <ol className="mt-2 list-decimal pl-4 space-y-1">
                    <li>Prompt in ChatGPT oder ein anderes Tool einfügen.</li>
                    <li>Nur JSON als Antwort erzeugen lassen.</li>
                    <li>JSON unten einfügen und mit „JSON-Code importieren“ übernehmen.</li>
                  </ol>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-4">
              <button onClick={openJsonImportPicker} disabled={isJsonImporting} className="text-[10px] font-black text-stone-gray hover:text-burgundy uppercase tracking-widest disabled:opacity-50">
                {isJsonImporting ? 'Import läuft...' : 'JSON-Datei hochladen'}
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">Unterkeller (optional)</p>
              <input
                list="subcellar-options"
                type="text"
                value={targetSubcellar}
                onChange={(e) => onTargetSubcellarChange(e.target.value)}
                placeholder={`${MAIN_CELLAR_LABEL} wenn leer`}
                className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 text-sm text-charcoal"
              />
              <datalist id="subcellar-options">
                {availableSubcellars.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="pt-2 border-t border-alabaster/80 space-y-3">
              <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">Oder JSON-Code einfügen</p>
              <textarea
                value={jsonCodeInput}
                onChange={(e) => setJsonCodeInput(e.target.value)}
                placeholder='{"name":"...","vintage":2024,...} oder {"success":true,"data":{...}}'
                rows={6}
                className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-mono text-xs text-charcoal"
              />
              <button
                onClick={handleJsonCodeImport}
                disabled={isJsonImporting || !jsonCodeInput.trim()}
                className="w-full py-3 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
              >
                {isJsonImporting ? 'Import läuft...' : 'JSON-Code importieren'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
