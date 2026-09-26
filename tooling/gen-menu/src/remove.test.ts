import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, menusTree, removeFixture, runCli } from './fixture.ts';

describe('remove', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  const generate = (root: string): void => {
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
  };

  it('restores the three app files and deletes the folder', () => {
    const root = fresh();
    const before = appSnapshot(root);
    generate(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(appSnapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(false);
    expect(menusTree(root)).toEqual(['menus/metric-catalog/src/index.ts']);
    expect(res.stdout.endsWith('next: pnpm install\n')).toBe(true);
  });

  it('refuses a one-byte page edit and leaves the tree', () => {
    const root = fresh();
    generate(root);
    const pagePath = join(root, 'menus', FIXTURE_FOLDER, 'src/pages/GenProbe.tsx');
    writeFileSync(pagePath, `${readFileSync(pagePath, 'utf8')} `);
    const afterEdit = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/was edited/);
    expect(appSnapshot(root)).toEqual(afterEdit);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(true);
  });

  it('dry-run --remove writes nothing', () => {
    const root = fresh();
    generate(root);
    const snapshot = appSnapshot(root);
    const tree = menusTree(root);
    const res = runCli(['--remove', FIXTURE_GROUP, '--dry-run'], root);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('dry run');
    expect(appSnapshot(root)).toEqual(snapshot);
    expect(menusTree(root)).toEqual(tree);
  });

  it('exits 1 on a second remove (folder gone)', () => {
    const root = fresh();
    generate(root);
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/does not exist/);
  });
});
