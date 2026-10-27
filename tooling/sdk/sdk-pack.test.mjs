import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseManifest, validateArchive } from './sdk-pack.mjs';

const source = {
  name: '@ap/components',
  exports: { '.': './src/index.ts' },
  dependencies: { '@ap/contracts': 'workspace:*', '@ap/kernel': 'workspace:*', echarts: '^6.1.0' },
  devDependencies: { vitest: '^4.1.0' },
  peerDependencies: { react: '^19.0.0' },
};

test('siblings become exact-version peers, never dependencies (#806)', () => {
  const manifest = releaseManifest('components', source, '1.2.3');
  assert.deepEqual(manifest.dependencies, { echarts: '^6.1.0' });
  assert.deepEqual(manifest.peerDependencies, { react: '^19.0.0', '@ap/contracts': '1.2.3', '@ap/kernel': '1.2.3', vitest: '^4.1.0' });
  assert.deepEqual(manifest.peerDependenciesMeta, { vitest: { optional: true } });
});

test('a package with only siblings gets no dependencies field', () => {
  const manifest = releaseManifest('kernel', { name: '@ap/kernel', exports: { '.': './src/index.ts' }, dependencies: { '@ap/contracts': 'workspace:*' } }, '1.2.3');
  assert.equal('dependencies' in manifest, false);
  assert.deepEqual(manifest.peerDependencies, { '@ap/contracts': '1.2.3' });
});

test('the archive check rejects a sibling dependency and a loose sibling peer', () => {
  const paths = ['package/package.json', 'package/dist/index.js'];
  const exports = { '.': './dist/index.js' };
  assert.throws(() => validateArchive('kernel', paths, { exports, dependencies: { '@ap/contracts': '1.2.3' } }, '1.2.3'), /siblings must be exact-version peerDependencies/);
  assert.throws(() => validateArchive('kernel', paths, { exports, peerDependencies: { '@ap/contracts': '^1.2.3' } }, '1.2.3'), /expected exactly 1\.2\.3/);
  assert.doesNotThrow(() => validateArchive('kernel', paths, { exports, peerDependencies: { '@ap/contracts': '1.2.3' } }, '1.2.3'));
});
