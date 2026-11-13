import { existsSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defineConfig } from '@playwright/test';
import { parsePort } from './tests-real/port';

const directory = process.env.AP_SDK_KIT_DIR;
if (!directory) throw new Error('AP_SDK_KIT_DIR must name the prepared outside-consumer kit directory.');
const kitDirectory = realpathSync(directory);
const fromRepository = relative(resolve(import.meta.dirname, '../..'), kitDirectory);
if (!fromRepository.startsWith(`..${sep}`) || !existsSync(resolve(kitDirectory, 'node_modules/.bin/vite'))) {
  throw new Error('AP_SDK_KIT_DIR must be an installed kit outside this repository.');
}
// Separate from the app's 4190 and base-path 4191. strictPort refuses another lane's listener.
const port = parsePort('E2E_KIT_PORT', 4192);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests-kit',
  testMatch: '**/*.spec.ts',
  workers: 1,
  // The first browser load of a fresh install pays Vite's dependency optimisation; the default 30 s flaked on a cold CI install.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // A leftover `.only` would make the required E2E check pass on one test; CI refuses it, local runs still allow it.
  forbidOnly: !!process.env.CI,
  outputDir: './test-results/kit',
  reporter: [['list'], ['html', { outputFolder: './playwright-report/kit', open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    cwd: kitDirectory,
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
