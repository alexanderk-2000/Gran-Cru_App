import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, RefreshCcw, Check, Loader2 } from 'lucide-react';
import { getSyncStateSnapshot } from '../services/pwa/offlineDb.ts';
import { subscribeQueueSnapshot } from '../services/pwa/aiQueue.ts';
import { runSyncCycle } from '../services/pwa/syncEngine.ts';
import { storageService } from '../services/storage.ts';
import type { SyncStateSnapshot } from '../services/pwa/types.ts';

/**
 * Shows whether local changes have actually arrived on the server.
 *
 * The app has a full offline stack - Dexie cache, write queue, delta sync - and
 * none of it was visible anywhere except a settings screen. The sidebar instead
 * carried a static "Cloud Sync — Safe & Secure" decoration that said the same
 * thing whether ten changes were stuck in the queue or not. This replaces that
 * with the real state, and a tap to sync now.
 */
const EMPTY: SyncStateSnapshot = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  last_sync_started_at: null,
  last_sync_completed_at: null,
  last_sync_error: null,
  syncing: false,
  write_queue_pending: 0,
  write_queue_failed: 0,
  ai_queue_pending: 0,
  ai_queue_failed: 0
};

const formatTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

export const useSyncSnapshot = (): SyncStateSnapshot => {
  const [snapshot, setSnapshot] = useState<SyncStateSnapshot>(EMPTY);

  useEffect(() => {
    void getSyncStateSnapshot().then(setSnapshot).catch(() => undefined);
    const unsubscribe = subscribeQueueSnapshot(setSnapshot);

    const onNetworkChange = () =>
      setSnapshot((previous) => ({
        ...previous,
        online: typeof navigator === 'undefined' ? true : navigator.onLine
      }));
    window.addEventListener('online', onNetworkChange);
    window.addEventListener('offline', onNetworkChange);

    return () => {
      unsubscribe();
      window.removeEventListener('online', onNetworkChange);
      window.removeEventListener('offline', onNetworkChange);
    };
  }, []);

  return snapshot;
};

interface SyncStatusProps {
  /** 'bar' for the sidebar block, 'compact' for the mobile header. */
  variant?: 'bar' | 'compact';
}

export const SyncStatus: React.FC<SyncStatusProps> = ({ variant = 'bar' }) => {
  const snapshot = useSyncSnapshot();
  const pending = snapshot.write_queue_pending + snapshot.ai_queue_pending;
  const failed = snapshot.write_queue_failed + snapshot.ai_queue_failed;
  const lastSync = formatTime(snapshot.last_sync_completed_at);

  const state: 'offline' | 'failed' | 'syncing' | 'pending' | 'synced' = !snapshot.online
    ? 'offline'
    : failed > 0
      ? 'failed'
      : snapshot.syncing
        ? 'syncing'
        : pending > 0
          ? 'pending'
          : 'synced';

  const label = {
    offline: pending > 0 ? `Offline · ${pending} wartet` : 'Offline',
    failed: `${failed} nicht übertragen`,
    syncing: 'Synchronisiert …',
    pending: `${pending} wird übertragen`,
    synced: lastSync ? `Gesichert · ${lastSync}` : 'Gesichert'
  }[state];

  const tone = {
    offline: 'text-stone-gray',
    failed: 'text-red-600',
    syncing: 'text-burgundy',
    pending: 'text-gold-dim',
    synced: 'text-sage'
  }[state];

  const Icon = {
    offline: CloudOff,
    failed: AlertTriangle,
    syncing: Loader2,
    pending: RefreshCcw,
    synced: Check
  }[state];

  const canSync = snapshot.online && !snapshot.syncing;
  const triggerSync = () => {
    if (!canSync) return;
    void runSyncCycle(storageService);
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={triggerSync}
        disabled={!canSync}
        title={label}
        aria-label={`Synchronisation: ${label}`}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${tone} disabled:opacity-70`}
      >
        <Icon className={`h-3.5 w-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
        {state !== 'synced' && <span>{pending > 0 || failed > 0 ? pending + failed : ''}</span>}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-burgundy/5 bg-alabaster-dark p-4">
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${tone} ${state === 'syncing' ? 'animate-spin' : ''}`} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-bold uppercase tracking-widest text-stone-gray">Synchronisation</span>
          <span className={`truncate text-xs font-medium ${tone}`}>{label}</span>
        </div>
      </div>

      {state === 'offline' && (
        <p className="mt-2 text-[11px] leading-snug text-stone-gray">
          Änderungen werden lokal gespeichert und bei Verbindung übertragen.
        </p>
      )}

      {state === 'failed' && snapshot.last_sync_error && (
        <p className="mt-2 text-[11px] leading-snug text-red-600">{snapshot.last_sync_error}</p>
      )}

      <button
        type="button"
        onClick={triggerSync}
        disabled={!canSync}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-burgundy/70 transition-colors hover:text-burgundy disabled:opacity-40"
      >
        <RefreshCcw className={`h-3 w-3 ${snapshot.syncing ? 'animate-spin' : ''}`} />
        Jetzt synchronisieren
      </button>
    </div>
  );
};
