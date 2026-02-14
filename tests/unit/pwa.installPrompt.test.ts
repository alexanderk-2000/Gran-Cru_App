import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hideIOSInstallInstructions,
  initInstallPrompt,
  requestInstallPrompt,
  subscribeInstallPrompt
} from '../../services/pwa/installPrompt.ts';

beforeEach(() => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'iPhone',
    configurable: true
  });
  Object.defineProperty(window.navigator, 'standalone', {
    value: false,
    configurable: true
  });
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })),
      configurable: true
    });
  }
});

describe('install prompt', () => {
  it('shows iOS instructions when prompt is unavailable', async () => {
    initInstallPrompt();

    let current = null as null | { instructionsVisible: boolean };
    const unsubscribe = subscribeInstallPrompt((state) => {
      current = { instructionsVisible: state.instructionsVisible };
    });

    const result = await requestInstallPrompt();
    expect(result).toBe('ios_instructions');
    expect(current?.instructionsVisible).toBe(true);

    hideIOSInstallInstructions();
    expect(current?.instructionsVisible).toBe(false);

    unsubscribe();
  });
});
