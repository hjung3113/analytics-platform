import { defineConfig } from 'vitest/config';

// Unit tests only. The endpoints snapshot (vitest.endpoints.config.mjs) reads menu sources and runs from the root `pnpm sdk:test`.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
