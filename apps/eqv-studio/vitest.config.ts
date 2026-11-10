import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // @eqv/* ship TypeScript source (workspace packages): inline them so vite-node transforms them (as apps/platform-web does).
    server: { deps: { inline: [/@eqv\//] } },
  },
});
