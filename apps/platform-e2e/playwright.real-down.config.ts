import { defineConfig } from '@playwright/test';

import { parsePort } from './tests-real/port';

const PORT = parsePort('E2E_PORT', 4190);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Exercises the assembly's backend-down screen without the healthy backend or database setup. */
export default defineConfig({
  testDir: './tests-real',
  testMatch: '**/backend-down.real.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: './test-results-real/down',
  reporter: [['list'], ['./contract-reporter.ts', { outputDir: './contract-report-real/down' }], ['html', { outputFolder: './playwright-report-real/down', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port ${PORT} --strictPort --mode real`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AP_BACKEND_ORIGIN: 'http://127.0.0.1:1' },
  },
});
