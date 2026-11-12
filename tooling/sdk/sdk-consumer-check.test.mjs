// Unit tests for the pure helpers of the consumer check (network-free; the end-to-end run is `pnpm sdk:consumer-check`).
import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeInHouseMenus, singleCopyPeers } from './sdk-consumer-check.mjs';

const kit = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'out-of-repo-assembly', 'kit');

test('removeInHouseMenus keeps the real kit menus.ts compiling: only the marked block becomes an empty list', () => {
  const source = readFileSync(join(kit, 'menus.ts'), 'utf8');
  const stripped = removeInHouseMenus(source);
  assert.ok(stripped.includes('const IN_HOUSE_MENUS: readonly MenuEntry[] = [];'), 'the in-house list becomes empty');
  assert.ok(!stripped.includes("'kit-inhouse-work'"), 'the in-house menu entry is gone');
  assert.ok(!stripped.includes('// kit:inhouse-start'), 'the marker is gone');
  assert.ok(stripped.includes('...IN_HOUSE_MENUS'), 'the declarations spread stays (now empty)');
  assert.ok(stripped.includes("'kit-overview'"), 'the public menu stays');
});

test('removeInHouseMenus rejects a source without or with unbalanced markers', () => {
  assert.throws(() => removeInHouseMenus('export const IN_HOUSE_MENUS = [{}];'), /markers/);
  assert.throws(() => removeInHouseMenus('// kit:inhouse-start\nconst IN_HOUSE_MENUS = [];\n'), /unbalanced/);
  assert.throws(() => removeInHouseMenus('const IN_HOUSE_MENUS = [];\n// kit:inhouse-end'), /unbalanced/);
});

test('the single-copy table covers release unit 2 with the app copies of every @ap/* peer', () => {
  const peers = Object.fromEntries(singleCopyPeers());
  assert.deepEqual(peers['app-host'], ['shell', 'components', 'kernel', 'ui', 'contracts']);
  assert.deepEqual(peers['mock-server'], ['contracts']);
  assert.deepEqual(peers['http-adapter'], ['contracts']);
  assert.deepEqual(peers['server-conformance'], ['contracts']);
});
