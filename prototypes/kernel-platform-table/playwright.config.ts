import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve('.browsers');
export default defineConfig({ testDir: './tests', testMatch: '*.browser.test.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4179', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev -- --port 4179 --strictPort', url: 'http://127.0.0.1:4179', reuseExistingServer: false },
});
