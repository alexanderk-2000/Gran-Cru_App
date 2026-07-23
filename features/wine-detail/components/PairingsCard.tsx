import { memo } from 'react';
import { Utensils } from 'lucide-react';
import { ACCENT_BURGUNDY } from '../colors.ts';
import { pairingIconLabel, type PairingItem } from '../wineDetailSelectors.ts';

export const PairingsCard = memo(function PairingsCard({ pairings }: { pairings: PairingItem[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <h3 className="mb-5 flex items-center gap-2 font-serif text-xl text-stone-900">
        <Utensils className="h-5 w-5" style={{ color: ACCENT_BURGUNDY }} /> Pairing
      </h3>

      {pairings.length === 0 ? (
        <p className="text-sm text-stone-500">Keine Pairing-Daten vorhanden.</p>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => (
            <article key={`${pairing.item}-${pairing.category ?? ''}`} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-900">{pairing.item}</p>
                <span className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{pairingIconLabel(pairing.category)}</span>
              </div>
              {pairing.note ? <p className="text-sm leading-6 text-stone-600">{pairing.note}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
});
