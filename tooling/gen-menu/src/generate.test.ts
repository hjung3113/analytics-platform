import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { APP_PKG, MENUS_TS, STYLE_CSS, editSummary } from './generate.ts';
import { PAGE_SLOTS, PAGE_TYPES, depLine, importLine, renderFiles, spreadLine, styleLine, type MenuInputs } from './templates.ts';
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

describe('scaffold permission (#47)', () => {
  it('the sample page requests with the permission its manifest declares', () => {
    const files = renderFiles(INPUTS);
    const index = files.find(f => f.relPath === 'src/index.ts')!.content;
    const page = files.find(f => f.relPath.startsWith('src/pages/'))!.content;
    const declared = /permission: '([^']+)'/.exec(index)?.[1];
    expect(declared).toBeTruthy();
    expect(page).toMatch(new RegExp(`serve\\(\\{[\\s\\S]*permission: '${declared}'`));
  });
});

describe('page archetype skeletons (06 §12, #104)', () => {
  const pageOf = (pageType: MenuInputs['pageType']) =>
    renderFiles({ ...INPUTS, pageType }).find(f => f.relPath.startsWith('src/pages/'))!.content;

  it.each(PAGE_TYPES)('%s: manifest pageType and page slots agree, in reading order', pageType => {
    const files = renderFiles({ ...INPUTS, pageType });
    expect(files.find(f => f.relPath === 'src/index.ts')!.content).toContain(`pageType: '${pageType}'`);
    const page = pageOf(pageType);
    const ids = [...page.matchAll(/\{ id: '([^']+)', ko:/g)].map(m => m[1]);
    expect(ids).toEqual(PAGE_SLOTS[pageType].map(slot => slot.id));
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  it('each archetype has its own skeleton, not one shared body', () => {
    const bodies = new Set(PAGE_TYPES.map(pageOf));
    expect(bodies.size).toBe(PAGE_TYPES.length);
  });

  it('the archetype-defining slots from 06 §12 are present', () => {
    expect(pageOf('analysis')).toContain("id: 'chart'");
    expect(pageOf('management')).toContain("id: 'drawer'");
    expect(pageOf('workflow')).toContain("id: 'timeline'");
    expect(pageOf('catalog')).toContain("id: 'definition'");
    expect(pageOf('overview')).toContain("id: 'attention'");
  });
});

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
