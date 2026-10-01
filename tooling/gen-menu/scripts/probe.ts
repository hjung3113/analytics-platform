import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GenMenuError, MAIN_TSX, MENUS_TS, MOCK_IMPORTS_END, MOCK_IMPORTS_START, MOCK_SPREADS_END, MOCK_SPREADS_START,
  STYLE_CSS, APP_PKG, checkAppMarkers, ownedLine, pageName, resolveRoot, splitLines,
} from '../src/generate.ts';
import { PACKAGE_PREFIX } from '../src/prefix.ts';
import { mockImportLine, mockSpreadLine, type MenuInputs, type PageType } from '../src/templates.ts';
import {
  PROBE_FOLDER, PROBE_TEST_REL, assertCleanTree, gitPorcelain, insertGroupIdMember,
  insertGroupsRow, preflightReservedPaths, runRevert, writeRegistryTest,
  type RevertOutcome, type RevertSteps,
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
const MAIN = join(ROOT, MAIN_TSX);
const STYLE = join(ROOT, STYLE_CSS);
const APP_PKG_PATH = join(ROOT, APP_PKG);
const PACKAGE_DIR = join(ROOT, 'menus', PROBE_FOLDER);

/** One source for the probe CLI call and every derived value the wiring checks restate (review nit-5). */
const PROBE_ARGS = {
  group: 'genProbe',
  labelKo: '생성 확인',
  labelEn: 'Gen probe',
  path: '/gen-probe',
  pageType: (process.env.GEN_MENU_PROBE_PAGE_TYPE ?? 'overview') as PageType,
} as const;
/** folder/menuId/page/binding exactly as planGenerate derives them: kebab(group), folder default
 * menu, pageName(menuId), binding = group. */
const PROBE_INPUTS: MenuInputs = {
  group: PROBE_ARGS.group,
  folder: PROBE_FOLDER,
  menuId: PROBE_FOLDER,
  page: pageName(PROBE_FOLDER),
  path: PROBE_ARGS.path,
  pageType: PROBE_ARGS.pageType,
  labelKo: PROBE_ARGS.labelKo,
  labelEn: PROBE_ARGS.labelEn,
  binding: PROBE_ARGS.group,
};

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

function buildRevertSteps(snapshots: { contracts: string; menus: string; main: string; style: string; appPkg: string }): RevertSteps {
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
        [MAIN, snapshots.main],
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
    main: readFileSync(MAIN, 'utf8'),
    style: readFileSync(STYLE, 'utf8'),
    appPkg: readFileSync(APP_PKG_PATH, 'utf8'),
  };
  let gateError: unknown;
  let outcome: RevertOutcome | undefined;
  try {
    insertGroupIdMember(ROOT);
    insertGroupsRow(ROOT);
    run('pnpm', ['gen:menu', PROBE_ARGS.group, '--label-ko', PROBE_ARGS.labelKo, '--label-en', PROBE_ARGS.labelEn, '--path', PROBE_ARGS.path, '--page-type', PROBE_ARGS.pageType]);
    verifyGeneratedScaffold();
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

/**
 * #126: the generated package must carry the menu-query scaffold (endpoints + mock, no api.ts)
 * and main.tsx must have BOTH mocks registered in its marker regions — the probe group's and
 * analytics — so the four root commands below prove multi-package mock registration.
 */
function verifyGeneratedScaffold(): void {
  for (const rel of ['src/endpoints.ts', 'src/mock/index.ts', 'src/mock/index.test.ts']) {
    if (!existsSync(join(PACKAGE_DIR, rel))) throw new GenMenuError(`probe: menus/${PROBE_FOLDER}/${rel} was not generated`);
  }
  if (existsSync(join(PACKAGE_DIR, 'src/api.ts'))) throw new GenMenuError(`probe: menus/${PROBE_FOLDER}/src/api.ts must not be generated anymore`);

  const mainText = readFileSync(MAIN, 'utf8');
  checkAppMarkers(readFileSync(MENUS, 'utf8'), readFileSync(STYLE, 'utf8'), mainText);
  const lines = splitLines(mainText).lines;
  const expected: [string, string, string][] = [
    [MOCK_IMPORTS_START, MOCK_IMPORTS_END, mockImportLine(PROBE_INPUTS)],
    [MOCK_IMPORTS_START, MOCK_IMPORTS_END, `import { analyticsMock } from '${PACKAGE_PREFIX}menu-analytics/mock';`],
    [MOCK_SPREADS_START, MOCK_SPREADS_END, mockSpreadLine(PROBE_INPUTS)],
    [MOCK_SPREADS_START, MOCK_SPREADS_END, mockSpreadLine({ ...PROBE_INPUTS, group: 'analytics' })],
  ];
  for (const [start, end, line] of expected) {
    if (ownedLine(lines, start, end, line).kind !== 'found') {
      throw new GenMenuError(`probe: main.tsx mock marker region does not contain '${line.trim()}'`);
    }
  }
  console.log('probe: generated endpoints/mock + main.tsx mock registration (genProbe + analytics) verified');
}

try {
  main();
  console.log('probe: OK — tree is clean');
} catch (err) {
  console.error(message(err));
  process.exit(1);
}
