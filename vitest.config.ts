import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // .tsx included so component tests (the workflows a user actually clicks
    // through) can live next to the domain tests.
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    reporters: ['default']
  }
});
