import { defineConfig } from '@playwright/test';

/**
 * #666: CI runs the contract suite as shards, each writing a blob report (`--reporter=list,blob`). This config
 * merges those blobs (`pnpm --filter @ap/platform-e2e e2e:merge`) into the same outputs one serial run gives:
 * one per-item contract report and one HTML report. The blobs carry every attachment, so evidence screenshots and
 * failure screenshots reach the contract reporter exactly as in a local run.
 */
export default defineConfig({
  testDir: './tests',
  reporter: [['./contract-reporter.ts', { outputDir: './contract-report' }], ['html', { outputFolder: './playwright-report', open: 'never' }]],
});
