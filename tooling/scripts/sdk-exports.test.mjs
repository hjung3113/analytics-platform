import assert from 'node:assert/strict';
import test from 'node:test';

import { SDK_PACKAGES, distTarget } from './sdk-exports.mjs';

test('SDK packages have one ordered shared list', () => {
  assert.deepEqual(SDK_PACKAGES, ['contracts', 'kernel', 'ui', 'components', 'shell']);
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
