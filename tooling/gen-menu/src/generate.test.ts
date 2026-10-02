import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { PACKAGE_PREFIX } from './prefix.ts';
import { APP_PKG, MOCK_ASSEMBLY_TSX, MENUS_TS, STYLE_CSS, editSummary } from './generate.ts';
import { PAGE_TYPES, depLine, importLine, mockImportLine, mockSpreadLine, renderFiles, slotsLiteral, spreadLine, styleLine, type MenuInputs } from './templates.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, fixtureMockAssemblyTsx, makeFixture, menusTree, removeFixture, repoRoot, runCli } from './fixture.ts';

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
  it('the sample endpoint ACL uses the permission its manifest declares', () => {
    const files = renderFiles(INPUTS);
    const index = files.find(f => f.relPath === 'src/index.ts')!.content;
    const endpoints = files.find(f => f.relPath === 'src/endpoints.ts')!.content;
    const declared = /permission: '([^']+)'/.exec(index)?.[1];
    expect(declared).toBeTruthy();
    expect(endpoints).toMatch(new RegExp(`permission: '${declared}'`));
  });
});

/** Leading whitespace of one line. */
const leadOf = (line: string): string => line.slice(0, line.length - line.trimStart().length);

const analyticsSpreadLine = (text: string): string => {
  const line = text.split('\n').find(l => l.trim() === '...analyticsMock,');
  expect(line, '...analyticsMock, row not found').toBeDefined();
  return line as string;
};

const analyticsImportLine = (text: string): string => {
  const line = text.split('\n').find(l => l.trim() === `import { analyticsMock } from '${PACKAGE_PREFIX}menu-analytics/mock';`);
  expect(line, 'analytics mock import line not found').toBeDefined();
  return line as string;
};

