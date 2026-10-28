import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { MENUS_TS } from './generate.ts';
import { renderFiles, type MenuInputs } from './templates.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, menusTree, removeFixture, runCli } from './fixture.ts';

/** Placement: `menus/<space>/<folder>` for domain systems, `platform/<folder>` for platform features (ADR-0097). */
describe('placement roots', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  /** An existing platform package that owns the given manifest literal. */
  const addPlatformPackage = (root: string, folder: string, manifest: string, name = `${PACKAGE_PREFIX}menu-${folder}`): void => {
    mkdirSync(join(root, 'platform', folder, 'src'), { recursive: true });
    writeFileSync(join(root, 'platform', folder, 'package.json'), `${JSON.stringify({ name })}\n`);
    writeFileSync(join(root, 'platform', folder, 'src/index.ts'), `export const manifests = [${manifest}];\n`);
  };
  const nullSpace = (root: string): void => {
    const path = join(root, MENUS_TS);
    writeFileSync(path, readFileSync(path, 'utf8').replace("icon: LayoutDashboard, space: spaceId('mars')", 'icon: LayoutDashboard, space: null'));
  };

  it('--platform places a named-space group in platform/<folder> and keeps its GROUPS space', () => {
    const root = fresh();
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain(`created platform/${FIXTURE_FOLDER}/src/index.ts`);
    expect(res.stdout).not.toContain('menus/mars/gen-probe');
    const meta = JSON.parse(readFileSync(join(root, 'platform', FIXTURE_FOLDER, '.gen-menu.json'), 'utf8'));
    expect(meta).toMatchObject({ placement: 'platform', space: 'mars', folder: FIXTURE_FOLDER });
    expect(readFileSync(join(root, 'platform', FIXTURE_FOLDER, 'src/manifest.test.ts'), 'utf8')).toContain("toBe('/mars/gen-probe')");
    expect(existsSync(join(root, 'menus/mars', FIXTURE_FOLDER))).toBe(false);
  });

  it('keeps a named-space group in menus/<space>/<folder> without --platform, and a null-space group in platform/ either way', () => {
    const named = fresh();
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], named).status).toBe(0);
    expect(existsSync(join(named, 'menus/mars', FIXTURE_FOLDER, 'src/index.ts'))).toBe(true);
    expect(JSON.parse(readFileSync(join(named, 'menus/mars', FIXTURE_FOLDER, '.gen-menu.json'), 'utf8')).placement).toBe('menus');
    for (const extra of [[], ['--platform']]) {
      const root = fresh();
      nullSpace(root);
      expect(runCli([FIXTURE_GROUP, ...GEN_ARGS, ...extra], root).status).toBe(0);
      expect(existsSync(join(root, 'platform', FIXTURE_FOLDER, 'src/index.ts'))).toBe(true);
      expect(existsSync(join(root, 'menus/_global'))).toBe(false);
    }
  });

  it.each([
    ['menus', [], 'menus/mars/gen-probe'],
    ['platform', ['--platform'], 'platform/gen-probe'],
  ])('dry-run prints the %s path it would use and writes nothing', (_root, extra, dir) => {
    const root = fresh();
    const before = appSnapshot(root);
    const tree = menusTree(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, ...extra, '--dry-run'], root);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain(`  create ${dir}/package.json`);
    expect(res.stdout).toContain(`  create ${dir}/.gen-menu.json`);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(tree);
  });

  it.each([
    ['menus', [] as string[]],
    ['platform', ['--platform']],
    ['platform (null space)', ['--platform']],
  ])('generates then removes a %s package, restoring the app files and the tree', (label, extra) => {
    const root = fresh();
    if (label.includes('null')) nullSpace(root);
    const before = appSnapshot(root);
    const tree = menusTree(root);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS, ...extra], root).status).toBe(0);
    expect(menusTree(root).length).toBeGreaterThan(tree.length);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain(label.startsWith('menus') ? 'deleted menus/mars/gen-probe/' : 'deleted platform/gen-probe/');
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(tree);
  });

  it('keeps pre-existing metadata without a placement field removable as a menus package', () => {
    const root = fresh();
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const metaPath = join(root, 'menus/mars', FIXTURE_FOLDER, '.gen-menu.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    delete meta.placement;
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    expect(existsSync(join(root, 'menus/mars', FIXTURE_FOLDER))).toBe(false);
  });

  it('--remove takes no --platform and writes nothing', () => {
    const root = fresh();
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root).status).toBe(0);
    const before = appSnapshot(root);
    const tree = menusTree(root);
    const res = runCli(['--remove', FIXTURE_GROUP, '--platform'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/--remove does not take --platform/);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(tree);
  });

  it.each([
    ['group ownership', `{ id: 'other-x', group: '${FIXTURE_GROUP}', path: '/other' }`, undefined, /already owned by platform\/other/],
    ['menu id', `{ id: 'gen-probe', group: 'metrics', path: '/other' }`, undefined, /menu id 'gen-probe' is already used by platform\/other/],
    ['path shape', `{ id: 'other-x', group: 'metrics', path: '/gen-probe' }`, undefined, /path shape '\/gen-probe' collides with platform\/other/],
    ['package name', `{ id: 'other-x', group: 'metrics', path: '/other' }`, `${PACKAGE_PREFIX}menu-gen-probe`, /package name '.*menu-gen-probe' is already used by platform\/other/],
  ])('refuses a duplicate %s held by a platform package when generating into menus/', (_label, manifest, name, error) => {
    const root = fresh();
    addPlatformPackage(root, 'other', manifest, name);
    const before = appSnapshot(root);
    const tree = menusTree(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(error);
    expect(appSnapshot(root)).toEqual(before);
    expect(menusTree(root)).toEqual(tree);
  });

  it('refuses a duplicate held by a menus package when generating into platform/', () => {
    const root = fresh();
    writeFileSync(join(root, 'menus/mars/metric-catalog/src/index.ts'), `export const manifests = [{ id: 'gen-probe', group: 'metrics', path: '/metrics' }];\n`);
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/menu id 'gen-probe' is already used by menus\/mars\/metric-catalog/);
    expect(appSnapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'platform'))).toBe(false);
  });

  describe('metadata is never trusted past the discovered folder', () => {
    const generated = (): string => {
      const root = fresh();
      expect(runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root).status).toBe(0);
      return root;
    };
    const metaOf = (root: string): string => join(root, 'platform', FIXTURE_FOLDER, '.gen-menu.json');
    const patch = (root: string, change: Record<string, unknown>): void => {
      writeFileSync(metaOf(root), JSON.stringify({ ...JSON.parse(readFileSync(metaOf(root), 'utf8')), ...change }));
    };

    it.each([
      ['placement says menus', { placement: 'menus' }],
      ['unknown placement', { placement: 'elsewhere' }],
      ['folder differs', { folder: 'other-folder' }],
      ['space is not an id', { space: '../escape' }],
    ])('refuses a platform package whose metadata has %s', (_label, change) => {
      const root = generated();
      patch(root, change);
      const before = appSnapshot(root);
      const tree = menusTree(root);
      const res = runCli(['--remove', FIXTURE_GROUP], root);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/metadata path mismatch/);
      expect(appSnapshot(root)).toEqual(before);
      expect(menusTree(root)).toEqual(tree);
    });

    it('refuses a consistently forged folder (metadata, physical folder, files, wiring) whose group is not that folder\'s name', () => {
      const root = generated();
      const dir = join(root, 'platform', FIXTURE_FOLDER);
      const forged = { ...JSON.parse(readFileSync(metaOf(root), 'utf8')), folder: 'other' } as MenuInputs;
      const date = /^## 0\.1\.0 — (\d{4}-\d{2}-\d{2})$/m.exec(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'))?.[1] as string;
      renameSync(dir, join(root, 'platform', 'other'));
      for (const f of renderFiles(forged, date)) writeFileSync(join(root, 'platform/other', f.relPath), f.content);
      writeFileSync(join(root, 'platform/other/.gen-menu.json'), JSON.stringify(forged));
      for (const rel of Object.keys(appSnapshot(root))) {
        const path = join(root, rel);
        writeFileSync(path, readFileSync(path, 'utf8').split(`${PACKAGE_PREFIX}menu-${FIXTURE_FOLDER}`).join(`${PACKAGE_PREFIX}menu-other`));
      }
      const before = appSnapshot(root);
      const res = runCli(['--remove', FIXTURE_GROUP], root);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/metadata path mismatch: platform\/other\/\.gen-menu\.json/);
      expect(appSnapshot(root)).toEqual(before);
      expect(existsSync(join(root, 'platform/other'))).toBe(true);
    });

    it.each([['malformed JSON', '{'], ['non-object JSON', 'null']])('refuses %s', (_label, text) => {
      const root = generated();
      writeFileSync(metaOf(root), text);
      const before = appSnapshot(root);
      const res = runCli(['--remove', FIXTURE_GROUP], root);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/not a generated package/);
      expect(appSnapshot(root)).toEqual(before);
      expect(existsSync(join(root, 'platform', FIXTURE_FOLDER))).toBe(true);
    });

    it('refuses platform metadata copied into menus/ and a platform package nested one level deeper', () => {
      const root = generated();
      const moved = join(root, 'menus/mars', FIXTURE_FOLDER);
      cpSync(join(root, 'platform', FIXTURE_FOLDER), moved, { recursive: true });
      renameSync(join(root, 'platform', FIXTURE_FOLDER), join(root, 'platform', 'gone'));
      const wrongRoot = runCli(['--remove', FIXTURE_GROUP], root);
      expect(wrongRoot.status).toBe(1);
      expect(wrongRoot.stderr).toMatch(/exactly one|metadata path mismatch/);

      const nested = generated();
      mkdirSync(join(nested, 'platform/group'), { recursive: true });
      renameSync(join(nested, 'platform', FIXTURE_FOLDER), join(nested, 'platform/group', FIXTURE_FOLDER));
      const before = appSnapshot(nested);
      const res = runCli(['--remove', FIXTURE_GROUP], nested);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/metadata path mismatch/);
      expect(appSnapshot(nested)).toEqual(before);
      expect(existsSync(join(nested, 'platform/group', FIXTURE_FOLDER))).toBe(true);
    });

    it('refuses a user-edited platform page', () => {
      const root = generated();
      const page = join(root, 'platform', FIXTURE_FOLDER, 'src/pages/GenProbe.tsx');
      writeFileSync(page, `${readFileSync(page, 'utf8')} `);
      const res = runCli(['--remove', FIXTURE_GROUP], root);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/was edited/);
      expect(existsSync(page)).toBe(true);
    });
  });

  describe('physical boundary for platform/', () => {
    const outsideDir = (): string => {
      const dir = mkdtempSync(join(tmpdir(), 'gen-menu-platform-outside-'));
      keep.push(dir);
      return dir;
    };

    it('refuses a symlinked platform/ pointing outside the root on generate and remove', () => {
      const root = fresh();
      const outside = outsideDir();
      symlinkSync(outside, join(root, 'platform'), 'dir');
      const before = appSnapshot(root);
      const gen = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root);
      expect(gen.status).toBe(1);
      expect(gen.stderr).toMatch(/outside the workspace root/);
      expect(existsSync(join(outside, FIXTURE_FOLDER))).toBe(false);
      const rm = runCli(['--remove', FIXTURE_GROUP], root);
      expect(rm.status).toBe(1);
      expect(rm.stderr).toMatch(/outside the workspace root/);
      expect(appSnapshot(root)).toEqual(before);
    });

    it('refuses a package folder symlinked out of the root on remove, and deletes nothing outside', () => {
      const root = fresh();
      const outside = outsideDir();
      mkdirSync(join(root, 'platform'), { recursive: true });
      const target = join(outside, FIXTURE_FOLDER);
      expect(runCli([FIXTURE_GROUP, ...GEN_ARGS, '--platform'], root).status).toBe(0);
      renameSync(join(root, 'platform', FIXTURE_FOLDER), target);
      symlinkSync(target, join(root, 'platform', FIXTURE_FOLDER), 'dir');
      const before = appSnapshot(root);
      const res = runCli(['--remove', FIXTURE_GROUP], root);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/outside the workspace root/);
      expect(existsSync(join(target, '.gen-menu.json'))).toBe(true);
      expect(appSnapshot(root)).toEqual(before);
    });
  });
});
