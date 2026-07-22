import { Download, RefreshCcw, Smartphone } from 'lucide-react';
import { hideIOSInstallInstructions } from '../../../services/pwa/installPrompt.ts';
import type { UsePwaSyncStatusResult } from '../hooks/usePwaSyncStatus.ts';

export const PwaSyncPanel = ({ status }: { status: UsePwaSyncStatusResult }) => {
  const { installState, swState, syncState, installFeedback, handleInstallClick, handleSyncNow, handleApplyUpdate } = status;

  return (
    <section className="bg-white rounded-[2.5rem] border border-burgundy/5 p-10 shadow-premium mb-8">
      <div className="flex items-center gap-4 mb-8 pb-6 border-b border-alabaster">
        <div className="p-3 bg-burgundy/5 rounded-2xl text-burgundy">
          <Smartphone className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold text-charcoal">PWA, Offline & Sync</h2>
          <p className="text-sm text-stone-gray mt-1">Installation, Queue-Status und manuelle Synchronisation</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
          <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Installierbarkeit</p>
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
          <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Service Worker</p>
          <p className="font-bold text-charcoal">
            {swState.updateAvailable ? 'Update verfügbar' : swState.offlineReady ? 'Offline bereit' : 'Initialisierung läuft'}
          </p>
        </div>
        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
          <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">Write Queue</p>
          <p className="font-bold text-charcoal">
            {syncState.write_queue_pending} offen, {syncState.write_queue_failed} fehlgeschlagen
          </p>
        </div>
        <div className="bg-alabaster/40 rounded-2xl p-5 border border-burgundy/10">
          <p className="text-xs uppercase tracking-wider text-stone-gray mb-2">AI Queue</p>
          <p className="font-bold text-charcoal">
            {syncState.ai_queue_pending} offen, {syncState.ai_queue_failed} fehlgeschlagen
          </p>
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
          <button onClick={handleApplyUpdate} className="px-5 py-3 rounded-xl bg-charcoal text-white font-bold text-sm">
            Update laden
          </button>
        )}
      </div>

      {installFeedback && <p className="text-sm text-burgundy mb-3">{installFeedback}</p>}

      {installState.instructionsVisible && installState.isIOS && (
        <div className="bg-burgundy/5 border border-burgundy/15 rounded-2xl p-5">
          <p className="text-sm text-charcoal mb-2 font-bold">iOS Installation</p>
          <p className="text-sm text-stone-gray mb-3">
            In Safari auf <span className="font-medium">Teilen</span> tippen und <span className="font-medium">Zum Home-Bildschirm</span> wählen.
          </p>
          <button onClick={hideIOSInstallInstructions} className="text-xs uppercase tracking-wider text-burgundy font-bold">
            Verstanden
          </button>
        </div>
      )}

      <div className="mt-4 text-xs text-stone-gray">
        Letzter Sync Start: {syncState.last_sync_started_at || '—'} | Letzter Sync Ende: {syncState.last_sync_completed_at || '—'}
        {syncState.last_sync_error ? ` | Fehler: ${syncState.last_sync_error}` : ''}
      </div>
    </section>
  );
};
