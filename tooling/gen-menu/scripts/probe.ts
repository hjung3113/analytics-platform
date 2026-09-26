import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GenMenuError, MENUS_TS, resolveRoot } from '../src/generate.ts';
import { PACKAGE_PREFIX } from '../src/prefix.ts';
import {
  PROBE_FOLDER, assertCleanTree, gitPorcelain, insertGroupIdMember, insertGroupsRow,
  preflightReservedPaths, writeRegistryTest,
} from '../src/probe-support.ts';

/**
 * §4 create-then-delete verification (coordinator-run, once, not CI): the committed tree must be
 * verifiably clean (F8 fail-closed), reserved paths are preflighted, and revert attempts every
 * step independently — restoring pre-run snapshots so only what this run created is deleted.
 */
const ROOT = resolveRoot();
const CONTRACTS_MENU = join(ROOT, 'packages/contracts/src/menu.ts');
const MENUS = join(ROOT, MENUS_TS);

function run(cmd: string, args: string[], env?: Record<string, string>): void {
  const childEnv = env === undefined ? process.env : { ...process.env, ...env };
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: childEnv });
  if (res.status !== 0) fail(`'${cmd} ${args.join(' ')}' exited ${res.status ?? 'by signal'}`);
  console.log(`probe: ok — ${cmd} ${args.join(' ')}`);
}

function fail(message: string): never {
  throw new GenMenuError(`probe: ${message}`);
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** F8: every step is attempted independently; all failures are collected, none mask another. */
function revert(snapshots: { contracts: string; menus: string }): string[] {
  const failures: string[] = [];
  try {
    if (readFileSync(CONTRACTS_MENU, 'utf8') !== snapshots.contracts) writeFileSync(CONTRACTS_MENU, snapshots.contracts);
  } catch (err) {
    failures.push(`packages/contracts/src/menu.ts: ${message(err)}`);
  }
  try {
    if (readFileSync(MENUS, 'utf8') !== snapshots.menus) writeFileSync(MENUS, snapshots.menus);
  } catch (err) {
    failures.push(`${MENUS_TS}: ${message(err)}`);
  }
  try {
    rmSync(join(ROOT, 'apps/platform-web/src/gen-probe.test.ts'), { force: true });
  } catch (err) {
    failures.push(`apps/platform-web/src/gen-probe.test.ts: ${message(err)}`);
  }
  try {
    const res = spawnSync('pnpm', ['gen:menu', '--remove', 'genProbe'], { cwd: ROOT, encoding: 'utf8' });
    if ((res.status ?? 1) !== 0 && existsSync(join(ROOT, 'menus', PROBE_FOLDER))) {
      process.stderr.write(`${res.stdout ?? ''}${res.stderr ?? ''}`);
      failures.push('--remove refused — menus/gen-probe left in place');
    }
  } catch (err) {
    failures.push(`--remove: ${message(err)}`);
  }
  try {
    const res = spawnSync('pnpm', ['install'], { cwd: ROOT, stdio: 'inherit' });
    if (res.status !== 0) failures.push('pnpm install failed');
  } catch (err) {
    failures.push(`pnpm install: ${message(err)}`);
  }
  try {
    const dirty = gitPorcelain(ROOT);
    if (dirty !== '') failures.push(`tree not clean after revert:\n${dirty}`);
  } catch (err) {
    failures.push(message(err));
  }
  return failures;
}

/** Returns revert failures; throws the original gate error after reverting. */
function main(): string[] {
  assertCleanTree(ROOT);
  preflightReservedPaths(ROOT);
  const snapshots = { contracts: readFileSync(CONTRACTS_MENU, 'utf8'), menus: readFileSync(MENUS, 'utf8') };
  let gateError: unknown;
  let failures: string[] = [];
  try {
    insertGroupIdMember(ROOT);
    insertGroupsRow(ROOT);
    run('pnpm', ['gen:menu', 'genProbe', '--label-ko', '생성 확인', '--label-en', 'Gen probe', '--path', '/gen-probe', '--page-type', 'overview']);
    writeRegistryTest(ROOT);
    run('pnpm', ['install']);
    run('pnpm', ['lint']);
    run('pnpm', ['typecheck']);
    // Full gate: the wiring locks hold while the probe menu exists; only the probe-name check
    // is skipped via GEN_MENU_PROBE (turbo globalPassThroughEnv). The locks are re-verified
    // without the env after the revert below.
    run('pnpm', ['test'], { GEN_MENU_PROBE: '1' });
    run('pnpm', ['build']);
    console.log('probe: verified — reverting');
  } catch (err) {
    gateError = err;
  } finally {
    failures = revert(snapshots);
    if (failures.length === 0) {
      try {
        run('pnpm', ['--filter', `${PACKAGE_PREFIX}gen-menu`, 'test'], { GEN_MENU_PROBE: '' });
      } catch (err) {
        failures.push(`post-revert gen-menu test: ${message(err)}`);
      }
    }
  }
  if (gateError !== undefined) {
    for (const f of failures) console.error(`probe: revert failure — ${f}`);
    throw gateError;
  }
  return failures;
}

try {
  const failures = main();
  if (failures.length > 0) {
    console.error(`probe: revert incomplete:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log('probe: OK — tree is clean');
} catch (err) {
  console.error(message(err));
  process.exit(1);
}
