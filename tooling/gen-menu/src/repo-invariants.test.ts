import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { removeFixture } from './fixture.ts';
import { checkCodeowners, checkMenuVersions, checkGroups, checkMarkers, checkNoProbe, checkWiring, loadShape, type RepoShape } from './repo-invariants.ts';

describe('CODEOWNERS menu folders', () => {
  const folders = ['mars/analytics', 'mars/equipment'];
  const owners = '# comment\n\n/menus/mars/ @hjung3113\n/menus/mars/analytics/ @hjung3113\n/menus/mars/equipment/ @hjung3113\n';

  it('requires an explicit entry for each group even when the system is covered', () => {
    expect(() => checkCodeowners(folders, owners)).not.toThrow();
    expect(() => checkCodeowners(folders, owners.replace('/menus/mars/analytics/', 'menus/mars/analytics/'))).not.toThrow();
    expect(() => checkCodeowners(folders, owners.replace('/menus/mars/analytics/ @hjung3113\n', '# /menus/mars/analytics/ @hjung3113\n'))).toThrow(/menus\/mars\/analytics/);
  });

  it.each(['/menus/mars/missing/', '/menus/missing/', 'menus/mars/missing/', 'menus/missing/'])('rejects a nonexistent menu folder %s', path => {
    expect(() => checkCodeowners(folders, `${owners}${path} @hjung3113\n`)).toThrow(/nonexistent/);
  });
});

/** folder ↔ GroupId of the seven real packages plus an eighth wired one. */
const GROUPS: { folder: string; group: string }[] = [
  { folder: 'home', group: 'overview' },
  { folder: 'equipment', group: 'equipment' },
  { folder: 'master-data', group: 'masterData' },
  { folder: 'analytics', group: 'analytics' },
  { folder: 'metrics', group: 'metrics' },
  { folder: 'notice-voc', group: 'noticeVoc' },
  { folder: 'admin', group: 'admin' },
  { folder: 'quality', group: 'quality' },
];

const binding = (folder: string): string => folder.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function wiredAppPkg(): string {
  const deps = GROUPS.map(g => `${PACKAGE_PREFIX}menu-${g.folder}`).sort()
    .map(n => `    "${n}": "workspace:*",`);
  return `{
  "name": "fixture-app",
  "private": true,
  "dependencies": {
    "${PACKAGE_PREFIX}components": "workspace:*",
${deps.join('\n')}
    "${PACKAGE_PREFIX}mock-server": "workspace:*"
  }
}
`;
}

function makeWiredRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-menu-repo-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - menus/*/*\n');
  mkdirSync(join(root, 'apps/platform-web/src/dev'), { recursive: true });

  const imports = GROUPS.map(g => `import { manifests as ${binding(g.folder)} } from '${PACKAGE_PREFIX}menu-${g.folder}';`).join('\n');
  const rows = GROUPS.map(g => `  { id: '${g.group}', label: { ko: 'g', en: 'g' }, icon: I, space: ${g.folder === 'home' ? 'null' : "'mars'"} },`).join('\n');
  const spreads = GROUPS.map(g => `  ...${binding(g.folder)},`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/menus.ts'), `// <gen:menu-imports>
${imports}
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
${rows}
  // </gen:menu-groups>
];

export const SPACES: SpaceDef[] = [
  { id: 'mars', label: { ko: 'a', en: 'a' } },
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
${spreads}
  // </gen:menu-spreads>
];
`);
  const mockImports = ['analytics', 'quality'].map(f => `import { ${binding(f)}Mock } from '${PACKAGE_PREFIX}menu-${f}/mock';`).join('\n');
  const mockSpreads = ['analytics', 'quality'].map(f => `  ...${binding(f)}Mock,`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/dev/mock-assembly.tsx'), `import { registry } from './menus';
import { createMockAdapter } from '${PACKAGE_PREFIX}mock-server';
// <gen:menu-mock-imports>
${mockImports}
// </gen:menu-mock-imports>

export const MOCK_ENDPOINTS = [
  // <gen:menu-mock-spreads>
${mockSpreads}
  // </gen:menu-mock-spreads>
];
`);
  const cssImports = GROUPS.map(g => `@import "${PACKAGE_PREFIX}menu-${g.folder}/styles.css";`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/style.css'), `/* <gen:menu-styles> */
