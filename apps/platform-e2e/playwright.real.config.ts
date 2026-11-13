import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { requireSafeRealDatabaseEnv } from './tests-real/database-safety';

import { parsePort } from './tests-real/port';

const databaseEnv = requireSafeRealDatabaseEnv();
const PORT = parsePort('E2E_PORT', 4290);
const BACKEND_PORT = parsePort('E2E_REAL_BACKEND_PORT', 3011);
if (PORT === BACKEND_PORT) throw new Error('E2E_PORT and E2E_REAL_BACKEND_PORT must be different ports.');

const BASE_URL = `http://127.0.0.1:${PORT}`;
const stateDir = resolve(import.meta.dirname, 'test-results-real/auth');

/** Real assembly against a caller-created local throwaway database. */
export default defineConfig({
  testDir: './tests-real',
  testMatch: '**/*.real.spec.ts',
  testIgnore: '**/backend-down.real.spec.ts',
  globalSetup: './tests-real/global-setup.ts',
  // The page is served by the Vite dev server, which transforms ~850 modules on the first load of a route (13-25 s measured on the desktop host, API replies under 1.2 s); the 30 s test and 5 s expect defaults fail on that wait, not on the product.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // A leftover `.only` would make the required E2E check pass on one test; CI refuses it, local runs still allow it.
  forbidOnly: !!process.env.CI,
  outputDir: './test-results-real/results',
  reporter: [['list'], ['./contract-reporter.ts', { outputDir: './contract-report-real' }], ['html', { outputFolder: './playwright-report-real', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'admin', testMatch: '**/*.admin.real.spec.ts', use: { storageState: resolve(stateDir, 'admin.json') } },
    { name: 'user', testMatch: '**/*.user.real.spec.ts', use: { storageState: resolve(stateDir, 'user.json') } },
    { name: 'anonymous', testMatch: '**/*.anonymous.real.spec.ts' },
  ],
  webServer: [
    {
      command: `pnpm --filter @ap/platform-api run dev`,
      // `/health` (liveness), not `/health/ready`: readiness also requires attachment storage, which this harness
      // does not use. The global setup and real API checks validate the DB-backed behavior.
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL!,
        DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE!,
        WORKSPACE_ID: databaseEnv.workspaceId,
        NODE_ENV: 'development',
        AUTH_PROVIDER: 'mock',
        SEED_MODE: 'core',
        HOST: '127.0.0.1',
        PORT: String(BACKEND_PORT),
      },
    },
    {
      command: `pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port ${PORT} --strictPort --mode real`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { AP_BACKEND_ORIGIN: `http://127.0.0.1:${BACKEND_PORT}` },
    },
  ],
  metadata: { database: databaseEnv.database },
});
