import { Link } from 'react-router-dom';
import { Plus, ShoppingCart } from 'lucide-react';

export const DashboardHeader = () => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="font-serif text-[2.1rem] leading-tight text-charcoal">Portfolio</h2>
      <p className="mt-1 text-sm text-stone-gray">Private Kellerverwaltung</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 rounded-xl bg-burgundy px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white"
      >
        <Plus className="h-4 w-4" />
        Wein hinzufügen
      </Link>
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-stone-700"
      >
        <ShoppingCart className="h-4 w-4" />
        Einkauf erfassen
      </Link>
    </div>
  </header>
);
