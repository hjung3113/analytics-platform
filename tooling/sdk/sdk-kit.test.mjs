import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { addSecondMenu, ALLOWED_ORIGINS, scanBuildOutput } from './sdk-kit-check.mjs';
import { assertNoPlatformSource, listFiles, platformSourceHashes } from './sdk-kit.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const KIT_FIXTURE = join(repoRoot, 'tooling', 'sdk', 'fixtures', 'out-of-repo-assembly', 'kit');

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('build output scan: allowed origins pass; a source map, a sourceMappingURL and another origin fail', () => {
  const dist = tempDir('ap-kit-dist-');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'ok.js'), `const ns = "${ALLOWED_ORIGINS.join('" + "')}/2000/svg";`);
  assert.deepEqual(scanBuildOutput(dist), []);
  writeFileSync(join(dist, 'assets', 'ok.js.map'), '{}');
  writeFileSync(join(dist, 'assets', 'mapped.js'), 'x();\n//# sourceMappingURL=mapped.js.map\n');
  writeFileSync(join(dist, 'assets', 'leak.css'), '@import url("https://fonts.example.com/a.css");');
  const failures = scanBuildOutput(dist).join('\n');
  assert.match(failures, /assets\/ok\.js\.map: source map/);
  assert.match(failures, /assets\/mapped\.js: sourceMappingURL comment/);
  assert.match(failures, /assets\/leak\.css: external origin https:\/\/fonts\.example\.com/);
});

test('copy check: a kit file equal to a tracked platform source file fails, the fixture itself passes', () => {
  const hashes = platformSourceHashes();
  const kit = tempDir('ap-kit-copy-');
  cpSync(KIT_FIXTURE, kit, { recursive: true });
  assert.doesNotThrow(() => assertNoPlatformSource(kit, hashes));
  cpSync(join(repoRoot, 'packages', 'sdk', 'kernel', 'src', 'context', 'location.ts'), join(kit, 'src', 'location.ts'));
  assert.throws(() => assertNoPlatformSource(kit, hashes), /src\/location\.ts = packages\/sdk\/kernel\/src\/context\/location\.ts/);
});

test('second menu: the README steps apply to the fixture and register the copy in both lists', () => {
  const kit = tempDir('ap-kit-second-');
  cpSync(KIT_FIXTURE, kit, { recursive: true });
  addSecondMenu(kit);
  assert.ok(listFiles(kit).includes('menus/second/SamplePage.tsx'));
  const menu = readFileSync(join(kit, 'menus', 'second', 'menu.ts'), 'utf8');
  assert.match(menu, /MENU_ID = 'kit-second'/);
  assert.match(menu, /MENU_PATH = '\/second'/);
  assert.match(readFileSync(join(kit, 'menus.ts'), 'utf8'), /\[sample, second\]/);
  assert.match(readFileSync(join(kit, 'mock', 'assembly.ts'), 'utf8'), /MOCK_ENDPOINTS = \[sample, second\]/);
  assert.equal(readFileSync(join(kit, 'menus', 'sample', 'menu.ts'), 'utf8'), readFileSync(join(KIT_FIXTURE, 'menus', 'sample', 'menu.ts'), 'utf8'));
});

test('second menu: a fixture the README steps no longer match fails with the file named', () => {
  const kit = tempDir('ap-kit-drift-');
  cpSync(KIT_FIXTURE, kit, { recursive: true });
  writeFileSync(join(kit, 'mock', 'assembly.ts'), readFileSync(join(kit, 'mock', 'assembly.ts'), 'utf8').replace('const MOCK_ENDPOINTS = [', 'const ENDPOINT_LISTS = ['));
  assert.throws(() => addSecondMenu(kit), /mock\/assembly\.ts has no .*README «둘째 메뉴» step out of date/);
});

test('dev server stop: the whole process group ends, a grandchild included (a plain kill leaves it running on Linux)', async () => {
  const { spawnGroup, stopProcessGroup } = await import('./sdk-kit-check.mjs');
  // The shell stands in for `pnpm run dev`: it forks a long-running grandchild (vite) and waits on it.
  const child = spawnGroup('bash', ['-c', 'node -e "setInterval(() => {}, 1000)" & echo $!; wait'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const grandchild = await new Promise((resolvePromise) => child.stdout.once('data', (chunk) => resolvePromise(Number(String(chunk).trim()))));
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  assert.equal(alive(grandchild), true);
  await stopProcessGroup(child, 2000);
  assert.equal(alive(grandchild), false, 'the grandchild outlived the stop');
});

test('offline check: the isolated container has no network, a memory cap, the caller uid and is removed on exit', async () => {
  const { dockerArgs, IMAGE, NO_NETWORK_PROBE } = await import('./sdk-kit-offline.mjs');
  const args = dockerArgs({ network: 'none', mounts: [['/host/kit', '/kit']], script: NO_NETWORK_PROBE });
  assert.equal(args[0], 'run');
  for (const flag of ['--rm', '--network=none']) assert.ok(args.includes(flag), flag);
  assert.ok(args.some((arg) => arg.startsWith('--memory=')));
  assert.ok(args.includes('/host/kit:/kit'));
  assert.ok(args.includes(IMAGE));
  if (typeof process.getuid === 'function') assert.ok(args.includes(`${process.getuid()}:${process.getgid()}`));
  assert.match(args.at(-1), /fetch\('https:\/\/registry\.npmjs\.org\/'\)/);
});
