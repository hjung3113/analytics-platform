import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preflightReservedPaths } from './probe-support.ts';
import { gitPorcelain } from './probe-support.ts';

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
});

function git(args: string[], cwd: string): void {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr ?? ''}`);
}
