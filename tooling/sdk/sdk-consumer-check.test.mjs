// Unit tests for the pure helpers of the consumer check (network-free; the end-to-end run is `pnpm sdk:consumer-check`).
import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProductionSignal, removeInHouseMenus, singleCopyPeers, tiptapOverrides } from './sdk-consumer-check.mjs';

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

test('single-copy peers follow the installed tarballs, including a newly declared sibling', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-peer-test-'));
  try {
    for (const name of ['contracts', 'kernel', 'ui', 'components', 'shell', 'app-host', 'mock-server', 'http-adapter', 'server-conformance']) {
      const dir = join(root, 'node_modules', '@ap', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ peerDependencies: name === 'app-host' ? { '@ap/contracts': '*', '@ap/ui': '*', '@ap/new-sibling': '*', react: '*' } : {} }));
    }
    const peers = Object.fromEntries(singleCopyPeers(root));
    assert.deepEqual(peers['app-host'], ['contracts', 'ui', 'new-sibling']);
    assert.deepEqual(peers['mock-server'], []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('production signal requires the dev probe in installed UI dist before inspecting the built output', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-signal-test-'));
  try {
    const ui = join(root, 'node_modules/@ap/ui/dist');
    const assets = join(root, 'dist/assets');
    mkdirSync(ui, { recursive: true }); mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'app.js'), 'production app');
    writeFileSync(join(ui, 'button.js'), 'changed probe');
    assert.throws(() => assertProductionSignal(root), /installed.*UI.*probe/);
    writeFileSync(join(ui, 'button.js'), 'Slot enforces single-child contract');
    assert.doesNotThrow(() => assertProductionSignal(root));
    writeFileSync(join(assets, 'app.js'), 'Slot enforces single-child contract');
    assert.throws(() => assertProductionSignal(root), /dev-only error/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('kit overrides contain only the tiptap pins', () => {
  const lines = tiptapOverrides();
  assert.ok(lines.length > 0);
  assert.ok(lines.every(line => /^  "@tiptap\//.test(line)));
  assert.ok(lines.some(line => line.includes('@tiptap/extension-bold')));
});
