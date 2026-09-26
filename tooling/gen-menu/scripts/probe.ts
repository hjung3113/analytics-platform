import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUPS_END, MENUS_TS, removeLine, resolveRoot } from '../src/generate.ts';

/**
 * §4 create-then-delete verification (coordinator-run, once, not CI): the committed tree must be
 * clean. The probe inserts a throwaway `genProbe` group member and GROUPS row by hand (the
 * generator never edits them), generates the package, asserts the app registry, runs the root
 * gates, and reverts everything in `finally`.
 */
const ROOT = resolveRoot();
const CONTRACTS_MENU = join(ROOT, 'packages/contracts/src/menu.ts');
const MENUS = join(ROOT, MENUS_TS);
const PROBE_TEST = join(ROOT, 'apps/platform-web/src/gen-probe.test.ts');
const FOLDER = 'gen-probe';
const GROUP_ID_MEMBER = " | 'genProbe';";
const GROUPS_ROW = `  { id: 'genProbe', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },`;

function fail(message: string): never {
  throw new Error(`probe: ${message}`);
}

function gitPorcelain(): string {
  const res = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return (res.stdout ?? '').trim();
}

function run(cmd: string, args: string[]): void {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) fail(`'${cmd} ${args.join(' ')}' exited ${res.status ?? 'by signal'}`);
  console.log(`probe: ok — ${cmd} ${args.join(' ')}`);
}

function insertGroupIdMember(): void {
  const lines = readFileSync(CONTRACTS_MENU, 'utf8').split('\n');
  const at = lines.findIndex(l => l.startsWith('export type GroupId ='));
  if (at === -1) fail('GroupId union line not found in packages/contracts/src/menu.ts');
  if (!lines[at].endsWith(';')) fail('GroupId line does not end with ;');
  lines[at] = `${lines[at].slice(0, -1)}${GROUP_ID_MEMBER}`;
  writeFileSync(CONTRACTS_MENU, lines.join('\n'));
}

function insertGroupsRow(): void {
  const lines = readFileSync(MENUS, 'utf8').split('\n');
  const at = lines.findIndex(l => l.trim() === GROUPS_END);
  if (at === -1) fail(`marker '${GROUPS_END}' not found in ${MENUS_TS}`);
  lines.splice(at, 0, GROUPS_ROW);
  writeFileSync(MENUS, lines.join('\n'));
}

function writeRegistryTest(): void {
  writeFileSync(PROBE_TEST, `import { expect, it } from 'vitest';
import { registry } from './menus';

it('registers the generated probe menu in the app registry', () => {
  const menu = registry.menuById('gen-probe');
  expect(menu.group).toBe('genProbe');
  expect(menu.path).toBe('/gen-probe');
  expect(menu.primary).toBe(true);
  expect(menu.pageKeys).toEqual([]);
  expect(registry.groupById('genProbe')).toBeDefined();
});
`);
}

function revert(): void {
  const contracts = readFileSync(CONTRACTS_MENU, 'utf8');
  if (contracts.includes(GROUP_ID_MEMBER)) {
    writeFileSync(CONTRACTS_MENU, contracts.replace(GROUP_ID_MEMBER, ';'));
  }
  const menus = readFileSync(MENUS, 'utf8');
  if (menus.includes(GROUPS_ROW)) writeFileSync(MENUS, removeLine(menus, GROUPS_ROW));
  rmSync(PROBE_TEST, { force: true });

  const res = spawnSync('pnpm', ['gen:menu', '--remove', 'genProbe'], { cwd: ROOT, encoding: 'utf8' });
  if ((res.status ?? 1) !== 0 && existsSync(join(ROOT, 'menus', FOLDER))) {
    process.stderr.write(`${res.stdout ?? ''}${res.stderr ?? ''}`);
    fail('--remove refused (byte mismatch or unexpected file) — leaving the tree as-is');
  }
  run('pnpm', ['install']);
  const dirty = gitPorcelain();
  if (dirty !== '') fail(`tree not clean after revert:\n${dirty}`);
}

function main(): void {
  if (gitPorcelain() !== '') fail('git status --porcelain is non-empty — commit the implementation first');
  try {
    insertGroupIdMember();
    insertGroupsRow();
    run('pnpm', ['gen:menu', 'genProbe', '--label-ko', '생성 확인', '--label-en', 'Gen probe', '--path', '/gen-probe', '--page-type', 'overview']);
    writeRegistryTest();
    run('pnpm', ['install']);
    run('pnpm', ['lint']);
    run('pnpm', ['typecheck']);
    run('pnpm', ['test']);
    run('pnpm', ['build']);
    console.log('probe: verified — reverting');
  } finally {
    revert();
  }
}

try {
  main();
  console.log('probe: OK — tree is clean');
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
