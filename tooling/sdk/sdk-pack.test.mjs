import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseManifest, validateArchive, validateImports } from './sdk-pack.mjs';

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

const peersManifest = {
  name: '@ap/kernel',
  exports: { '.': './dist/index.js' },
  peerDependencies: { '@ap/contracts': '1.2.3' },
};

test('a dist file importing an undeclared @ap/* package fails, naming file and package', () => {
  const files = [{ path: 'dist/index.js', text: "import { x } from '@ap/ui';\n" }];
  assert.throws(() => validateImports('kernel', files, peersManifest), /dist\/index\.js.*@ap\/ui.*not a peerDependencies entry/);
});

test('comments between the keyword and the specifier do not hide an undeclared import', () => {
  for (const text of [
    "export const load = () => import(/* chunk annotation */ '@ap/undeclared');\n",
    "import { x } from /* note */ '@ap/undeclared';\n",
    "import { x } from // note\n '@ap/undeclared';\n",
    "import// note\n'@ap/undeclared';\n",
    "const glob = '/*';\nimport { x } from '@ap/undeclared';\nconst end = '*/';\n",
    "const s = 'msg // tail'; import { y } from '@ap/undeclared';\n",
  ]) {
    assert.throws(() => validateImports('kernel', [{ path: 'dist/index.js', text }], peersManifest), /@ap\/undeclared/);
  }
  const commented = [{ path: 'dist/index.js', text: "/* import '@ap/ui'; */\nconst u = 'http://x.test/a';\n" }];
  assert.doesNotThrow(() => validateImports('kernel', commented, peersManifest));
});

test('a declared peer and a subpath of it pass the import check', () => {
  const files = [
    { path: 'dist/index.js', text: "import { a } from '@ap/contracts';\nexport const b = (await import('@ap/contracts/vocab')).b;\n" },
    { path: 'dist/index.d.ts', text: "import type { A } from '@ap/contracts';\nimport '@ap/contracts';\n" },
  ];
  assert.doesNotThrow(() => validateImports('kernel', files, peersManifest));
});

test('the import check allows the package importing itself and skips non-dist files', () => {
  assert.doesNotThrow(() => validateImports('kernel', [{ path: 'dist/index.js', text: "import '@ap/kernel/host';\n" }], peersManifest));
  assert.doesNotThrow(() => validateImports('kernel', [{ path: 'src/index.ts', text: "import '@ap/ui';\n" }], peersManifest));
});
