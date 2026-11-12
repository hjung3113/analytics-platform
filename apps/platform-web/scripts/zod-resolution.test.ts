// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createServer, optimizeDeps, resolveConfig, type InlineConfig } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const feature = fileURLToPath(new URL('../../../packages/feature-shared/src/permissions/selected-detail.ts', import.meta.url));
const featureScreen = fileURLToPath(new URL('../../../apps/feature-screens/src/lib/host/search-fields.ts', import.meta.url));
const sdk = fileURLToPath(new URL('../../../packages/sdk/contract-schemas/src/index.ts', import.meta.url));
const core = fileURLToPath(new URL('../../../packages/eqv/core/src/inventory/schema.ts', import.meta.url));

describe('dev zod isolation (#1856)', () => {
  it.each(['real', 'mock'])('keeps importer versions with cold/warm caches and either scan order (%s)', async mode => {
    const cacheDir = await mkdtemp(`${tmpdir()}/ap-zod-`);
    try {
      for (const entries of [[core, feature], [feature, core]]) {
        const config: InlineConfig = {
          root, mode, cacheDir, logLevel: 'silent' as const,
          optimizeDeps: { entries, include: [] },
          server: { middlewareMode: true, watch: null, ws: false },
        };
        const resolved = await resolveConfig(config, 'serve');
        for (const temperature of ['cold', 'warm']) {
          const metadata = await optimizeDeps(resolved, temperature === 'cold');
          const server = await createServer(config);
          try {
            for (const [importer, major] of [[feature, 3], [featureScreen, 3], [sdk, 3], [core, 4]] as const) {
              const result = await server.environments.client.pluginContainer.resolveId('zod', importer);
              const optimized = Object.values(metadata.optimized).find(dep => dep.file === result?.id.split('?')[0]);
              const source = optimized?.src ?? result?.id;
              expect(source, `${mode}/${temperature}: ${importer}`).toContain(`zod@${major}.`);
            }
            expect(metadata.optimized.zod).toBeUndefined();
          } finally {
            await server.close();
          }
        }
      }
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('invalidates a pre-fix cache containing the shared zod 4 entry', async () => {
    const cacheDir = await mkdtemp(`${tmpdir()}/ap-zod-legacy-`);
    const config: InlineConfig = {
      root, mode: 'real', cacheDir, logLevel: 'silent',
      // Scan only core to seed the bad cache deterministically; with both importers either version can win.
      optimizeDeps: { entries: [core], include: [] },
    };
    try {
      const legacy = await resolveConfig(config, 'serve');
      // Vite merges inline exclude arrays with the config, so clear the resolved list to model the old config.
      legacy.optimizeDeps.exclude = [];
      const before = await optimizeDeps(legacy, true);
      expect(before.optimized.zod.src).toContain('zod@4.');
      const fixed = await resolveConfig(config, 'serve');
      const after = await optimizeDeps(fixed, false);
      expect(after.hash).not.toBe(before.hash);
      expect(after.optimized.zod).toBeUndefined();
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
