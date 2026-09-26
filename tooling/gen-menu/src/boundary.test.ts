import { existsSync, mkdtempSync, readdirSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

describe('physical workspace boundary (F9)', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => { for (const path of keep) removeFixture(path); });

  it('refuses a symlinked menus/ pointing outside the root and writes nothing outside', () => {
    const root = fresh();
    const outsideBase = mkdtempSync(join(tmpdir(), 'gen-menu-outside-'));
    keep.push(outsideBase);
    const outside = join(outsideBase, 'menus');
    renameSync(join(root, 'menus'), outside);
    symlinkSync(outside, join(root, 'menus'), 'dir');
    const before = appSnapshot(root);

    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/outside the workspace root/);
    expect(existsSync(join(outside, 'gen-probe'))).toBe(false);
    expect(readdirSync(outside).sort()).toEqual(['metric-catalog']);
    expect(appSnapshot(root)).toEqual(before);
    expect(dirname(outside)).toBe(outsideBase);
  });
});
