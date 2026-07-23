import { useEffect, useState } from 'react';
import { requestInstallPrompt, subscribeInstallPrompt, type InstallPromptState } from '../../../services/pwa/installPrompt.ts';
import { applySwUpdate, subscribeSwUpdateState, type SwUpdateState } from '../../../services/pwa/swRegistration.ts';
import { getSyncStateSnapshot } from '../../../services/pwa/offlineDb.ts';
import { subscribeQueueSnapshot } from '../../../services/pwa/aiQueue.ts';
import { runSyncCycle } from '../../../services/pwa/syncEngine.ts';
import { storageService } from '../../../services/storage.ts';

const initialSyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  last_sync_started_at: null as string | null,
  last_sync_completed_at: null as string | null,
  last_sync_error: null as string | null,
  write_queue_pending: 0,
  write_queue_failed: 0,
  ai_queue_pending: 0,
  ai_queue_failed: 0,
  syncing: false
};

export const usePwaSyncStatus = () => {
  const [installState, setInstallState] = useState<InstallPromptState>({
    canPromptInstall: false,
    isInstalled: false,
    isIOS: false,
    instructionsVisible: false
  });
  const [swState, setSwState] = useState<SwUpdateState>({ updateAvailable: false, offlineReady: false });
  const [syncState, setSyncState] = useState(initialSyncState);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);

  useEffect(() => {
    void getSyncStateSnapshot().then(setSyncState).catch(() => undefined);

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

  return { installState, swState, syncState, installFeedback, handleInstallClick, handleSyncNow, handleApplyUpdate };
};

export type UsePwaSyncStatusResult = ReturnType<typeof usePwaSyncStatus>;
