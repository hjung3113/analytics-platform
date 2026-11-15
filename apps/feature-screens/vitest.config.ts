import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jest-dom's vitest entry imports 'vitest'. Externalised, it resolves the platform's vitest 3 hoisted into the shared
    // pnpm store and registers matchers on a second expect (#642); inlined, 'vitest' is the runner's own copy.
    server: { deps: { inline: ['@testing-library/jest-dom'] } },
    // Node >= 25 ships a built-in localStorage global that shadows jsdom's; turn it off in the worker (#642).
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // One test's own budget must exceed the 10 s query wait set in src/test/setup.ts (the default 5 s would end a test while its first lazy editor load
    // is still being waited for); a passing test is not slower, a hanging one fails after 15 s instead of 5 s (#2150).
    testTimeout: 15_000,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
