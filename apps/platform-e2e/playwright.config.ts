import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.browsers');
const PORT = 4190;

/**
 * Platform contract checks (#44): black-box against the assembled app on the mock adapter.
 * Desktop only (docs/05 Decided), 1440×900. One worker: the mock server's scenario is per tab, but the
 * dev server is shared and serial runs keep evidence screenshots in contract order.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: './test-results',
  reporter: [['list'], ['./contract-reporter.ts', { outputDir: './contract-report' }], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
