import React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { normalizeSubcellar } from '../../../domain/wine/normalization.ts';

interface CreatePocketModalProps {
  open: boolean;
  newPocketName: string;
  onNewPocketNameChange: (value: string) => void;
  isPocketSaving: boolean;
  onCreate: () => void;
  onClose: () => void;
}

export const CreatePocketModal: React.FC<CreatePocketModalProps> = ({
  open,
  newPocketName,
  onNewPocketNameChange,
  isPocketSaving,
  onCreate,
  onClose
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-charcoal/35 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-[2rem] border border-burgundy/10 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-2xl text-charcoal">Neue Pocket</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-stone-gray transition-all hover:bg-alabaster hover:text-charcoal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-gray">Lege eine Pocket wie ein Unterkonto an.</p>
        <input
          type="text"
          value={newPocketName}
          onChange={(e) => onNewPocketNameChange(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCreate();
            }
          }}
          placeholder="z. B. Bordeaux Collection"
          className="w-full rounded-2xl border-2 border-burgundy/10 bg-alabaster px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-burgundy/35"
          autoFocus
        />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-stone-700 transition-all hover:bg-alabaster"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={isPocketSaving || !normalizeSubcellar(newPocketName)}
            className="inline-flex items-center gap-2 rounded-xl bg-burgundy px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition-all hover:bg-burgundy-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPocketSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Anlegen
          </button>
        </div>
      </div>
    </div>
  );
};
