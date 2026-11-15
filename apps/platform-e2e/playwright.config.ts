import { defineConfig } from '@playwright/test';

/** #809: concurrent checkouts pick their own port (`E2E_PORT=4290 pnpm e2e`). Whole-string integer 1..65535, else throw. */
const parsePort = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const port = /^[0-9]+$/.test(raw) ? Number.parseInt(raw, 10) : 0;
  if (port < 1 || port > 65535) throw new Error(`${name} must be an integer port in 1..65535, got ${JSON.stringify(raw)}`);
  return port;
};
const PORT = parsePort('E2E_PORT', 4190);

/**
 * Platform contract checks (#44): black-box against the assembled app on the mock adapter.
 * Desktop only (docs/05 Decided), 1440×900. One worker: the mock server's scenario is per tab, but the
 * dev server is shared and serial runs keep evidence screenshots in contract order.
 * Browsers come from Playwright's default cache unless PLAYWRIGHT_BROWSERS_PATH is set — the same variable for
 * `playwright install` and the run, so the two never disagree (CI's E2E shards run in the Playwright image, which sets it to `/ms-playwright`, #669).
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: 'base-path.spec.ts',
  workers: 1,
  // #666: CI splits the suite with `--shard`. Sharding divides test groups, and without this the one spec file is one
  // group, so every test would land in shard 1. With one worker it changes nothing locally: tests still run one at a
  // time in file order, and each shard runs its contiguous slice the same way.
  fullyParallel: true,
  // Locally the dev server compiles each lazy chunk on its first request. On a busy machine (a lane host with other test runs going) the first
  // screen of a cold server took up to a minute, longer than Playwright's 30 s test and 5 s expect defaults, so the same specs that pass in CI
  // failed locally with an unloaded screen (#2129). CI keeps the defaults, so the gate's timing is unchanged; a missing element fails either way, only later.
  timeout: process.env.CI ? 30_000 : 240_000,
  expect: { timeout: process.env.CI ? 5_000 : 60_000 },
  // A contract gate does not retry: an intermittent violation is a violation. The reporter still marks flaky if retries are enabled locally.
  retries: 0,
  // A leftover `.only` would make the required E2E check pass on one test; CI refuses it, local runs still allow it.
  forbidOnly: !!process.env.CI,
  outputDir: './test-results',
  reporter: [['list'], ['./contract-reporter.ts', { outputDir: './contract-report' }], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    // Failing checks usually stop before their evidence() call; this screenshot becomes the item's failure evidence.
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter @ap/platform-web exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
