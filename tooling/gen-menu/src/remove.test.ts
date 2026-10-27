import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkMenuVersions } from './repo-invariants.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, menusTree, removeFixture, runCli } from './fixture.ts';

describe('remove', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  const generate = (root: string): void => {
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
  };

  it.each([null, 'mars'])('generates and removes in space %s while preserving siblings and files', space => {
    const root = fresh();
    const menusPath = join(root, 'apps/platform-web/src/menus.ts');
    const text = readFileSync(menusPath, 'utf8');
    writeFileSync(menusPath, text.replace("icon: LayoutDashboard, space: spaceId('mars')", `icon: LayoutDashboard, space: ${space === null ? 'null' : "spaceId('mars')"}`));
    const spaceFolder = space ?? '_global';
    const parent = join(root, 'menus', spaceFolder);
    mkdirSync(parent, { recursive: true });
    writeFileSync(join(parent, 'OWNER'), 'keep');
    const before = appSnapshot(root);
    generate(root);
    const pkg = join(parent, FIXTURE_FOLDER);
    expect(existsSync(join(pkg, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(pkg, 'CHANGELOG.md'))).toBe(true);
    expect(() => checkMenuVersions(root)).not.toThrow();
    expect(JSON.parse(readFileSync(join(pkg, '.gen-menu.json'), 'utf8')).space).toBe(space);
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    expect(existsSync(pkg)).toBe(false);
    expect(readFileSync(join(parent, 'OWNER'), 'utf8')).toBe('keep');
    expect(readFileSync(join(root, 'menus/mars/metric-catalog/src/index.ts'), 'utf8')).toContain("group: 'metrics'");
    expect(appSnapshot(root)).toEqual(before);
  });

  it('removes an empty global space directory', () => {
    const root = fresh();
    const path = join(root, 'apps/platform-web/src/menus.ts');
    writeFileSync(path, readFileSync(path, 'utf8').replace("icon: LayoutDashboard, space: spaceId('mars')", 'icon: LayoutDashboard, space: null'));
    generate(root);
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    expect(existsSync(join(root, 'menus/_global'))).toBe(false);
  });

  it.each(['duplicate', 'space', 'folder'])('refuses %s metadata ownership without writes', mode => {
    const root = fresh();
    generate(root);
    const pkg = join(root, 'menus/mars', FIXTURE_FOLDER);
    const metaPath = join(pkg, '.gen-menu.json');
    if (mode === 'duplicate') {
      cpSync(pkg, join(root, 'menus/_global', FIXTURE_FOLDER), { recursive: true });
    } else {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      meta[mode] = 'wrong';
      writeFileSync(metaPath, JSON.stringify(meta));
    }
    const before = appSnapshot(root);
    const tree = menusTree(root);
    const result = runCli(['--remove', FIXTURE_GROUP], root);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/exactly one|metadata.*mismatch/);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(tree);
  });

  it('restores the four app files and deletes the folder', () => {
    const root = fresh();
    const before = appSnapshot(root);
    generate(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
    expect(appSnapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'menus', 'mars', FIXTURE_FOLDER))).toBe(false);
    expect(menusTree(root)).toEqual(['menus/mars/metric-catalog/src/index.ts']);
    expect(res.stdout.endsWith('next: pnpm install\n')).toBe(true);
  });

  it('refuses a one-byte page edit and leaves the tree', () => {
    const root = fresh();
    generate(root);
    const pagePath = join(root, 'menus', 'mars', FIXTURE_FOLDER, 'src/pages/GenProbe.tsx');
    writeFileSync(pagePath, `${readFileSync(pagePath, 'utf8')} `);
    const afterEdit = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/was edited/);
    expect(appSnapshot(root)).toEqual(afterEdit);
    expect(existsSync(join(root, 'menus', 'mars', FIXTURE_FOLDER))).toBe(true);
  });

  it('removes a package with a different valid changelog date', () => {
    const root = fresh();
    generate(root);
    const pkg = join(root, 'menus', 'mars', FIXTURE_FOLDER);
    const changelog = join(pkg, 'CHANGELOG.md');
    writeFileSync(changelog, readFileSync(changelog, 'utf8').replace(/(## 0\.1\.0 — )\d{4}-\d{2}-\d{2}/, '$12026-01-02'));
    const result = runCli(['--remove', FIXTURE_GROUP], root);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(pkg)).toBe(false);
  });

  it.each(['content', 'invalid date', 'impossible date'])('refuses a changelog with edited %s', edit => {
    const root = fresh();
    generate(root);
    const pkg = join(root, 'menus', 'mars', FIXTURE_FOLDER);
    const changelog = join(pkg, 'CHANGELOG.md');
    const original = readFileSync(changelog, 'utf8');
    const replacement = edit === 'impossible date' ? '$12026-02-30' : '$1invalid';
    writeFileSync(changelog, edit === 'content' ? `${original}edited\n` : original.replace(/(## 0\.1\.0 — )\d{4}-\d{2}-\d{2}/, replacement));
    const before = appSnapshot(root);
    const result = runCli(['--remove', FIXTURE_GROUP], root);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/CHANGELOG\.md was edited/);
    expect(existsSync(pkg)).toBe(true);
    expect(appSnapshot(root)).toEqual(before);
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
    const pkgDir = join(root, 'menus', 'mars', FIXTURE_FOLDER);
    mkdirSync(join(pkgDir, '.turbo'), { recursive: true });
    writeFileSync(join(pkgDir, '.turbo/turbo-lint.log'), 'log\n');
    mkdirSync(join(pkgDir, 'node_modules'), { recursive: true });
    writeFileSync(join(pkgDir, 'node_modules/x'), 'x\n');
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(0);
    expect(existsSync(pkgDir)).toBe(false);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(['menus/mars/metric-catalog/src/index.ts']);
  });

  it('still refuses an unexpected src file and a nested artifact dir', () => {
    const root = fresh();
    generate(root);
    writeFileSync(join(root, 'menus', 'mars', FIXTURE_FOLDER, 'src/extra.ts'), 'export {};\n');
    const afterEdit = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/unexpected file/);
    expect(existsSync(join(root, 'menus', 'mars', FIXTURE_FOLDER))).toBe(true);
    expect(appSnapshot(root)).toEqual(afterEdit);

    const nested = fresh();
    generate(nested);
    mkdirSync(join(nested, 'menus', 'mars', FIXTURE_FOLDER, 'src/.turbo'), { recursive: true });
    writeFileSync(join(nested, 'menus', 'mars', FIXTURE_FOLDER, 'src/.turbo/x'), 'x\n');
    const nestedRes = runCli(['--remove', FIXTURE_GROUP], nested);
    expect(nestedRes.status).toBe(1);
    expect(nestedRes.stderr).toMatch(/unexpected file.*\.turbo/);
    expect(existsSync(join(nested, 'menus', 'mars', FIXTURE_FOLDER))).toBe(true);
  });
});
