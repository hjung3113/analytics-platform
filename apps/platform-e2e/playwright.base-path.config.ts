import { defineConfig } from '@playwright/test';
import config from './playwright.config';

const PORT = 4191;
const BASE = '/analytics-platform/demo/';

/** Separate mock build/preview: default root-path E2E and its dev server stay unchanged. */
export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: 'base-path.spec.ts',
  outputDir: './test-results/base-path',
  reporter: [['list'], ['./contract-reporter.ts', { outputDir: './contract-report/base-path' }]],
  use: { ...config.use, baseURL: `http://127.0.0.1:${PORT}`, permissions: ['clipboard-read', 'clipboard-write'] },
  webServer: {
    command: `AP_BASE_PATH=${BASE} pnpm --filter @ap/platform-web exec vite build --mode mock --outDir dist/base-path && AP_BASE_PATH=${BASE} pnpm --filter @ap/platform-web exec vite preview --outDir dist/base-path --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
