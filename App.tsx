
import React, { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Auth } from './components/Auth.tsx';
import { FeedbackProvider } from './components/Feedback.tsx';
import { AlertCircle } from 'lucide-react';
import { Wine, UserProfile } from './types.ts';
import { storageService } from './services/storage.ts';
import { supabase, isConfigured } from './services/supabase.ts';
import { runSyncCycle, clearOfflineUserAndQueues } from './services/pwa/syncEngine.ts';

const Dashboard = lazy(() => import('./features/Dashboard.tsx').then((m) => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./features/Inventory.tsx').then((m) => ({ default: m.Inventory })));
const Timeline = lazy(() => import('./features/Timeline.tsx').then((m) => ({ default: m.Timeline })));
const WineDetail = lazy(() => import('./features/WineDetail.tsx').then((m) => ({ default: m.WineDetail })));
const EnjoymentPlan = lazy(() => import('./features/EnjoymentPlan.tsx').then((m) => ({ default: m.EnjoymentPlan })));
const Trash = lazy(() => import('./features/Trash.tsx').then((m) => ({ default: m.Trash })));
const Stocktake = lazy(() => import('./features/Stocktake.tsx').then((m) => ({ default: m.Stocktake })));
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

const MissingConfigScreen: React.FC = () => (
  <div className="min-h-screen bg-alabaster flex items-center justify-center px-6">
    <div className="max-w-xl w-full bg-white rounded-[2rem] border-2 border-red-100 p-8 shadow-premium text-center">
      <div className="inline-flex items-center justify-center p-4 bg-red-50 rounded-2xl mb-6">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h1 className="font-serif text-3xl text-burgundy mb-3">Konfiguration fehlt</h1>
      <p className="text-stone-gray leading-relaxed mb-6">
        Die Verbindung zu Supabase konnte nicht hergestellt werden. Bitte stellen Sie sicher, dass die Umgebungsvariablen
        <code className="mx-1 px-1.5 py-0.5 bg-alabaster rounded border border-burgundy/10 text-burgundy text-xs font-mono">VITE_SUPABASE_URL</code>
        und
        <code className="mx-1 px-1.5 py-0.5 bg-alabaster rounded border border-burgundy/10 text-burgundy text-xs font-mono">VITE_SUPABASE_ANON_KEY</code>
        korrekt gesetzt sind.
      </p>
      <div className="p-4 bg-red-50/50 rounded-xl text-left border border-red-100">
        <p className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-2">Checkliste:</p>
        <ul className="text-xs text-red-800 space-y-1">
          <li>• Vercel Dashboard → Project Settings → Environment Variables</li>
          <li>• Lokale Entwicklung: <code className="text-red-900 font-mono">.env.local</code> erstellt?</li>
          <li>• Wurde die App nach dem Ändern neu deployed?</li>
        </ul>
      </div>
    </div>
  </div>
);

/**
 * Toasts and confirm dialogs need to be available everywhere, including the
 * loading/auth/offline screens App renders before any route exists - so the
 * provider wraps the whole shell rather than sitting inside HashRouter.
 */
const App: React.FC = () => (
  <FeedbackProvider>
    <AppShell />
  </FeedbackProvider>
);

const AppShell: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const activeUserIdRef = useRef<string | null>(null);

  const fetchWines = useCallback(async () => {
    try {
      const data = await storageService.getWines();
      setWines(data);
    } catch (err) {
      console.error('Failed to fetch wines:', err);
    } finally {
      setLoading(false);
    }
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
        activeUserIdRef.current = session.user.id;
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
      const previousUserId = activeUserIdRef.current;

      if (session?.user) {
        // Account switch without an explicit logout: purge the outgoing user's local data first.
        if (previousUserId && previousUserId !== session.user.id) {
          void clearOfflineUserAndQueues(previousUserId);
        }
        activeUserIdRef.current = session.user.id;
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          currency: 'EUR',
          target_date: '2044-12-31'
        });
        void fetchWines();
        void runSyncCycle(storageService);
      } else {
        // Session expired, was revoked, or auto-signed-out: lock/clear the previous user's local data.
        if (previousUserId) {
          void clearOfflineUserAndQueues(previousUserId);
        }
        activeUserIdRef.current = null;
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

  if (!isConfigured) {
    return <MissingConfigScreen />;
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
                <Inventory wines={wines} onWineUpdate={fetchWines} />
              }
            />
            <Route path="/timeline" element={<Timeline wines={wines} />} />
            <Route path="/genussplan" element={<EnjoymentPlan />} />
            <Route
              path="/wishlist"
              element={
                <Inventory wines={wines} wishlistOnly onWineUpdate={fetchWines} />
              }
            />
            <Route path="/wine/:id" element={<WineDetail onChanged={fetchWines} />} />
            <Route path="/trash" element={<Trash onUpdate={fetchWines} />} />
            <Route path="/stocktake" element={<Stocktake wines={wines} onUpdate={fetchWines} />} />
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
