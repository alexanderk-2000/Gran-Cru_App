import { defineConfig } from 'vitest/config';

// Integration tests against the Firebase Emulator Suite.
// Run via `npm run test:emulator` (wraps them in `firebase emulators:exec`).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/emulator/**/*.test.ts'],
    setupFiles: ['tests/emulator/setup.ts'],
    reporters: ['default'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      VITE_FIREBASE_USE_EMULATOR: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-gran-cru',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-gran-cru.appspot.com'
    }
  }
});
