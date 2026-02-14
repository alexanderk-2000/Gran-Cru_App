import { registerSW } from 'virtual:pwa-register';

export interface SwUpdateState {
  updateAvailable: boolean;
  offlineReady: boolean;
}

const listeners = new Set<(state: SwUpdateState) => void>();
const state: SwUpdateState = {
  updateAvailable: false,
  offlineReady: false
};

let updateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

const notify = () => {
  for (const listener of listeners) {
    listener({ ...state });
  }
};

export const subscribeSwUpdateState = (listener: (state: SwUpdateState) => void): (() => void) => {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
};

export const registerPwaServiceWorker = (): void => {
  if (typeof window === 'undefined') return;

  updateFn = registerSW({
    immediate: true,
    onOfflineReady() {
      state.offlineReady = true;
      notify();
    },
    onNeedRefresh() {
      state.updateAvailable = true;
      notify();
    }
  });
};

export const applySwUpdate = async (): Promise<void> => {
  if (!updateFn) return;
  await updateFn(true);
  state.updateAvailable = false;
  notify();
};
