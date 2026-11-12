import assert from 'node:assert/strict';
import test from 'node:test';

import { RELEASE_UNIT2_PACKAGES, SDK_PACKAGES, distTarget, releasePackages } from './sdk-exports.mjs';

test('SDK packages have one ordered shared list', () => {
  assert.deepEqual(SDK_PACKAGES, ['contracts', 'kernel', 'ui', 'components', 'shell']);
});

test('release unit 2 has its own ordered list with directories', () => {
  assert.deepEqual(RELEASE_UNIT2_PACKAGES, [
    { name: 'mock-server', dir: 'packages/adapters/mock-server' },
    { name: 'http-adapter', dir: 'packages/adapters/http-adapter' },
    { name: 'server-conformance', dir: 'packages/adapters/server-conformance' },
    { name: 'app-host', dir: 'packages/app-host' },
  ]);
});

test('releasePackages returns all nine in build order', () => {
  assert.deepEqual(releasePackages(), [
    { name: 'contracts', dir: 'packages/sdk/contracts' },
    { name: 'kernel', dir: 'packages/sdk/kernel' },
    { name: 'ui', dir: 'packages/sdk/ui' },
    { name: 'components', dir: 'packages/sdk/components' },
    { name: 'shell', dir: 'packages/sdk/shell' },
    { name: 'mock-server', dir: 'packages/adapters/mock-server' },
    { name: 'http-adapter', dir: 'packages/adapters/http-adapter' },
    { name: 'server-conformance', dir: 'packages/adapters/server-conformance' },
    { name: 'app-host', dir: 'packages/app-host' },
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
