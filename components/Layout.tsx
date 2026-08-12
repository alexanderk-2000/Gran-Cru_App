
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wine as WineIcon,
  Clock,
  Heart,
  Menu,
  X,
  CircleDot,
  CalendarDays,
  LogOut,
  Sparkles,
  Trash2,
  Settings as SettingsIcon,
  History,
  ClipboardList
} from 'lucide-react';
import { storageService } from '../services/storage.ts';
import { SyncStatus } from './SyncStatus.tsx';
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

  return (
    <div className="min-h-screen bg-alabaster flex flex-col text-charcoal">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-burgundy/5 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <CircleDot className="text-burgundy w-6 h-6" />
          <h1 className="font-serif text-lg font-bold tracking-tight text-burgundy">Grand Cru</h1>
        </div>
        <div className="flex items-center gap-1">
          <SyncStatus variant="compact" />
          <button onClick={() => setSidebarOpen(true)} aria-label="Menü öffnen">
            <Menu className="text-burgundy" />
          </button>
        </div>
      </header>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Fixed on desktop, slide-over on mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-[70] w-64 flex flex-col bg-white border-r border-burgundy/10 transition-transform duration-300 shadow-premium
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-burgundy rounded-lg shadow-burgundy-glow">
              <WineIcon className="w-6 h-6 text-alabaster" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-xl font-bold text-burgundy leading-none">CRU</span>
              <span className="text-[10px] tracking-[0.2em] text-stone-gray font-medium uppercase">Vault & Portfolio</span>
            </div>
          </div>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-6 h-6 text-stone-gray" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 overflow-y-auto">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-1.5">
                <p className="px-3 text-[10px] tracking-[0.12em] text-stone-gray/80 uppercase">{group.title}</p>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                        ${isActive
                          ? 'bg-white text-charcoal border border-burgundy/15 shadow-[0_4px_10px_rgba(40,35,37,0.06)]'
                          : 'text-stone-gray hover:bg-alabaster/70 hover:text-charcoal'}
                      `}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-burgundy' : 'group-hover:text-burgundy transition-colors'}`} />
                      <span className={`${isActive ? 'font-medium' : 'font-normal'}`}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="p-6 border-t border-alabaster space-y-4">
          <div className={`p-4 rounded-xl border flex flex-col gap-2 ${isGuest ? 'bg-gold/5 border-gold/10' : 'bg-alabaster border-burgundy/5'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${isGuest ? 'bg-gold' : 'bg-sage'}`} />
              <span className="text-[9px] font-black text-stone-gray uppercase tracking-widest">
                {isGuest ? 'Demo-Modus' : 'Verbunden als'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isGuest && <Sparkles className="w-3 h-3 text-gold" />}
              <span className="text-xs text-charcoal font-bold truncate">
                {isGuest ? 'Gast-Sammler' : user?.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="mt-2 flex items-center gap-2 text-[10px] font-black text-burgundy/60 hover:text-burgundy transition-colors uppercase tracking-widest"
            >
              <LogOut className="w-3 h-3" />
              {isGuest ? 'Beenden' : 'Abmelden'}
            </button>
          </div>

          <SyncStatus />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 transition-all duration-300">
        <main className="min-h-screen p-4 md:p-10 pb-24 md:pb-10 relative">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>

          {/* Decorative Gradients */}
          <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-gold/5 blur-[120px] pointer-events-none z-0" />
          <div className="fixed bottom-0 left-0 w-[300px] h-[300px] bg-burgundy/5 blur-[100px] pointer-events-none z-0" />
        </main>
      </div>
    </div>
  );
};
