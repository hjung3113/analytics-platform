import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { APP_PKG, MENUS_TS, STYLE_CSS, editSummary } from './generate.ts';
import { depLine, importLine, renderFiles, spreadLine, styleLine, type MenuInputs } from './templates.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, menusTree, removeFixture, runCli } from './fixture.ts';

const INPUTS: MenuInputs = {
  group: FIXTURE_GROUP,
  folder: FIXTURE_FOLDER,
  menuId: 'gen-probe',
  page: 'GenProbe',
  path: '/gen-probe',
  pageType: 'overview',
  labelKo: '생성 확인',
  labelEn: 'Gen probe',
  binding: FIXTURE_GROUP,
};

describe('generate in a temp workspace', () => {
  const keep: string[] = [];
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('writes the file set and the four edits, bytes equal the templates', () => {
    const root = makeFixture();
    keep.push(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(0);
    expect(res.stdout.endsWith('next: pnpm install\n')).toBe(true);

    const files = renderFiles(INPUTS);
    const pkgDir = join(root, 'menus', INPUTS.folder);
    for (const f of files) {
      expect(readFileSync(join(pkgDir, f.relPath), 'utf8'), f.relPath).toBe(f.content);
    }
    expect(readFileSync(join(pkgDir, '.gen-menu.json'), 'utf8')).toBe(`${JSON.stringify(INPUTS, null, 2)}\n`);
    expect(menusTree(root)).toEqual([
      ...files.map(f => `menus/${INPUTS.folder}/${f.relPath}`),
      `menus/${INPUTS.folder}/.gen-menu.json`,
      'menus/metric-catalog/src/index.ts',
    ].sort());

    const menusLines = readFileSync(join(root, MENUS_TS), 'utf8').split('\n');
    expect(menusLines[menusLines.findIndex(l => l.trim() === '// </gen:menu-imports>') - 1]).toBe(importLine(INPUTS));
    expect(menusLines[menusLines.findIndex(l => l.trim() === '// </gen:menu-spreads>') - 1]).toBe(spreadLine(INPUTS));
    const cssLines = readFileSync(join(root, STYLE_CSS), 'utf8').split('\n');
    expect(cssLines[cssLines.indexOf('/* </gen:menu-styles> */') - 1]).toBe(styleLine(INPUTS));
    const pkgLines = readFileSync(join(root, APP_PKG), 'utf8').split('\n');
    const depAt = pkgLines.indexOf(depLine(INPUTS));
    expect(depAt).toBeGreaterThan(-1);
    expect(pkgLines[depAt + 1]).toContain(`${PACKAGE_PREFIX}menu-home`);
    for (const line of editSummary({ root, inputs: INPUTS, files: [], packageDir: pkgDir, edits: [] })) {
      expect(res.stdout).toContain(line);
    }
  });

  it('refuses a second generate without changing bytes', () => {
    const root = makeFixture();
    keep.push(root);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const snapshot = appSnapshot(root);
    const tree = menusTree(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/already (owned|exists)/);
    expect(appSnapshot(root)).toEqual(snapshot);
    expect(menusTree(root)).toEqual(tree);
  });

  it('dry-run prints the paths and edit lines and writes nothing', () => {
    const root = makeFixture();
    keep.push(root);
    const snapshot = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--dry-run'], root);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('dry run');
    expect(res.stdout.endsWith('next: pnpm install\n')).toBe(true);
    for (const f of renderFiles(INPUTS)) {
      expect(res.stdout).toContain(`menus/${INPUTS.folder}/${f.relPath}`);
    }
    for (const line of editSummary({ root, inputs: INPUTS, files: [], packageDir: '', edits: [] })) {
      expect(res.stdout).toContain(line);
    }
    expect(appSnapshot(root)).toEqual(snapshot);
    expect(menusTree(root)).toEqual(['menus/metric-catalog/src/index.ts']);
  });
});
