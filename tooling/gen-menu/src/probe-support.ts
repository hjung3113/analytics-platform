import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUPS_END, MENUS_TS, GenMenuError, splitLines } from './generate.ts';

export const PROBE_FOLDER = 'gen-probe';
export const PROBE_TEST_REL = 'apps/platform-web/src/gen-probe.test.ts';
export const PROBE_GROUP_ID_MEMBER = " | 'genProbe';";
export const PROBE_GROUPS_ROW = `  { id: 'genProbe', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },`;

/** Fail-closed `git status --porcelain --untracked-files=all` (F8): any git failure throws. */
export function gitPorcelain(root: string): string {
  const res = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  if (res.error !== undefined) throw new GenMenuError(`git status failed: ${res.error.message}`);
  if (res.status !== 0) {
    throw new GenMenuError(`git status failed with exit ${res.status}: ${(res.stderr ?? '').trim()}`);
  }
  if ((res.stderr ?? '').trim() !== '') {
    throw new GenMenuError(`git status reported errors: ${(res.stderr ?? '').trim()}`);
  }
  return (res.stdout ?? '').trim();
}

/** F8: the probe refuses to start unless the committed tree is verifiably clean. */
export function assertCleanTree(root: string): void {
  const dirty = gitPorcelain(root);
  if (dirty !== '') throw new GenMenuError(`git status --porcelain is non-empty:\n${dirty}`);
}

/** F8: refuse before any mutation when a reserved probe path already exists. */
export function preflightReservedPaths(root: string): void {
  for (const rel of [PROBE_TEST_REL, `menus/${PROBE_FOLDER}`]) {
    if (existsSync(join(root, rel))) throw new GenMenuError(`reserved probe path already exists: ${rel} — refusing to overwrite`);
  }
}

export function insertGroupIdMember(root: string): void {
  const path = join(root, 'packages/contracts/src/menu.ts');
  const lines = readFileSync(path, 'utf8').split('\n');
  const at = lines.findIndex(l => l.startsWith('export type GroupId ='));
  if (at === -1) throw new GenMenuError('GroupId union line not found in packages/contracts/src/menu.ts');
  const line = lines[at];
  if (line === undefined || !line.endsWith(';')) throw new GenMenuError('GroupId line does not end with ;');
  lines[at] = `${line.slice(0, -1)}${PROBE_GROUP_ID_MEMBER}`;
  writeFileSync(path, lines.join('\n'));
}

export function insertGroupsRow(root: string): void {
  const path = join(root, MENUS_TS);
  const { lines, eol } = splitLines(readFileSync(path, 'utf8'));
  const at = lines.findIndex(l => l.trim() === GROUPS_END);
  if (at === -1) throw new GenMenuError(`marker '${GROUPS_END}' not found in ${MENUS_TS}`);
  lines.splice(at, 0, PROBE_GROUPS_ROW);
  writeFileSync(path, lines.join(eol));
}

export function writeRegistryTest(root: string): void {
  writeFileSync(join(root, PROBE_TEST_REL), `import { expect, it } from 'vitest';
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

export type RevertStepName =
  | 'deleteProbeTest'
  | 'remove'
  | 'restoreHandEdits'
  | 'fallbackRestore'
  | 'install'
  | 'cleanTree'
  | 'postRevertTest';

export type RevertStepFailure = { step: RevertStepName; message: string };

export type RevertOutcome = {
  /** True when --remove refused and the snapshot fallback ran instead of the targeted restore. */
  fallback: boolean;
  /** Steps actually executed, in execution order. */
  order: RevertStepName[];
  failures: RevertStepFailure[];
};

export type RevertSteps = Record<RevertStepName, () => void>;

/**
 * F8 revert order: (1) delete the probe test, (2) run `--remove` while the hand-edited genProbe
 * GroupId member and GROUPS row are still in place, (3) only then restore the hand-edited files,
 * (4) on a --remove refusal fall back to restoring every touched app file and deleting the
 * package dir, then (5) install, (6) clean-tree check, (7) the post-revert lock test. Every step
 * is attempted independently — one failure never suppresses the rest.
 */
export function runRevert(steps: RevertSteps): RevertOutcome {
  const order: RevertStepName[] = [];
  const failures: RevertStepFailure[] = [];
  const attempt = (step: RevertStepName, fn: () => void): void => {
    order.push(step);
    try {
      fn();
    } catch (err) {
      failures.push({ step, message: err instanceof Error ? err.message : String(err) });
    }
  };
  attempt('deleteProbeTest', steps.deleteProbeTest);
  attempt('remove', steps.remove);
  const fallback = failures.some(f => f.step === 'remove');
  attempt(fallback ? 'fallbackRestore' : 'restoreHandEdits', fallback ? steps.fallbackRestore : steps.restoreHandEdits);
  attempt('install', steps.install);
  attempt('cleanTree', steps.cleanTree);
  attempt('postRevertTest', steps.postRevertTest);
  return { fallback, order, failures };
}