${cssImports}
/* </gen:menu-styles> */
`);
  writeFileSync(join(root, 'apps/platform-web/package.json'), wiredAppPkg());
  for (const g of GROUPS) {
    mkdirSync(join(root, 'menus', g.folder === 'home' ? '_global' : 'mars', g.folder, 'src'), { recursive: true });
    writeFileSync(join(root, 'menus', g.folder === 'home' ? '_global' : 'mars', g.folder, 'src/index.ts'), `export const manifests = [{ id: '${g.folder}-x', group: '${g.group}', path: '/${g.folder}' }];\n`);
    writeFileSync(join(root, 'menus', g.folder === 'home' ? '_global' : 'mars', g.folder, 'src/styles.css'), '@source "./";\n');
  }
  // Only analytics and quality ship a mock half; the other folders must not need registration.
  for (const folder of ['analytics', 'quality']) {
    mkdirSync(join(root, 'menus', 'mars', folder, 'src/mock'), { recursive: true });
    writeFileSync(join(root, 'menus', 'mars', folder, 'src/mock/index.ts'), `export const ${binding(folder)}Mock = [];\n`);
  }
  return root;
}

describe('wiring invariants against a fixture repo', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeWiredRepo(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });


  it('discovers indexes, CSS and mock halves under global and named spaces', () => {
    const root = fresh();
    mkdirSync(join(root, 'menus/_global/home/src/mock'), { recursive: true });
    writeFileSync(join(root, 'menus/_global/home/src/mock/index.ts'), 'export const homeMock = [];');
    const shape = loadShape(root);
    for (const folder of ['_global/home', 'mars/analytics']) {
      expect(shape.folders).toContain(folder);
      expect(shape.indexes[folder]).toContain('export const manifests');
      expect(shape.cssFolders).toContain(folder);
      expect(shape.mockFolders).toContain(folder);
    }
  });

  it('rejects only the space mismatch when a valid owner moves to another registered space', () => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs.replace("{ id: 'mars', label: { ko: 'a', en: 'a' } },", "{ id: 'mars', label: { ko: 'a', en: 'a' } },\n  { id: 'other', label: { ko: 'o', en: 'o' } },");
    expect(() => checkGroups(shape)).not.toThrow();
    shape.folders = shape.folders.map(f => f === 'mars/quality' ? 'other/quality' : f);
    shape.indexes['other/quality'] = shape.indexes['mars/quality'];
    delete shape.indexes['mars/quality'];
    expect(() => checkMarkers(shape)).not.toThrow();
    expect(() => checkWiring(shape)).not.toThrow();
    expect(() => checkGroups(shape)).toThrow(/space mismatch/);
    // Change only this row's space: every other ownership/wiring condition stays identical.
    shape.menusTs = shape.menusTs.replace("{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: 'mars'", "{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: 'other'");
    expect(() => checkGroups(shape)).not.toThrow();
  });

  it('rejects a package without a manifest owner', () => {
    const shape = loadShape(fresh());
    delete shape.indexes['mars/quality'];
    expect(() => checkGroups(shape)).toThrow(/missing manifest/);
  });

  it('rejects a one-level package even beside correctly nested packages', () => {
    const root = fresh();
    mkdirSync(join(root, 'menus/legacy'), { recursive: true });
    writeFileSync(join(root, 'menus/legacy/package.json'), '{}');
    expect(() => checkGroups(loadShape(root))).toThrow(/one-level/);
  });

  it.each([
    ['unregistered space', "space: 'mars'", "space: 'unknown'", /unregistered space/],
    ['missing space', ", space: 'mars'", '', /space/],
    ['unreadable space', "space: 'mars'", 'space: selected', /space/],
    ['spread can override space', "space: 'mars'", "space: 'mars', ...override", /GROUPS/],
    ['computed space field', "space: 'mars'", "['space']: 'mars'", /GROUPS/],
    ['duplicate space field', "space: 'mars'", "space: 'mars', space: null", /space/],
    ['duplicate GROUPS row', "  { id: 'quality',", "  { id: 'quality', space: 'mars' },\n  { id: 'quality',", /GROUPS/],
    ['duplicate SPACES id', "  { id: 'mars', label: { ko: 'a', en: 'a' } },", "  { id: 'mars' },\n  { id: 'mars' },", /SPACES/],
  ])('rejects %s without guessing', (_label, from, to, error) => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs.replace(from, to);
    expect(() => checkGroups(shape)).toThrow(error);
  });

  it('accepts a fully wired eighth group (including identical GROUPS/SPACES ids)', () => {
    const shape: RepoShape = loadShape(fresh());
    expect(() => checkMarkers(shape)).not.toThrow();
    expect(() => checkGroups(shape)).not.toThrow();
    expect(() => checkWiring(shape)).not.toThrow();
    expect(() => checkNoProbe(shape, false)).not.toThrow();
  });

  it('rejects a missing mock spread for the eighth group in mock-assembly.tsx', () => {
    const root = fresh();
    const mockAssemblyTsx = join(root, 'apps/platform-web/src/dev/mock-assembly.tsx');
    writeFileSync(mockAssemblyTsx, readFileSync(mockAssemblyTsx, 'utf8').replace(`  ...${binding('quality')}Mock,\n`, ''));
    expect(() => checkWiring(loadShape(root))).toThrow(/no spread inside the mock-assembly.tsx mock spread markers/);
  });

  it('rejects missing mock markers in mock-assembly.tsx', () => {
    const root = fresh();
    const mockAssemblyTsx = join(root, 'apps/platform-web/src/dev/mock-assembly.tsx');
    writeFileSync(mockAssemblyTsx, readFileSync(mockAssemblyTsx, 'utf8').replace('// <gen:menu-mock-imports>\n', ''));
    expect(() => checkMarkers(loadShape(root))).toThrow(/must appear exactly once in apps\/platform-web\/src\/dev\/mock-assembly\.tsx/);
  });

  it('rejects a missing spread for the eighth group', () => {
    const root = fresh();
    const menusTs = join(root, 'apps/platform-web/src/menus.ts');
    writeFileSync(menusTs, readFileSync(menusTs, 'utf8').replace(`  ...${binding('quality')},\n`, ''));
    expect(() => checkWiring(loadShape(root))).toThrow(/no spread inside the spread markers/);
  });

  it('does not count commented-out mock lines as wired', () => {
    const root = fresh();
    const mockAssemblyTsx = join(root, 'apps/platform-web/src/dev/mock-assembly.tsx');
    const original = readFileSync(mockAssemblyTsx, 'utf8');
    // The commented lines still contain the exact import/spread text as substrings — the checks
    // match whole trimmed lines, so both must be refused.
    writeFileSync(mockAssemblyTsx, original
      .replace(`import { ${binding('quality')}Mock } from '${PACKAGE_PREFIX}menu-quality/mock';`, `// import { ${binding('quality')}Mock } from '${PACKAGE_PREFIX}menu-quality/mock';`)
      .replace(`  ...${binding('quality')}Mock,`, `//   ...${binding('quality')}Mock,`));
    expect(() => checkWiring(loadShape(root))).toThrow(/no import inside the mock-assembly\.tsx mock import markers/);
  });

  it('skips the probe-name check only under GEN_MENU_PROBE', () => {
    const root = fresh();
    const menusTs = join(root, 'apps/platform-web/src/menus.ts');
    writeFileSync(menusTs, `${readFileSync(menusTs, 'utf8')}// genProbe\n`);
    expect(() => checkNoProbe(loadShape(root), false)).toThrow(/genProbe/);
    expect(() => checkNoProbe(loadShape(root), true)).not.toThrow();
  });
});

