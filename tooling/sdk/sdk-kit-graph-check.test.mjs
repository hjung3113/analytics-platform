import assert from 'node:assert/strict';
import test from 'node:test';
import { assertKitGraph, assertKitSnapshot, bundledModuleIds } from './sdk-kit-graph-check.mjs';

const mock = ['/kit/mock/assembly.ts', '/kit/node_modules/@ap/mock-server/dist/index.js'];
const real = ['/kit/real/assembly.tsx', '/kit/node_modules/@ap/http-adapter/dist/index.js'];

test('the graph uses every emitted chunk module, including lazy chunks, not asset text', () => {
  assert.deepEqual(
    bundledModuleIds({
      output: [
        { type: 'asset', source: '@ap/http-adapter' },
        { type: 'chunk', modules: { '/kit/main.ts': {}, '/kit/shared.ts': {} } },
        { type: 'chunk', modules: { '/kit/lazy.ts': {}, '/kit/shared.ts': {} } },
      ],
    }),
    ['/kit/lazy.ts', '/kit/main.ts', '/kit/shared.ts'],
  );
});

test('each mode requires its assembly and adapter and rejects the other graph', () => {
  assert.doesNotThrow(() => assertKitGraph('mock', mock, '/kit'));
  assert.doesNotThrow(() => assertKitGraph('real', real, '/kit'));
  assert.throws(() => assertKitGraph('mock', [...mock, real[1]], '/kit'), /forbidden/);
  assert.throws(() => assertKitGraph('real', [...real, mock[1]], '/kit'), /forbidden/);
  assert.throws(() => assertKitGraph('real', [...real, '/kit/menus/sample/mock.ts'], '/kit'), /forbidden/);
  assert.throws(() => assertKitGraph('real', [...real, mock[0]], '/kit'), /forbidden/);
  assert.throws(() => assertKitGraph('real', mock, '/kit'), /missing|forbidden/);
  assert.throws(() => assertKitGraph('mock', [], '/kit'), /missing/);
});

test('fixture-local menus pass, repository source outside the fixture fails', () => {
  assert.doesNotThrow(() => assertKitGraph('real', [...real, '/kit/menus/sample/menu.ts'], '/kit'));
  for (const folder of ['apps', 'menus', 'platform', 'packages']) {
    assert.throws(() => assertKitGraph('real', [...real, `/repo/${folder}/source.ts`], '/kit'), /outside/);
  }
  assert.throws(() => assertKitGraph('real', [...real, '/repo/node_modules/@ap/http-adapter/src/index.ts'], '/kit'), /outside/);
});

// #1852: macOS TMPDIR (/var/folders/…) is a symbolic link to /private/var/…; Vite reports module ids by their real path.
test('a root given through a symbolic link matches module ids reported by the real path', async () => {
  const { mkdtempSync, mkdirSync, realpathSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ap-kit-graph-link-')));
  const kit = join(base, 'kit');
  mkdirSync(kit);
  const link = join(base, 'link');
  symlinkSync(kit, link, 'dir');
  const ids = [`${kit}/mock/assembly.ts`, `${kit}/node_modules/@ap/mock-server/dist/index.js`];
  assert.doesNotThrow(() => assertKitGraph('mock', ids, link));
  assert.throws(() => assertKitGraph('mock', [...ids, `${base}/elsewhere/source.ts`], link), /outside/);
});

test('only the real build carries the menu declaration snapshot, with the kit menus and endpoints (#1900)', () => {
  const asset = (snapshot) => ({ type: 'asset', fileName: 'menu-declarations.snapshot.json', source: JSON.stringify(snapshot) });
  const kit = { schemaVersion: 1, menus: [{ id: 'kit-sample' }], endpoints: [{ id: 'kit-sample.rows' }] };
  assert.doesNotThrow(() => assertKitSnapshot('real', { output: [asset(kit)] }));
  assert.doesNotThrow(() => assertKitSnapshot('mock', { output: [] }));
  assert.throws(() => assertKitSnapshot('real', { output: [] }), /not in the build output/);
  assert.throws(() => assertKitSnapshot('real', { output: [asset({ ...kit, endpoints: [] })] }), /lacks/);
  assert.throws(() => assertKitSnapshot('mock', { output: [asset(kit)] }), /only the real build/);
});
