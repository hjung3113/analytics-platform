import { defineConfig } from '@playwright/test';
const PORT = 4190;

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
  // A contract gate does not retry: an intermittent violation is a violation. The reporter still marks flaky if retries are enabled locally.
  retries: 0,
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
    // #251: the FeedbackOps entries need an origin to be live links (unset renders them disabled — covered by unit tests).
    env: { VITE_FEEDBACKOPS_ORIGIN: 'https://feedbackops.example' },
  },
});