describe('menu version metadata', () => {
  const keep: string[] = [];
  const fresh = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'menu-versions-'));
    keep.push(root);
    const dir = join(root, 'menus/mars/example');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.1.0', ap: { sdk: '>=0.19.0 <0.20.0' } }));
    writeFileSync(join(dir, 'CHANGELOG.md'), '# 기록\n\n## 0.1.0 — 2026-10-27\n');
    return root;
  };
  afterAll(() => { for (const root of keep) removeFixture(root); });
  it('accepts valid metadata and caret ranges', () => {
    const root = fresh();
    expect(() => checkMenuVersions(root)).not.toThrow();
    writeFileSync(join(root, 'menus/mars/example/package.json'), JSON.stringify({ version: '1.2.3', ap: { sdk: '^1.2.3' } }));
    writeFileSync(join(root, 'menus/mars/example/CHANGELOG.md'), '## 1.2.3\n');
    expect(() => checkMenuVersions(root)).not.toThrow();
  });
  it.each([
    ['missing version', { ap: { sdk: '^0.17.0' } }],
    ['zero version', { version: '0.0.0', ap: { sdk: '^0.17.0' } }],
    ['missing SDK range', { version: '0.1.0' }],
    ['invalid SDK range', { version: '0.1.0', ap: { sdk: '>=0.17.0 <0.19.0' } }],
  ])('rejects %s', (_label, pkg) => {
    const root = fresh();
    writeFileSync(join(root, 'menus/mars/example/package.json'), JSON.stringify(pkg));
    expect(() => checkMenuVersions(root)).toThrow();
  });
  it('rejects a missing changelog', () => {
    const root = fresh();
    unlinkSync(join(root, 'menus/mars/example/CHANGELOG.md'));
    expect(() => checkMenuVersions(root)).toThrow(/CHANGELOG/);
  });
  it('rejects a first changelog version mismatch', () => {
    const root = fresh();
    writeFileSync(join(root, 'menus/mars/example/CHANGELOG.md'), '## 0.2.0\n## 0.1.0\n');
    expect(() => checkMenuVersions(root)).toThrow(/CHANGELOG/);
  });
});
