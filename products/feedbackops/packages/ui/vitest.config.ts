import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // jest-dom's vitest entry imports 'vitest'. Externalised, it resolves the platform's vitest 3 hoisted into the shared
    // pnpm store and registers matchers on a second expect (#642); inlined, 'vitest' is the runner's own copy.
    server: { deps: { inline: ['@testing-library/jest-dom'] } },
    // Node >= 25 ships a built-in localStorage global that shadows jsdom's; turn it off in the worker (#642).
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
});
