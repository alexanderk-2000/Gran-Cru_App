import React, { useEffect, useState } from 'react';
import { Download, RefreshCcw, Smartphone } from 'lucide-react';
import {
  requestInstallPrompt,
  subscribeInstallPrompt,
  hideIOSInstallInstructions,
  type InstallPromptState,
} from '../services/pwa/installPrompt.ts';
import {
  applySwUpdate,
  subscribeSwUpdateState,
  type SwUpdateState,
} from '../services/pwa/swRegistration.ts';
import { getSyncStateSnapshot } from '../services/pwa/offlineDb.ts';
import { subscribeQueueSnapshot } from '../services/pwa/queueSnapshot.ts';
import { runSyncCycle } from '../services/pwa/syncEngine.ts';
import { storageService } from '../services/storage.ts';

export const Settings: React.FC = () => {
  const [installState, setInstallState] = useState<InstallPromptState>({
    canPromptInstall: false,
    isInstalled: false,
    isIOS: false,
    instructionsVisible: false,
  });
  const [swState, setSwState] = useState<SwUpdateState>({
    updateAvailable: false,
    offlineReady: false,
  });
  const [syncState, setSyncState] = useState({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    last_sync_started_at: null as string | null,
    last_sync_completed_at: null as string | null,
    last_sync_error: null as string | null,
    write_queue_pending: 0,
    write_queue_failed: 0,
    syncing: false,
  });
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  useEffect(() => {
    void getSyncStateSnapshot()
      .then(setSyncState)
      .catch(() => undefined);

    const unsubscribeInstall = subscribeInstallPrompt(setInstallState);
    const unsubscribeUpdate = subscribeSwUpdateState(setSwState);
    const unsubscribeQueue = subscribeQueueSnapshot(setSyncState);

    return () => {
      unsubscribeInstall();
      unsubscribeUpdate();
      unsubscribeQueue();
    };
  }, []);

  const handleInstallClick = async () => {
    const result = await requestInstallPrompt();
    if (result === 'accepted') {
      setInstallFeedback('Installation gestartet.');
      setTimeout(() => setInstallFeedback(null), 3000);
      return;
    }
    if (result === 'dismissed') {
      setInstallFeedback('Installation abgebrochen.');
      setTimeout(() => setInstallFeedback(null), 3000);
      return;
    }
    if (result === 'ios_instructions') {
      setInstallFeedback('Auf iOS: Teilen -> Zum Home-Bildschirm.');
      return;
    }
    setInstallFeedback('Installation derzeit nicht verfügbar.');
    setTimeout(() => setInstallFeedback(null), 3000);
  };

  const handleSyncNow = async () => {
    await runSyncCycle(storageService);
    const latest = await getSyncStateSnapshot();
    setSyncState(latest);
  };

  const handleApplyUpdate = async () => {
    await applySwUpdate();
  };

  return (
    <div className="min-h-screen bg-alabaster/40 pt-16 pb-40 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h1 className="font-serif text-5xl font-bold text-charcoal mb-4">Einstellungen</h1>
          <p className="text-stone-gray text-lg">
            Lokaler Betrieb, Installation und Synchronisation
          </p>
        </div>

        {/* PWA Status / Install / Sync */}
        <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
            <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-charcoal">PWA, Offline & Sync</h2>
              <p className="text-sm text-stone-gray mt-1">
                Installation, Queue-Status und manuelle Synchronisation
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
              <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">
                Installierbarkeit
              </p>
              <p className="font-bold text-charcoal">
                {installState.isInstalled
                  ? 'Bereits installiert'
                  : installState.canPromptInstall
                    ? 'Installierbar (Chrome)'
                    : installState.isIOS
                      ? 'iOS Anleitung verfügbar'
                      : 'Nicht verfügbar'}
              </p>
            </div>
            <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
              <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">
                Service Worker
              </p>
              <p className="font-bold text-charcoal">
                {swState.updateAvailable
                  ? 'Update verfügbar'
                  : swState.offlineReady
                    ? 'Offline bereit'
                    : 'Initialisierung läuft'}
              </p>
            </div>
            <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
              <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Write Queue</p>
              <p className="font-bold text-charcoal">
                {syncState.write_queue_pending} offen, {syncState.write_queue_failed} fehlgeschlagen
              </p>
            </div>
            <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
              <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">
                Datenverarbeitung
              </p>
              <p className="font-bold text-charcoal">Lokal – keine externe KI-API</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              onClick={handleInstallClick}
              disabled={installState.isInstalled}
              className="px-5 py-3 rounded-xl bg-burgundy text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {installState.isInstalled ? 'Installiert' : 'App installieren'}
            </button>

            <button
              onClick={handleSyncNow}
              disabled={syncState.syncing}
              className="px-5 py-3 rounded-xl border border-burgundy/20 text-burgundy font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCcw className={`w-4 h-4 ${syncState.syncing ? 'animate-spin' : ''}`} />
              {syncState.syncing ? 'Synchronisiert...' : 'Jetzt synchronisieren'}
            </button>

            {swState.updateAvailable && (
              <button
                onClick={handleApplyUpdate}
                className="px-5 py-3 rounded-xl bg-charcoal text-white font-bold text-sm"
              >
                Update laden
              </button>
            )}
          </div>

          {installFeedback && <p className="text-sm text-burgundy mb-3">{installFeedback}</p>}

          {installState.instructionsVisible && installState.isIOS && (
            <div className="bg-burgundy/5 border border-burgundy/15 rounded-2xl p-5">
              <p className="text-sm text-charcoal mb-2 font-bold">iOS Installation</p>
              <p className="text-sm text-stone-gray mb-3">
                In Safari auf <span className="font-medium">Teilen</span> tippen und{' '}
                <span className="font-medium">Zum Home-Bildschirm</span> wählen.
              </p>
              <button
                onClick={hideIOSInstallInstructions}
                className="text-xs uppercase tracking-wider text-burgundy font-bold"
              >
                Verstanden
              </button>
            </div>
          )}

          <div className="mt-4 text-xs text-stone-gray">
            Letzter Sync Start: {syncState.last_sync_started_at || '—'} | Letzter Sync Ende:{' '}
            {syncState.last_sync_completed_at || '—'}
            {syncState.last_sync_error ? ` | Fehler: ${syncState.last_sync_error}` : ''}
          </div>
        </section>
      </div>
    </div>
  );
};
