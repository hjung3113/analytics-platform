import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('allows top-level tool artifact dirs and deletes them with the folder', () => {
    const root = fresh();
    const before = appSnapshot(root);
    generate(root);
    const pkgDir = join(root, 'menus', FIXTURE_FOLDER);
    mkdirSync(join(pkgDir, '.turbo'), { recursive: true });
    writeFileSync(join(pkgDir, '.turbo/turbo-lint.log'), 'log\n');
    mkdirSync(join(pkgDir, 'node_modules'), { recursive: true });
    writeFileSync(join(pkgDir, 'node_modules/x'), 'x\n');
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(0);
    expect(existsSync(pkgDir)).toBe(false);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(['menus/metric-catalog/src/index.ts']);
  });

  it('still refuses an unexpected src file and a nested artifact dir', () => {
    const root = fresh();
    generate(root);
    writeFileSync(join(root, 'menus', FIXTURE_FOLDER, 'src/extra.ts'), 'export {};\n');
    const afterEdit = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/unexpected file/);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(true);
    expect(appSnapshot(root)).toEqual(afterEdit);

    const nested = fresh();
    generate(nested);
    mkdirSync(join(nested, 'menus', FIXTURE_FOLDER, 'src/.turbo'), { recursive: true });
    writeFileSync(join(nested, 'menus', FIXTURE_FOLDER, 'src/.turbo/x'), 'x\n');
    const nestedRes = runCli(['--remove', FIXTURE_GROUP], nested);
    expect(nestedRes.status).toBe(1);
    expect(nestedRes.stderr).toMatch(/unexpected file.*\.turbo/);
    expect(existsSync(join(nested, 'menus', FIXTURE_FOLDER))).toBe(true);
  });
});
