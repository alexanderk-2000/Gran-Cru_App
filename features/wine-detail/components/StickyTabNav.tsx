import { memo, useEffect, useRef } from 'react';
import { TAB_ITEMS, type TabId } from '../tabs.ts';

export const StickyTabNav = memo(function StickyTabNav({
  active,
  onChange,
  tastingCount
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  tastingCount: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const activeButton = buttonRefs.current[active];
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);

  return (
    <div className="sticky top-3 z-20 mt-6">
      <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
        <div ref={containerRef} className="-mx-1 flex overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAB_ITEMS.map((tab) => {
            const label = tab.id === 'notes' ? `${tab.label} (${tastingCount})` : tab.label;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                ref={(node) => {
                  buttonRefs.current[tab.id] = node;
                }}
                onClick={() => onChange(tab.id)}
                className={`relative mx-1 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  isActive ? 'bg-[#5B1E2D] text-white shadow-[0_8px_18px_rgba(91,30,45,0.25)]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
