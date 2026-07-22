import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, X } from 'lucide-react';
import type { Wine } from '../../../types.ts';
import { storageService } from '../../../services/storage.ts';
import {
  CSV_FIELD_DEFINITIONS,
  type CsvColumnMapping,
  type CsvImportRowResult,
  evaluateCsvImportRows,
  guessCsvColumnMapping,
  parseCsvText,
} from '../../../domain/wine/csvImport.ts';
import { MAIN_CELLAR_LABEL } from '../constants.ts';

type Step = 'upload' | 'mapping' | 'preview';

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  wines: Wine[];
  wishlistOnly: boolean;
  onImported: () => void;
  targetSubcellar: string;
  onTargetSubcellarChange: (value: string) => void;
  availableSubcellars: string[];
}

const NO_COLUMN = '__none__';

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  open,
  onClose,
  wines,
  wishlistOnly,
  onImported,
  targetSubcellar,
  onTargetSubcellarChange,
  availableSubcellars,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [results, setResults] = useState<CsvImportRowResult[]>([]);
  const [pasteInput, setPasteInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStep('upload');
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setResults([]);
    setPasteInput('');
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const loadCsvText = (csvText: string) => {
    const rows = parseCsvText(csvText);
    if (rows.length === 0) {
      alert('Keine Daten in der CSV-Datei gefunden.');
      return;
    }
    const [headerRow, ...rest] = rows;
    if (rest.length === 0) {
      alert('Die CSV-Datei enthält nur eine Kopfzeile, aber keine Weine.');
      return;
    }
    setHeaders(headerRow);
    setDataRows(rest);
    setMapping(guessCsvColumnMapping(headerRow));
    setStep('mapping');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    loadCsvText(await file.text());
  };

  const missingRequiredFields = useMemo(
    () => CSV_FIELD_DEFINITIONS.filter((definition) => definition.required && mapping[definition.key] === undefined),
    [mapping]
  );

  const handleShowPreview = () => {
    if (missingRequiredFields.length > 0) return;
    const normalizedTargetSubcellar = targetSubcellar;
    setResults(
      evaluateCsvImportRows(dataRows, mapping, wines, { wishlistOnly, targetSubcellar: normalizedTargetSubcellar })
    );
    setStep('preview');
  };

  const validRows = useMemo(() => results.filter((result) => result.errors.length === 0 && !result.isDuplicate), [results]);
  const invalidRowCount = results.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    let saved = 0;
    let failed = 0;
    try {
      for (const result of validRows) {
        try {
          await storageService.saveWine(result.wine);
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      onImported();
      handleClose();
      const parts = [`${saved} Wein(e) importiert`];
      if (invalidRowCount > 0) parts.push(`${invalidRowCount} Zeile(n) übersprungen (ungültig oder Duplikat)`);
      if (failed > 0) parts.push(`${failed} Eintrag/Einträge konnten nicht gespeichert werden`);
      alert(`${parts.join(', ')}.`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/40 backdrop-blur-md animate-in fade-in">
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
      <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl border border-burgundy/5 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-alabaster flex justify-between items-center bg-alabaster/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-burgundy text-white rounded-2xl shadow-burgundy-glow">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-charcoal">CSV-Import</h3>
              <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest">
                {step === 'upload' ? 'Schritt 1 von 3 · Datei' : step === 'mapping' ? 'Schritt 2 von 3 · Spaltenzuordnung' : 'Schritt 3 von 3 · Vorschau'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2" disabled={isImporting}>
            <X />
          </button>
        </div>

        <div className="p-10 space-y-8 overflow-y-auto">
          {step === 'upload' && (
            <div className="space-y-6">
              <p className="text-sm text-stone-gray">
                Lade eine CSV-Datei hoch oder füge den Inhalt ein. Die erste Zeile muss die Spaltenüberschriften enthalten
                (Komma oder Semikolon getrennt).
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-burgundy/20 rounded-2xl text-burgundy font-black uppercase tracking-widest text-[10px] hover:border-burgundy/40"
              >
                CSV-Datei auswählen
              </button>
              <div className="pt-2 border-t border-alabaster/80 space-y-3">
                <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">Oder CSV-Inhalt einfügen</p>
                <textarea
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder={'name,vintage,quantity,purchase_price\nChateau Test,2019,3,45.5'}
                  rows={6}
                  className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 font-mono text-xs text-charcoal"
                />
                <button
                  onClick={() => loadCsvText(pasteInput)}
                  disabled={!pasteInput.trim()}
                  className="w-full py-3 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                  Weiter zur Spaltenzuordnung
                </button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-6">
              <p className="text-sm text-stone-gray">
                {dataRows.length} Zeile(n) erkannt. Ordne jeder Feldbezeichnung die passende CSV-Spalte zu (bereits automatisch
                vorbelegt, wo möglich). Mit * markierte Felder sind Pflicht.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {CSV_FIELD_DEFINITIONS.map((definition) => (
                  <label key={definition.key} className="block text-xs text-stone-gray">
                    {definition.label}
                    {definition.required ? ' *' : ''}
                    <select
                      value={mapping[definition.key] ?? NO_COLUMN}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMapping((prev) => ({
                          ...prev,
                          [definition.key]: value === NO_COLUMN ? undefined : Number(value),
                        }));
                      }}
                      className="mt-1 w-full px-3 py-2.5 bg-alabaster border-2 border-burgundy/5 rounded-xl focus:outline-none focus:border-burgundy/30 text-sm text-charcoal"
                    >
                      <option value={NO_COLUMN}>— nicht zuordnen —</option>
                      {headers.map((header, index) => (
                        <option key={`${definition.key}-${index}`} value={index}>
                          {header || `Spalte ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-stone-gray uppercase tracking-widest text-center">Unterkeller (optional, falls nicht in der CSV)</p>
                <input
                  list="csv-subcellar-options"
                  type="text"
                  value={targetSubcellar}
                  onChange={(e) => onTargetSubcellarChange(e.target.value)}
                  placeholder={`${MAIN_CELLAR_LABEL} wenn leer`}
                  className="w-full px-4 py-3 bg-alabaster border-2 border-burgundy/5 rounded-2xl focus:outline-none focus:border-burgundy/30 text-sm text-charcoal"
                />
                <datalist id="csv-subcellar-options">
                  {availableSubcellars.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              {missingRequiredFields.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Bitte noch zuordnen: {missingRequiredFields.map((definition) => definition.label).join(', ')}.</span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 py-3 bg-white border-2 border-burgundy/15 text-burgundy rounded-2xl font-black uppercase tracking-widest text-[10px]"
                >
                  Zurück
                </button>
                <button
                  onClick={handleShowPreview}
                  disabled={missingRequiredFields.length > 0}
                  className="flex-1 py-3 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                  Vorschau anzeigen
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest">
                <span className="px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200">{validRows.length} gültig</span>
                {invalidRowCount > 0 && (
                  <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {invalidRowCount} übersprungen
                  </span>
                )}
              </div>
              <div className="border border-alabaster rounded-2xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto divide-y divide-alabaster">
                  {results.map((result) => {
                    const isValid = result.errors.length === 0 && !result.isDuplicate;
                    return (
                      <div key={result.rowNumber} className="flex items-start gap-3 px-4 py-3 text-sm">
                        <span className="mt-0.5">
                          {isValid ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-charcoal truncate">
                            Zeile {result.rowNumber}: {result.wine.name || '(ohne Name)'} {result.wine.vintage ? `· ${result.wine.vintage}` : ''}
                          </p>
                          {result.isDuplicate && <p className="text-xs text-amber-700">Bereits im Keller vorhanden (Duplikat).</p>}
                          {result.errors.map((error) => (
                            <p key={error.field} className="text-xs text-amber-700">
                              {error.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('mapping')}
                  disabled={isImporting}
                  className="flex-1 py-3 bg-white border-2 border-burgundy/15 text-burgundy rounded-2xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  Zurück
                </button>
                <button
                  onClick={handleImport}
                  disabled={isImporting || validRows.length === 0}
                  className="flex-1 py-3 bg-burgundy text-white rounded-2xl font-black hover:bg-burgundy-light transition-all disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                  {isImporting ? 'Import läuft...' : `${validRows.length} Wein(e) importieren`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
