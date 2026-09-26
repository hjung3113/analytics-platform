import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GenMenuError, MENUS_TS, STYLE_CSS, APP_PKG, resolveRoot,
} from '../src/generate.ts';
import { PACKAGE_PREFIX } from '../src/prefix.ts';
import {
  PROBE_FOLDER, PROBE_TEST_REL, assertCleanTree, gitPorcelain, insertGroupIdMember,
  insertGroupsRow, preflightReservedPaths, runRevert, writeRegistryTest,
  type RevertSteps,
} from '../src/probe-support.ts';

/**
 * §4 create-then-delete verification (coordinator-run, once, not CI): the committed tree must be
 * verifiably clean (F8 fail-closed) and reserved paths are preflighted. The revert is ordered
 * (F8/F3): --remove runs FIRST, while the hand-edited genProbe GroupId member and GROUPS row are
 * still in place; only afterwards are the hand-edited files restored from pre-run snapshots.
 */
const ROOT = resolveRoot();
const CONTRACTS_MENU = join(ROOT, 'packages/contracts/src/menu.ts');
const MENUS = join(ROOT, MENUS_TS);
const STYLE = join(ROOT, STYLE_CSS);
const APP_PKG_PATH = join(ROOT, APP_PKG);
const PACKAGE_DIR = join(ROOT, 'menus', PROBE_FOLDER);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function run(cmd: string, args: string[], env?: Record<string, string>): void {
  const childEnv = env === undefined ? process.env : { ...process.env, ...env };
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: childEnv });
  if (res.status !== 0) throw new GenMenuError(`probe: '${cmd} ${args.join(' ')}' exited ${res.status ?? 'by signal'}`);
  console.log(`probe: ok — ${cmd} ${args.join(' ')}`);
}

function restoreFile(path: string, snapshot: string): void {
  if (readFileSync(path, 'utf8') !== snapshot) writeFileSync(path, snapshot);
}

function buildRevertSteps(snapshots: { contracts: string; menus: string; style: string; appPkg: string }): RevertSteps {
  return {
    // (1) the probe test is owned by this run — preflight guaranteed it did not exist before.
    deleteProbeTest: () => rmSync(join(ROOT, PROBE_TEST_REL), { force: true }),
    // (2) --remove FIRST, while the genProbe GroupId member and GROUPS row still exist.
    remove: () => {
      const res = spawnSync('pnpm', ['gen:menu', '--remove', 'genProbe'], { cwd: ROOT, encoding: 'utf8' });
      process.stderr.write(`${res.stdout ?? ''}${res.stderr ?? ''}`);
      if ((res.status ?? 1) !== 0) throw new GenMenuError(`--remove exited ${res.status}`);
    },
    // (3) after a successful --remove the hand-edited files must equal their pre-run snapshots.
    // Each restore is attempted independently — one failure must not suppress the other.
    restoreHandEdits: () => {
      const failures: string[] = [];
      for (const [path, snapshot] of [[CONTRACTS_MENU, snapshots.contracts], [MENUS, snapshots.menus]] as const) {
        try {
          restoreFile(path, snapshot);
          if (readFileSync(path, 'utf8') !== snapshot) throw new GenMenuError(`${path} does not match its pre-run snapshot`);
        } catch (err) {
          failures.push(`${path}: ${message(err)}`);
        }
      }
      if (failures.length > 0) throw new GenMenuError(`hand-edit restore incomplete: ${failures.join('; ')}`);
    },
    // (4) fallback when --remove refused: restore every app file this run touched and delete the
    // package dir (preflight guaranteed it did not exist before this run).
    fallbackRestore: () => {
      const failures: string[] = [];
      const touched: [string, string][] = [
        [CONTRACTS_MENU, snapshots.contracts],
        [MENUS, snapshots.menus],
        [STYLE, snapshots.style],
        [APP_PKG_PATH, snapshots.appPkg],
      ];
      for (const [path, snapshot] of touched) {
        try {
          if (readFileSync(path, 'utf8') !== snapshot) writeFileSync(path, snapshot);
        } catch (err) {
          failures.push(`${path}: ${message(err)}`);
        }
      }
      try {
        rmSync(PACKAGE_DIR, { recursive: true, force: true });
      } catch (err) {
        failures.push(`menus/${PROBE_FOLDER}: ${message(err)}`);
      }
      if (failures.length > 0) throw new GenMenuError(`fallback restore incomplete: ${failures.join('; ')}`);
    },
    // (5)
    install: () => {
      const res = spawnSync('pnpm', ['install'], { cwd: ROOT, stdio: 'inherit' });
      if (res.status !== 0) throw new GenMenuError(`pnpm install exited ${res.status}`);
    },
    // (6)
    cleanTree: () => {
      const dirty = gitPorcelain(ROOT);
      if (dirty !== '') throw new GenMenuError(`tree not clean after revert:\n${dirty}`);
    },
    // (7) the wiring locks must pass on the restored tree with the probe env explicitly off.
    postRevertTest: () => run('pnpm', ['--filter', `${PACKAGE_PREFIX}gen-menu`, 'test'], { GEN_MENU_PROBE: '' }),
  };
}

/** Returns the revert outcome; throws the original gate error after the revert has run. */
function main(): { fallback: boolean; failures: { step: string; message: string }[] } {
  assertCleanTree(ROOT);
  preflightReservedPaths(ROOT);
  const snapshots = {
    contracts: readFileSync(CONTRACTS_MENU, 'utf8'),
    menus: readFileSync(MENUS, 'utf8'),
    style: readFileSync(STYLE, 'utf8'),
    appPkg: readFileSync(APP_PKG_PATH, 'utf8'),
  };
  let gateError: unknown;
  let outcome: ReturnType<typeof runRevert> | undefined;
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
    // without the env after the revert.
    run('pnpm', ['test'], { GEN_MENU_PROBE: '1' });
    run('pnpm', ['build']);
    console.log('probe: verified — reverting');
  } catch (err) {
    gateError = err;
  } finally {
    outcome = runRevert(buildRevertSteps(snapshots));
  }
  for (const f of outcome.failures) console.error(`probe: revert failure (${f.step}) — ${f.message}`);
  if (gateError !== undefined) throw gateError;
  if (outcome.failures.length > 0) throw new GenMenuError('revert reported failures — see above');
  return { fallback: outcome.fallback, failures: outcome.failures };
}

try {
  main();
  console.log('probe: OK — tree is clean');
} catch (err) {
  console.error(message(err));
  process.exit(1);
}
