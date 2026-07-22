import { getSyncStateSnapshot } from './offlineDb.ts';
import type { SyncStateSnapshot } from './types.ts';

const listeners = new Set<(snapshot: SyncStateSnapshot) => void>();

export const emitQueueSnapshot = async (): Promise<void> => {
  const snapshot = await getSyncStateSnapshot();
  for (const listener of listeners) listener(snapshot);
};

export const subscribeQueueSnapshot = (
  listener: (snapshot: SyncStateSnapshot) => void
): (() => void) => {
  listeners.add(listener);
  void emitQueueSnapshot();
  return () => listeners.delete(listener);
};
