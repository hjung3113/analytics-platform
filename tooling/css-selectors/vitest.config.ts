import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // CLI-spawning fixture tests; CI runners are slower.
    testTimeout: 30_000,
  },
});