describe('menu-query scaffold (#126)', () => {
  /**
   * #126: the coordinator probe legitimately inserts extra generated lines inside the real file's
   * mock-spread region, so byte equality on the whole block breaks. The guard compares the block
   * skeleton instead: the createMockAdapter block with every line strictly between the
   * `// <gen:menu-mock-spreads>` and `// </gen:menu-mock-spreads>` markers removed — markers,
   * their indentation, and the surrounding lines stay byte-identical.
   */
  const skeletonOf = (text: string): string => {
    const lines = text.split('\n');
    const start = lines.indexOf('const mockAdapter = (registry: Registry): PlatformAdapter => createMockAdapter({');
    expect(start, 'createMockAdapter block not found').toBeGreaterThan(-1);
    const end = lines.indexOf('});', start);
    expect(end, 'createMockAdapter block not closed').toBeGreaterThan(start);
    const block = lines.slice(start, end + 1);
    const open = block.findIndex(l => l.trim() === '// <gen:menu-mock-spreads>');
    const close = block.findIndex(l => l.trim() === '// </gen:menu-mock-spreads>');
    expect(open, 'mock-spread region not found inside the block').toBeGreaterThan(-1);
    expect(close, 'mock-spread region not closed inside the block').toBeGreaterThan(open);
    return [...block.slice(0, open + 1), ...block.slice(close)].join('\n');
  };

  it('keeps the fixture createMockAdapter block skeleton byte-identical to the real mock-assembly.tsx', () => {
    const real = readFileSync(join(repoRoot(), MOCK_ASSEMBLY_TSX), 'utf8');
    expect(skeletonOf(fixtureMockAssemblyTsx())).toBe(skeletonOf(real));
  });

  it('the skeleton guard survives the probe condition: an extra generated line inside the region (string copy)', () => {
    const real = readFileSync(join(repoRoot(), MOCK_ASSEMBLY_TSX), 'utf8');
    const probed = real.replace('    ...analyticsMock,\n', `    ...analyticsMock,\n${mockSpreadLine(INPUTS)}\n`);
    expect(probed, 'probe simulation did not insert a line').not.toBe(real);
    // The old byte-identity guard failed under exactly this edit; the skeleton guard must pass.
    expect(skeletonOf(probed)).toBe(skeletonOf(real));
  });

  /** #126: the generated rows' indentation must equal the region indentation — pinned where the skeleton guard deliberately strips it. */
  it('mockSpreadLine/mockImportLine indentation equals the region indentation in the fixture and the real mock-assembly.tsx (byte-level)', () => {
    const real = readFileSync(join(repoRoot(), MOCK_ASSEMBLY_TSX), 'utf8');
    const fixture = fixtureMockAssemblyTsx();
    expect(leadOf(mockSpreadLine(INPUTS))).toBe(leadOf(analyticsSpreadLine(fixture)));
    expect(leadOf(analyticsSpreadLine(real))).toBe(leadOf(analyticsSpreadLine(fixture)));
    expect(leadOf(mockImportLine(INPUTS))).toBe(leadOf(analyticsImportLine(fixture)));
    expect(leadOf(analyticsImportLine(real))).toBe(leadOf(analyticsImportLine(fixture)));
  });

  it('generates src/endpoints.ts and src/mock/index.ts instead of src/api.ts', () => {
    const paths = renderFiles(INPUTS).map(f => f.relPath);
    expect(paths, paths.join('\n')).not.toContain('src/api.ts');
    expect(paths).toContain('src/endpoints.ts');
    expect(paths).toContain('src/mock/index.ts');
  });

  it('exports ./mock and the page queries via useMenuQuery, not serve', () => {
    const files = renderFiles(INPUTS);
    const pkg = JSON.parse(files.find(f => f.relPath === 'package.json')!.content) as { exports: Record<string, string> };
    expect(pkg.exports['./mock']).toBe('./src/mock/index.ts');
    const endpoints = files.find(f => f.relPath === 'src/endpoints.ts')!.content;
    expect(endpoints).toContain(`id: '${INPUTS.group}.sample'`);
    expect(endpoints).toContain(`menuId: '${INPUTS.menuId}'`);
    const mock = files.find(f => f.relPath === 'src/mock/index.ts')!.content;
    expect(mock).toContain(`export const ${INPUTS.group}Mock`);
    const page = files.find(f => f.relPath.startsWith('src/pages/'))!.content;
    expect(page).toContain('useMenuQuery(sampleEndpoint, {})');
    expect(page).not.toContain('serve');
  });

  it('generated files import exactly the lint-clean surface (boundaries.test.ts pins the same rows)', () => {
    const specifiersOf = (code: string, fileName: string): string[] => {
      const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      return sf.statements
        .filter(ts.isImportDeclaration)
        .map(stmt => (stmt.moduleSpecifier as ts.StringLiteral).text)
        .sort();
    };
    const files = renderFiles(INPUTS);
    expect(specifiersOf(files.find(f => f.relPath === 'src/endpoints.ts')!.content, 'endpoints.ts'))
      .toEqual([`${PACKAGE_PREFIX}contracts`]);
    expect(specifiersOf(files.find(f => f.relPath === 'src/mock/index.ts')!.content, 'index.ts'))
      .toEqual(['../endpoints', `${PACKAGE_PREFIX}mock-server`]);
    expect(specifiersOf(files.find(f => f.relPath.startsWith('src/pages/'))!.content, 'page.tsx'))
      .toEqual(['../endpoints', `${PACKAGE_PREFIX}components`, `${PACKAGE_PREFIX}kernel`]);
  });
});

