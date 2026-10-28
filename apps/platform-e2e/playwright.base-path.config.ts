import { defineConfig } from '@playwright/test';
import config from './playwright.config';


/** #809: same rule as `E2E_PORT` in playwright.config.ts (`E2E_BASE_PATH_PORT`, default 4191). */
const parsePort = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const port = /^[0-9]+$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  if (port < 1 || port > 65535) throw new Error(`${name} must be an integer port in 1..65535, got ${JSON.stringify(raw)}`);
  return port;
};
const PORT = parsePort('E2E_BASE_PATH_PORT', 4191);
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
    env: { VITE_PLATFORM_API_ORIGIN: 'https://feedbackops.example' },
  },
});
