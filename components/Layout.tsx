
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wine as WineIcon,
  Clock,
  Heart,
  Menu,
  X,
  Plus,
  ScanLine,
  CalendarDays,
  ShieldCheck,
  LogOut,
  Sparkles,
  Trash2,
  Settings as SettingsIcon,
  History,
  ClipboardList
} from 'lucide-react';
import { storageService } from '../services/storage.ts';
import { UserProfile } from '../types.ts';

const navGroups = [
  {
    title: 'Keller',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/inventory', label: 'Keller', icon: WineIcon },
      { path: '/wishlist', label: 'Wunschliste', icon: Heart },
      { path: '/stocktake', label: 'Inventur', icon: ClipboardList },
      { path: '/trash', label: 'Papierkorb', icon: Trash2 }
    ]
  },
  {
    title: 'Planung',
    items: [
      { path: '/genussplan', label: 'Anlässe', icon: CalendarDays },
      { path: '/timeline', label: 'Zeitachse', icon: Clock }
    ]
  },
  {
    title: 'Historie',
    items: [{ path: '/drink-history', label: 'Trinkhistorie', icon: History }]
  },
  {
    title: 'System',
    items: [{ path: '/settings', label: 'Einstellungen', icon: SettingsIcon }]
  }
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const location = useLocation();

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await storageService.getCurrentUser();
      setUser(currentUser);
    };
    fetchUser();
  }, []);

  const handleLogout = () => {
    storageService.logout();
  };

  const isGuest = user?.email === 'Gast-Sammler';

  const winesLabel = isGuest ? 'Demo-Modus' : 'Angemeldet';

  return (
    <div className="min-h-screen bg-alabaster flex flex-col text-charcoal">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-line sticky top-0 z-40">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-burgundy text-alabaster flex items-center justify-center">
            <WineIcon className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="font-serif text-lg font-bold text-burgundy">Grand Cru</span>
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Menü öffnen"
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-charcoal hover:bg-alabaster"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-charcoal/40 z-[60] md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[70] w-64 flex flex-col gap-7 px-4 pt-7 pb-6 bg-white border-r border-line transition-transform duration-300 overflow-y-auto
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="flex items-center justify-between px-2">
          <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-[10px] bg-burgundy text-alabaster flex items-center justify-center">
              <WineIcon className="w-5 h-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-serif text-xl font-bold leading-none text-burgundy">Grand Cru</span>
              <span className="text-[11px] tracking-[0.12em] uppercase text-stone-gray">Vault &amp; Portfolio</span>
            </span>
          </Link>
          <button
            type="button"
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-stone-gray hover:bg-alabaster"
            onClick={() => setSidebarOpen(false)}
            aria-label="Menü schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 px-2">
          <Link
            to="/inventory?add=1"
            onClick={() => setSidebarOpen(false)}
            className="flex-1 h-11 rounded-[10px] bg-burgundy text-white flex items-center justify-center gap-2 text-sm font-semibold hover:bg-burgundy-dark transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Wein erfassen
          </Link>
          <Link
            to="/inventory?scan=1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Etikett scannen"
            className="w-11 h-11 rounded-[10px] border border-line-strong text-charcoal flex items-center justify-center hover:bg-alabaster transition-colors"
          >
            <ScanLine className="w-[18px] h-[18px]" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1">
          <div className="space-y-6">
            {navGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-0.5">
                <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-stone-gray uppercase">{group.title}</p>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-colors ${isActive
                        ? 'bg-burgundy-tint text-burgundy font-semibold'
                        : 'text-charcoal-soft font-medium hover:bg-sand'
                        }`}
                    >
                      <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="flex flex-col gap-3 p-4 rounded-xl bg-alabaster border border-line">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${isGuest ? 'bg-gold' : 'bg-sage'}`} />
            <span className={`text-xs font-semibold ${isGuest ? 'text-gold-dim' : 'text-sage'}`}>{winesLabel}</span>
            <ShieldCheck className="w-4 h-4 ml-auto text-stone-gray" aria-label="Cloud Sync aktiv" />
          </div>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="w-8 h-8 shrink-0 rounded-full bg-burgundy-tint text-burgundy flex items-center justify-center text-[13px] font-bold uppercase"
            >
              {isGuest ? <Sparkles className="w-4 h-4" /> : (user?.email?.[0] ?? '?')}
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-semibold truncate">{isGuest ? 'Gast-Sammler' : user?.email}</span>
              <span className="text-xs text-stone-gray">Privater Keller</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label={isGuest ? 'Demo beenden' : 'Abmelden'}
              title={isGuest ? 'Beenden' : 'Abmelden'}
              className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-stone-gray hover:text-burgundy hover:bg-white transition-colors"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 md:pl-64">
        <main className="min-h-screen px-4 md:px-12 pt-6 md:pt-10 pb-24 md:pb-16">
          <div className="max-w-[1120px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
