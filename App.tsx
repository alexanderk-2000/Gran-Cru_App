
import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Auth } from './components/Auth.tsx';
import { Wine, UserProfile } from './types.ts';
import { storageService } from './services/storage.ts';
import { supabase } from './services/supabase.ts';
import { runSyncCycle } from './services/pwa/syncEngine.ts';

const Dashboard = lazy(() => import('./features/Dashboard.tsx').then((m) => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./features/Inventory.tsx').then((m) => ({ default: m.Inventory })));
const Timeline = lazy(() => import('./features/Timeline.tsx').then((m) => ({ default: m.Timeline })));
const WineDetail = lazy(() => import('./features/WineDetail.tsx').then((m) => ({ default: m.WineDetail })));
const EnjoymentPlan = lazy(() => import('./features/EnjoymentPlan.tsx').then((m) => ({ default: m.EnjoymentPlan })));
const Trash = lazy(() => import('./features/Trash.tsx').then((m) => ({ default: m.Trash })));
const Settings = lazy(() => import('./features/Settings.tsx').then((m) => ({ default: m.Settings })));
const DrinkHistory = lazy(() => import('./features/DrinkHistory.tsx').then((m) => ({ default: m.DrinkHistory })));

const OfflineLockScreen: React.FC = () => (
  <div className="min-h-screen bg-alabaster flex items-center justify-center px-6">
    <div className="max-w-xl w-full bg-white rounded-[2rem] border border-burgundy/10 p-8 shadow-premium">
      <h1 className="font-serif text-3xl text-burgundy mb-3">Offline gesperrt</h1>
      <p className="text-stone-gray leading-relaxed">
        Ohne aktive Session ist der Offline-Zugriff gesperrt. Verbinde dich kurz mit dem Internet
        und melde dich an, um den lokalen Datenbestand wieder freizuschalten.
      </p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const fetchWines = useCallback(async () => {
    const data = await storageService.getWines();
    setWines(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleOnlineState = () => {
      setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    };
    window.addEventListener('online', handleOnlineState);
    window.addEventListener('offline', handleOnlineState);

    // Check current session
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          currency: 'EUR',
          target_date: '2044-12-31'
        });
        await fetchWines();
        void runSyncCycle(storageService);
      } else {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          currency: 'EUR',
          target_date: '2044-12-31'
        });
        void fetchWines();
        void runSyncCycle(storageService);
      } else {
        setUser(null);
        setWines([]);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnlineState);
      window.removeEventListener('offline', handleOnlineState);
    };
  }, [fetchWines]);

  const handleDrink = async (wine: Wine) => {
    if (wine.quantity <= 0) return;

    // Optimistic UI update
    setWines(prev => prev.map(w =>
      w.id === wine.id ? { ...w, quantity: w.quantity - 1 } : w
    ));

    try {
      await storageService.consumeBottle(wine.id, 'detail');
      await fetchWines();
    } catch (err) {
      console.error("Failed to record drink:", err);
      // Rollback on error if necessary
      await fetchWines();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-burgundy border-t-gold rounded-full animate-spin" />
          <p className="font-serif text-burgundy tracking-widest uppercase text-xs">Authentifizierung läuft...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (!online) {
      return <OfflineLockScreen />;
    }
    return <Auth onLogin={() => { /* Handled by AuthChange listener */ }} />;
  }

  return (
    <HashRouter>
      <Layout>
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-burgundy border-t-gold" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Dashboard wines={wines} />} />
            <Route
              path="/inventory"
              element={
                <Inventory
                  wines={wines}
                  onWineUpdate={fetchWines}
                  onAddBottle={() => {}}
                  onDrink={handleDrink}
                />
              }
            />
            <Route path="/timeline" element={<Timeline wines={wines} />} />
            <Route path="/genussplan" element={<EnjoymentPlan />} />
            <Route
              path="/wishlist"
              element={
                <Inventory
                  wines={wines}
                  wishlistOnly
                  onWineUpdate={fetchWines}
                  onAddBottle={() => {}}
                  onDrink={() => {}}
                />
              }
            />
            <Route path="/wine/:id" element={<WineDetail onDrink={handleDrink} />} />
            <Route path="/trash" element={<Trash onUpdate={fetchWines} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/drink-history" element={<DrinkHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
};

export default App;
