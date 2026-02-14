export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

export interface InstallPromptState {
  canPromptInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  instructionsVisible: boolean;
}

const listeners = new Set<(state: InstallPromptState) => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let instructionsVisible = false;

const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  return displayModeStandalone || (window.navigator as any).standalone === true;
};

const isIOSBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

const getState = (): InstallPromptState => ({
  canPromptInstall: Boolean(deferredPrompt),
  isInstalled: isStandalone(),
  isIOS: isIOSBrowser(),
  instructionsVisible
});

const notify = () => {
  const state = getState();
  for (const listener of listeners) {
    listener(state);
  }
};

export const initInstallPrompt = (): void => {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    instructionsVisible = false;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    instructionsVisible = false;
    notify();
  });

  notify();
};

export const subscribeInstallPrompt = (listener: (state: InstallPromptState) => void): (() => void) => {
  listeners.add(listener);
  listener(getState());

  return () => {
    listeners.delete(listener);
  };
};

export const requestInstallPrompt = async (): Promise<'accepted' | 'dismissed' | 'ios_instructions' | 'unavailable'> => {
  if (deferredPrompt) {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      deferredPrompt = null;
    }
    notify();
    return choice.outcome;
  }

  if (isIOSBrowser() && !isStandalone()) {
    instructionsVisible = true;
    notify();
    return 'ios_instructions';
  }

  return 'unavailable';
};

export const hideIOSInstallInstructions = (): void => {
  instructionsVisible = false;
  notify();
};
