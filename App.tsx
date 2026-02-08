
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Dashboard } from './features/Dashboard.tsx';
import { Inventory } from './features/Inventory.tsx';
import { Timeline } from './features/Timeline.tsx';
import { WineDetail } from './features/WineDetail.tsx';
import { EnjoymentPlan } from './features/EnjoymentPlan.tsx';
import { Trash } from './features/Trash.tsx';
import { Settings } from './features/Settings.tsx';
import { DrinkHistory } from './features/DrinkHistory.tsx';
import { Auth } from './components/Auth.tsx';
import { Wine, UserProfile } from './types.ts';
import { storageService } from './services/storage.ts';
import { supabase } from './services/supabase.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWines = useCallback(async () => {
    const data = await storageService.getWines();
    setWines(data);
    setLoading(false);
  }, []);

  useEffect(() => {
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
        fetchWines();
      } else {
        setUser(null);
        setWines([]);
      }
    });

    return () => subscription.unsubscribe();
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
    return <Auth onLogin={() => { /* Handled by AuthChange listener */ }} />;
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard wines={wines} />} />
          <Route
            path="/inventory"
            element={
              <Inventory
                wines={wines}
                onWineUpdate={fetchWines}
                onAddBottle={() => { }}
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
                onAddBottle={() => { }}
                onDrink={() => { }}
              />
            }
          />
          <Route
            path="/wine/:id"
            element={<WineDetail onDrink={handleDrink} />}
          />
          <Route
            path="/trash"
            element={<Trash onUpdate={fetchWines} />}
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/drink-history" element={<DrinkHistory />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
