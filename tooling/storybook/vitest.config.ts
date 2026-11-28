import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['.storybook/**/__tests__/*.test.ts'],
    // Builds a TypeScript program over SDK sources.
    testTimeout: 60_000,
  },
});
