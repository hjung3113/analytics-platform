import type { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRevertSteps } from '../scripts/probe.ts';
import { APP_PKG, MENUS_TS, MOCK_ASSEMBLY_TSX, STYLE_CSS } from './generate.ts';

/** #805: the revert must put pnpm-lock.yaml back and install frozen, so a re-resolve cannot leave `M pnpm-lock.yaml`. */
const SNAPSHOT_LOCK = 'lockfileVersion: snapshot\n';
const snapshots = { menus: 'menus\n', main: 'main\n', style: 'style\n', appPkg: 'appPkg\n', lock: SNAPSHOT_LOCK };

function tempRoot(lock: string): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-menu-probe-revert-'));
  for (const [rel, text] of [[MENUS_TS, 'x'], [MOCK_ASSEMBLY_TSX, 'x'], [STYLE_CSS, 'x'], [APP_PKG, 'x'], ['pnpm-lock.yaml', lock]] as const) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function recordingSpawn(calls: string[][]): typeof spawnSync {
  return ((_cmd: string, args: string[]) => {
    calls.push(args);
    return { status: 0 };
  }) as unknown as typeof spawnSync;
}

describe('probe revert restores the lockfile (#805)', () => {
  it.each(['restoreHandEdits', 'fallbackRestore'] as const)('install after %s: lockfile equals the snapshot, argv is a frozen install', (path) => {
    const root = tempRoot('lockfileVersion: rewritten by a re-resolve\n');
    const calls: string[][] = [];
    const steps = buildRevertSteps(snapshots, root, recordingSpawn(calls));
    steps[path]();
    steps.install();
    expect(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(SNAPSHOT_LOCK);
    expect(calls).toEqual([['install', '--frozen-lockfile']]);
  });
});
