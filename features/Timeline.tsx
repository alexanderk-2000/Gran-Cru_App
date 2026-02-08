
import React from 'react';
import { Wine } from '../types.ts';

export const Timeline: React.FC<{ wines: Wine[] }> = ({ wines }) => {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 35;
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <header className="flex flex-col gap-2">
        <h2 className="font-serif text-4xl font-bold text-charcoal">Reife-Horizont</h2>
        <p className="text-stone-gray font-medium tracking-wide">Dynamische Visualisierung der optimalen Trinkfenster Ihrer Weine.</p>
      </header>

      <div className="bg-white border border-burgundy/5 rounded-3xl overflow-hidden shadow-premium">
        <div className="overflow-x-auto p-8">
          <div className="relative" style={{ width: `${years.length * 80}px` }}>
            {/* Timeline Header */}
            <div className="flex border-b border-alabaster mb-8 pb-4">
              {years.map(year => (
                <div key={year} className="w-20 text-center flex flex-col gap-1 items-center">
                   <span className={`text-xs font-bold transition-colors ${year === currentYear ? 'text-burgundy' : 'text-stone-gray'}`}>
                    {year}
                  </span>
                  {year === currentYear && <div className="w-1 h-1 bg-burgundy rounded-full" />}
                </div>
              ))}
            </div>

            {/* Current Year Marker Line */}
            <div 
              className="absolute top-0 bottom-0 border-l border-burgundy/10 z-0" 
              style={{ left: `${(currentYear - startYear) * 80 + 40}px` }}
            />

            {/* Wine Tracks */}
            <div className="space-y-6">
              {wines.filter(w => !w.wishlist).map((wine) => {
                const startPos = Math.max(0, (wine.drink_start - startYear) * 80);
                const width = Math.max(20, (wine.drink_end - wine.drink_start + 1) * 80);

                return (
                  <div key={wine.id} className="relative h-12 flex items-center group">
                    <div className="sticky left-0 z-20 pointer-events-none">
                      <div className="bg-white/80 backdrop-blur border border-burgundy/5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-charcoal w-40 whitespace-nowrap overflow-hidden text-ellipsis shadow-sm">
                        {wine.vintage} {wine.name}
                      </div>
                    </div>

                    {/* Window Bar */}
                    <div 
                      className={`
                        absolute h-5 rounded-full z-0 transition-all duration-300 shadow-sm
                        ${wine.drink_start <= currentYear && wine.drink_end >= currentYear ? 'bg-sage shadow-md' : 'bg-alabaster border border-burgundy/5'}
                        ${wine.drink_end < currentYear ? 'bg-red-100' : ''}
                        ${wine.drink_start > currentYear ? 'bg-burgundy/5 border border-burgundy/10' : ''}
                      `}
                      style={{ left: `${startPos}px`, width: `${width}px` }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] font-black text-charcoal whitespace-nowrap px-2">
                           {wine.drink_start} - {wine.drink_end}
                         </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="bg-alabaster p-6 flex flex-wrap gap-6 border-t border-burgundy/5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-sage rounded-full" />
            <span className="text-xs text-stone-gray">Optimales Fenster</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-burgundy/5 border border-burgundy/10 rounded-full" />
            <span className="text-xs text-stone-gray">In Reifung</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 rounded-full" />
            <span className="text-xs text-stone-gray">Peak überschritten</span>
          </div>
        </div>
      </div>
    </div>
  );
};
