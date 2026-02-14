export type NetworkListener = (online: boolean) => void;

const listeners = new Set<NetworkListener>();

export const isOnline = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
};

const notify = () => {
  const online = isOnline();
  for (const listener of listeners) {
    listener(online);
  }
};

export const subscribeNetworkState = (listener: NetworkListener): (() => void) => {
  listeners.add(listener);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
  }

  listener(isOnline());

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', notify);
      window.removeEventListener('offline', notify);
    }
  };
};
