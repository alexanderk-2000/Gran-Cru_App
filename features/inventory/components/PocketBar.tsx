import React from 'react';
import { Plus } from 'lucide-react';
import type { PocketSummary } from '../inventorySelectors.ts';

interface PocketBarProps {
  pocketSummaries: PocketSummary[];
  subcellarFilter: string;
  draggedWineId: string | null;
  dropTargetPocketId: string | null;
  onSelectPocket: (pocketId: string) => void;
  onOpenCreateModal: () => void;
  onDragOver: (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => void;
  onDrop: (event: React.DragEvent<HTMLButtonElement>, pocketId: string) => void;
  onDragEnter: (pocketId: string) => void;
  onDragLeave: (pocketId: string) => void;
}

export const PocketBar: React.FC<PocketBarProps> = ({
  pocketSummaries,
  subcellarFilter,
  draggedWineId,
  dropTargetPocketId,
  onSelectPocket,
  onOpenCreateModal,
  onDragOver,
  onDrop,
  onDragEnter,
  onDragLeave
}) => (
  <section className="rounded-[1.8rem] border-2 border-burgundy/5 bg-white p-4 shadow-premium">
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-stone-gray">Pockets</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
          {draggedWineId ? 'Jetzt auf eine Pocket ziehen' : 'Wie Unterkonten im Hauptkeller'}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenCreateModal}
        className="inline-flex items-center gap-1 rounded-xl border border-burgundy/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-burgundy transition-all hover:border-burgundy/40 hover:bg-burgundy/5"
      >
        <Plus className="h-3.5 w-3.5" />
        Pocket
      </button>
    </div>
    <div className="flex flex-wrap gap-2">
      {pocketSummaries.map((pocket) => {
        const active = subcellarFilter === pocket.id;
        const canDrop = Boolean(draggedWineId) && pocket.id !== 'All';
        const isDropTarget = dropTargetPocketId === pocket.id && canDrop;
        return (
          <button
            key={pocket.id}
            type="button"
            onClick={() => onSelectPocket(pocket.id)}
            onDragOver={(event) => onDragOver(event, pocket.id)}
            onDrop={(event) => void onDrop(event, pocket.id)}
            onDragEnter={() => onDragEnter(pocket.id)}
            onDragLeave={() => {
              if (isDropTarget) onDragLeave(pocket.id);
            }}
            className={`rounded-xl border px-3 py-2 text-left transition-all ${
              isDropTarget
                ? 'border-burgundy bg-burgundy/15 text-burgundy shadow-sm'
                : active
                  ? 'border-burgundy/40 bg-burgundy/10 text-burgundy'
                  : 'border-stone-200 bg-alabaster/50 text-stone-700 hover:border-burgundy/20'
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.12em]">{pocket.label}</p>
            <p className="mt-1 text-[11px] text-stone-600">
              {pocket.wineCount} Weine · {pocket.bottleCount} Fl.
            </p>
          </button>
        );
      })}
    </div>
  </section>
);
