import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RELEASE_UNIT2_PACKAGES, distTarget, releasePackages } from './sdk-exports.mjs';

test('release packages cover SDK, adapters and app-host except the explicit unpublished packages', () => {
  const repo = new URL('../../', import.meta.url).pathname;
  const folders = ['packages/sdk', 'packages/host'].flatMap(parent => readdirSync(join(repo, parent), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(repo, parent, entry.name, 'package.json')))
    .map(entry => `${parent}/${entry.name}`)).concat(existsSync(join(repo, 'packages/feature/bridge/package.json')) ? ['packages/feature/bridge'] : []);
  const released = new Set(releasePackages().map(entry => entry.dir));
  assert.deepEqual(folders.filter(dir => !released.has(dir)).sort(), ['packages/feature/bridge', 'packages/sdk/contract-schemas']);
  for (const dir of released) assert.ok(folders.includes(dir), `${dir} exists`);
});

test('release unit 2 has its own ordered list with directories', () => {
  assert.deepEqual(RELEASE_UNIT2_PACKAGES, [
    { name: 'mock-server', dir: 'packages/host/mock-server' },
    { name: 'http-adapter', dir: 'packages/host/http-adapter' },
    { name: 'server-conformance', dir: 'packages/host/server-conformance' },
    { name: 'app-host', dir: 'packages/host/app-host' },
  ]);
});

test('releasePackages returns all nine in build order', () => {
  assert.deepEqual(releasePackages(), [
    { name: 'contracts', dir: 'packages/sdk/contracts' },
    { name: 'kernel', dir: 'packages/sdk/kernel' },
    { name: 'ui', dir: 'packages/sdk/ui' },
    { name: 'components', dir: 'packages/sdk/components' },
    { name: 'shell', dir: 'packages/sdk/shell' },
    { name: 'mock-server', dir: 'packages/host/mock-server' },
    { name: 'http-adapter', dir: 'packages/host/http-adapter' },
    { name: 'server-conformance', dir: 'packages/host/server-conformance' },
    { name: 'app-host', dir: 'packages/host/app-host' },
  ]);
});

test('distTarget maps TypeScript exports and preserves asset exports', () => {
  assert.deepEqual(distTarget('./src/index.ts', '@ap/contracts exports["."]'), {
    types: './dist/index.d.ts',
    import: './dist/index.js',
  });
  assert.deepEqual(distTarget('./src/theme/index.tsx', 'theme'), {
    types: './dist/theme/index.d.ts',
    import: './dist/theme/index.js',
  });
  assert.equal(distTarget('./src/styles.css', 'styles.css'), './dist/styles.css');
  assert.equal(distTarget('./src/theme/theme-tokens.json', 'theme tokens'), './dist/theme/theme-tokens.json');
});

test('distTarget rejects exports outside src', () => {
  assert.throws(() => distTarget('./dist/index.js', 'bad export'), /must start with \.\/src\//);
});