describe('page archetype skeletons (06 §12, #104)', () => {
  // Literal copy of 06 §12.1–12.5 content slots (English names as written), independent of PAGE_SLOTS.
  const CONTRACT: Record<MenuInputs['pageType'], string[]> = {
    overview: ['Primary KPI / Summary', 'Main Trend or Status', 'Attention List', 'Data Trust'],
    analysis: ['KPI Summary', 'Primary Chart', 'Selection / Annotation', 'Breakdown Table', 'Data Trust'],
    management: ['Search + Filter', 'Data Table', 'Selection Actions', 'Detail Drawer', 'History / Audit'],
    catalog: ['Catalog List', 'Definition Detail', 'Version', 'Ownership', 'Coverage', 'Usage / Dependency', 'History'],
    workflow: ['Queue/List', 'Status/Priority/Owner Filter', 'Detail', 'Timeline', 'Comments', 'Related Context'],
  };
  const pageOf = (pageType: MenuInputs['pageType']) =>
    renderFiles({ ...INPUTS, pageType }).find(f => f.relPath.startsWith('src/pages/'))!.content;
  const slotBlock = (page: string) => /const SLOTS = \[\n([\s\S]*?)\n\];/.exec(page)![1];
  const enNames = (page: string) => [...slotBlock(page).matchAll(/en: '((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);

  it.each(PAGE_TYPES)('%s: manifest pageType and generated slots equal the 06 §12 contract, in order', pageType => {
    const files = renderFiles({ ...INPUTS, pageType });
    expect(files.find(f => f.relPath === 'src/index.ts')!.content).toContain(`pageType: '${pageType}'`);
    expect(enNames(pageOf(pageType))).toEqual(CONTRACT[pageType]);
  });

  it('each archetype has its own slot list, and the page renders every slot', () => {
    const blocks = new Set(PAGE_TYPES.map(t => slotBlock(pageOf(t))));
    expect(blocks.size).toBe(PAGE_TYPES.length);
    for (const t of PAGE_TYPES) expect(pageOf(t)).toContain('SLOTS.map(slot => <section key={slot.id} data-slot={slot.id}');
  });

  it('a slot label with an apostrophe or backslash still yields a parseable string literal', () => {
    const literal = slotsLiteral([{ id: 'x', ko: "소유자's", en: 'a\\b' }]);
    const value = new Function(`return [\n${literal}\n];`)() as { ko: string; en: string }[];
    expect(value).toEqual([{ id: 'x', ko: "소유자's", en: 'a\\b' }]);
  });
});

describe('generate in a temp workspace', () => {
  const keep: string[] = [];
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('writes the file set and the six edits, bytes equal the templates', () => {
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
    const mainLines = readFileSync(join(root, MOCK_ASSEMBLY_TSX), 'utf8').split('\n');
    expect(mainLines[mainLines.findIndex(l => l.trim() === '// <gen:menu-mock-imports>') + 1]).toBe(
      `import { analyticsMock } from '${PACKAGE_PREFIX}menu-analytics/mock';`,
    );
    expect(mainLines[mainLines.findIndex(l => l.trim() === '// </gen:menu-mock-imports>') - 1]).toBe(mockImportLine(INPUTS));
    expect(mainLines[mainLines.findIndex(l => l.trim() === '// </gen:menu-mock-spreads>') - 1]).toBe(mockSpreadLine(INPUTS));
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

  it('inserts the mock import/spread lines with exactly the existing region indentation (pins the #126 original bug)', () => {
    const root = makeFixture();
    keep.push(root);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const lines = readFileSync(join(root, MOCK_ASSEMBLY_TSX), 'utf8').split('\n');
    const region = (start: string, end: string): string[] =>
      lines.slice(lines.findIndex(l => l.trim() === start) + 1, lines.findIndex(l => l.trim() === end));
    const spreadRegion = region('// <gen:menu-mock-spreads>', '// </gen:menu-mock-spreads>');
    expect(spreadRegion).toEqual(['    ...analyticsMock,', mockSpreadLine(INPUTS)]);
    expect(leadOf(spreadRegion[1]), 'inserted spread row must match the analytics row indentation').toBe(leadOf(spreadRegion[0]));
    const importRegion = region('// <gen:menu-mock-imports>', '// </gen:menu-mock-imports>');
    expect(importRegion).toEqual([`import { analyticsMock } from '${PACKAGE_PREFIX}menu-analytics/mock';`, mockImportLine(INPUTS)]);
    expect(leadOf(importRegion[1]), 'inserted import row must match the analytics row indentation').toBe(leadOf(importRegion[0]));
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
