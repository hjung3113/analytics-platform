import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitPorcelain, preflightReservedPaths, runRevert, type RevertSteps } from './probe-support.ts';

describe('probe support helpers (F8)', () => {
  it('gitPorcelain throws when git cannot run (bad cwd)', () => {
    const missing = join(tmpdir(), `gen-menu-missing-${Date.now()}`);
    expect(() => gitPorcelain(missing)).toThrow(/git status failed/);
  });

  it('gitPorcelain throws outside a repository instead of failing open', () => {
    const plain = mkdtempSync(join(tmpdir(), 'gen-menu-nogit-'));
    expect(() => gitPorcelain(plain)).toThrow(/git status failed/);
  });

  it('gitPorcelain lists hidden untracked files', () => {
    const repo = mkdtempSync(join(tmpdir(), 'gen-menu-git-'));
    git(['init', '-q'], repo);
    writeFileSync(join(repo, 'untracked.txt'), 'x\n');
    expect(gitPorcelain(repo)).toContain('?? untracked.txt');
  });

  it('preflight refuses existing reserved probe paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'gen-menu-preflight-'));
    mkdirSync(join(root, 'apps/platform-web/src'), { recursive: true });
    writeFileSync(join(root, 'apps/platform-web/src/gen-probe.test.ts'), 'stale\n');
    expect(() => preflightReservedPaths(root)).toThrow(/gen-probe\.test\.ts/);
  });

  it('preflight counts a dangling test-file symlink as present (R5)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gen-menu-preflight-'));
    mkdirSync(join(root, 'apps/platform-web/src'), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), 'gen-menu-preflight-out-'));
    const target = join(outside, 'valuable.ts');
    symlinkSync(target, join(root, 'apps/platform-web/src/gen-probe.test.ts'));
    expect(() => preflightReservedPaths(root)).toThrow(/gen-probe\.test\.ts/);
    expect(existsSync(target)).toBe(false);
  });

  it('preflight counts a dangling package-dir symlink as present (R5)', () => {
    const root = mkdtempSync(join(tmpdir(), 'gen-menu-preflight-'));
    mkdirSync(join(root, 'menus'), { recursive: true });
    const outsideBase = mkdtempSync(join(tmpdir(), 'gen-menu-preflight-out-'));
    const target = join(outsideBase, 'menus-dir');
    symlinkSync(target, join(root, 'menus', 'gen-probe'), 'dir');
    expect(() => preflightReservedPaths(root)).toThrow(/gen-probe/);
    expect(existsSync(target)).toBe(false);
  });
});

describe('revert ordering (runRevert)', () => {
  const stepsRecording = (order: string[], removeThrows = false, throwing: string[] = []): RevertSteps => {
    const step = (name: string, body: () => void): (() => void) => () => {
      order.push(name);
      if (removeThrows && name === 'remove') throw new Error('--remove refused');
      if (throwing.includes(name)) throw new Error(`${name} failed`);
      body();
    };
    return {
      deleteProbeTest: step('deleteProbeTest', () => undefined),
      remove: step('remove', () => undefined),
      restoreHandEdits: step('restoreHandEdits', () => undefined),
      fallbackRestore: step('fallbackRestore', () => undefined),
      install: step('install', () => undefined),
      cleanTree: step('cleanTree', () => undefined),
      postRevertTest: step('postRevertTest', () => undefined),
    };
  };

  it('runs --remove before restoring the hand-edited group files', () => {
    const order: string[] = [];
    const outcome = runRevert(stepsRecording(order));
    expect(order).toEqual(['deleteProbeTest', 'remove', 'restoreHandEdits', 'install', 'cleanTree', 'postRevertTest']);
    expect(outcome.fallback).toBe(false);
    expect(outcome.failures).toEqual([]);
  });

  it('takes the snapshot fallback when --remove refuses', () => {
    const order: string[] = [];
    const outcome = runRevert(stepsRecording(order, true));
    expect(order).toEqual(['deleteProbeTest', 'remove', 'fallbackRestore', 'install', 'cleanTree', 'postRevertTest']);
    expect(outcome.fallback).toBe(true);
    expect(outcome.failures).toEqual([{ step: 'remove', message: '--remove refused' }]);
  });

  it('attempts every step independently and collects all failures', () => {
    const order: string[] = [];
    const outcome = runRevert(stepsRecording(order, true, ['install', 'cleanTree']));
    expect(order).toEqual(['deleteProbeTest', 'remove', 'fallbackRestore', 'install', 'cleanTree', 'postRevertTest']);
    expect(outcome.failures.map(f => f.step)).toEqual(['remove', 'install', 'cleanTree']);
  });
});

function git(args: string[], cwd: string): void {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr ?? ''}`);
}
