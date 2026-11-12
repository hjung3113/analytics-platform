import assert from 'node:assert/strict';
import test from 'node:test';
import { assertKitGraph, bundledModuleIds } from './sdk-kit-graph-check.mjs';

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
