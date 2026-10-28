import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { removeFixture } from './fixture.ts';
import { checkCodeowners, checkMenuVersions, checkGroups, checkMarkers, checkNoProbe, checkUniqueness, checkWiring, loadShape, type RepoShape } from './repo-invariants.ts';

describe('CODEOWNERS package folders', () => {
  const folders = ['menus/mars/analytics', 'menus/mars/equipment', 'platform/home'];
  const owners = '# comment\n\n/menus/mars/ @hjung3113\n/menus/mars/analytics/ @hjung3113\n/menus/mars/equipment/ @hjung3113\n/platform/ @hjung3113\n/platform/home/ @hjung3113\n';

  it('requires an explicit entry for each group even when the system is covered', () => {
    expect(() => checkCodeowners(folders, owners)).not.toThrow();
    expect(() => checkCodeowners(folders, owners.replace('/menus/mars/analytics/', 'menus/mars/analytics/'))).not.toThrow();
    expect(() => checkCodeowners(folders, owners.replace('/menus/mars/analytics/ @hjung3113\n', '# /menus/mars/analytics/ @hjung3113\n'))).toThrow(/menus\/mars\/analytics/);
    expect(() => checkCodeowners(folders, owners.replace('/platform/home/ @hjung3113\n', ''))).toThrow(/platform\/home/);
  });

  it.each(['/menus/mars/missing/', '/menus/missing/', 'menus/mars/missing/', 'menus/missing/', '/menus/_global/', '/platform/missing/', 'platform/missing/', '/platform/home/deeper/'])('rejects a nonexistent package folder %s', path => {
    expect(() => checkCodeowners(folders, `${owners}${path} @hjung3113\n`)).toThrow(/nonexistent/);
  });
});

type Pkg = { folder: string; group: string; root: 'menus' | 'platform'; space: string | null; name?: string; binding?: string };

/** Packages of both roots. Folder, group, package name and app binding are deliberately all different where a real package differs. */
const PACKAGES: Pkg[] = [
  { folder: 'home', group: 'overview', root: 'platform', space: null },
  { folder: 'dashboard', group: 'foDashboard', root: 'platform', space: 'mars', binding: 'foDashboard' },
  { folder: 'feature-admin', group: 'foAdmin', root: 'platform', space: 'mars', binding: 'foAdmin' },
  { folder: 'equipment', group: 'equipment', root: 'menus', space: 'mars' },
  { folder: 'master-data', group: 'masterData', root: 'menus', space: 'mars' },
  { folder: 'analytics', group: 'analytics', root: 'menus', space: 'mars' },
  { folder: 'metrics', group: 'metrics', root: 'menus', space: 'mars' },
  { folder: 'quality', group: 'quality', root: 'menus', space: 'mars' },
];

const toBinding = (folder: string): string => folder.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const binding = (p: Pkg | string): string => typeof p === 'string' ? toBinding(p) : p.binding ?? toBinding(p.folder);
const pkgName = (p: Pkg): string => `${PACKAGE_PREFIX}menu-${p.folder}`;
const dirOf = (p: Pkg): string => p.root === 'platform' ? `platform/${p.folder}` : `menus/${p.space}/${p.folder}`;
const MOCKS = ['analytics', 'quality'];

function wiredAppPkg(): string {
  const deps = PACKAGES.map(pkgName).sort()
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
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - menus/*/*\n  - platform/*\n');
  mkdirSync(join(root, 'apps/platform-web/src/dev'), { recursive: true });

  const imports = PACKAGES.map(p => `import { manifests as ${binding(p)} } from '${pkgName(p)}';`).join('\n');
  const rows = PACKAGES.map(p => `  { id: '${p.group}', label: { ko: 'g', en: 'g' }, icon: I, space: ${p.space === null ? 'null' : `'${p.space}'`} },`).join('\n');
  const spreads = PACKAGES.map(p => `  ...${binding(p)},`).join('\n');
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
  const mockImports = MOCKS.map(f => `import { ${binding(f)}Mock } from '${PACKAGE_PREFIX}menu-${f}/mock';`).join('\n');
  const mockSpreads = MOCKS.map(f => `  ...${binding(f)}Mock,`).join('\n');
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
  const cssImports = PACKAGES.map(p => `@import "${pkgName(p)}/styles.css";`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/style.css'), `/* <gen:menu-styles> */
${cssImports}
/* </gen:menu-styles> */
`);
  writeFileSync(join(root, 'apps/platform-web/package.json'), wiredAppPkg());
  for (const p of PACKAGES) {
    const dir = join(root, dirOf(p));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: pkgName(p), version: '0.1.0' })}\n`);
    writeFileSync(join(dir, 'src/index.ts'), `export const manifests = [{ id: '${p.folder}-x', group: '${p.group}', path: '/${p.folder}' }];\n`);
    writeFileSync(join(dir, 'src/styles.css'), '@source "./";\n');
  }
  // Only analytics and quality ship a mock half; the other folders must not need registration.
  for (const folder of MOCKS) {
    const p = PACKAGES.find(q => q.folder === folder) as Pkg;
    mkdirSync(join(root, dirOf(p), 'src/mock'), { recursive: true });
    writeFileSync(join(root, dirOf(p), 'src/mock/index.ts'), `export const ${binding(folder)}Mock = [];\n`);
  }
  return root;
}

describe('wiring invariants against a fixture repo', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeWiredRepo(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });


  it('discovers indexes, CSS and mock halves under platform features and named spaces', () => {
    const root = fresh();
    mkdirSync(join(root, 'platform/home/src/mock'), { recursive: true });
    writeFileSync(join(root, 'platform/home/src/mock/index.ts'), 'export const homeMock = [];');
    const shape = loadShape(root);
    for (const folder of ['platform/home', 'menus/mars/analytics']) {
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
    shape.folders = shape.folders.map(f => f === 'menus/mars/quality' ? 'menus/other/quality' : f);
    shape.indexes['menus/other/quality'] = shape.indexes['menus/mars/quality'];
    delete shape.indexes['menus/mars/quality'];
    shape.packageNames['menus/other/quality'] = shape.packageNames['menus/mars/quality'];
    shape.cssFolders = shape.cssFolders.map(f => f === 'menus/mars/quality' ? 'menus/other/quality' : f);
    shape.mockFolders = shape.mockFolders.map(f => f === 'menus/mars/quality' ? 'menus/other/quality' : f);
    shape.mockIndexes['menus/other/quality'] = shape.mockIndexes['menus/mars/quality'];
    expect(() => checkMarkers(shape)).not.toThrow();
    expect(() => checkWiring(shape)).not.toThrow();
    expect(() => checkGroups(shape)).toThrow(/space mismatch/);
    // Change only this row's space: every other ownership/wiring condition stays identical.
    shape.menusTs = shape.menusTs.replace("{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: 'mars'", "{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: 'other'");
    expect(() => checkGroups(shape)).not.toThrow();
  });

  it('rejects a package without a manifest owner', () => {
    const shape = loadShape(fresh());
    delete shape.indexes['menus/mars/quality'];
    expect(() => checkGroups(shape)).toThrow(/missing manifest/);
  });

  it('rejects a one-level package even beside correctly nested packages', () => {
    const root = fresh();
    mkdirSync(join(root, 'menus/legacy'), { recursive: true });
    writeFileSync(join(root, 'menus/legacy/package.json'), '{}');
    expect(() => checkGroups(loadShape(root))).toThrow(/one-level/);
  });

  it('rejects a nested platform package and a package under an unknown root', () => {
    const root = fresh();
    mkdirSync(join(root, 'platform/group/inner/src'), { recursive: true });
    writeFileSync(join(root, 'platform/group/inner/src/index.ts'), 'export const manifests = [];\n');
    expect(() => checkGroups(loadShape(root))).toThrow(/nested platform package/);
    const shape = loadShape(fresh());
    shape.folders.push('other/x');
    shape.indexes['other/x'] = '';
    expect(() => checkGroups(shape)).toThrow(/unknown package root/);
  });

  it('takes the space of a platform feature from GROUPS only, never from its folder name', () => {
    const shape = loadShape(fresh());
    // `platform/dashboard` owns foDashboard (space mars) and `platform/home` owns overview (null): neither folder name is judged.
    expect(() => checkGroups(shape)).not.toThrow();
    shape.menusTs = shape.menusTs.replace("{ id: 'foDashboard', label: { ko: 'g', en: 'g' }, icon: I, space: 'mars'", "{ id: 'foDashboard', label: { ko: 'g', en: 'g' }, icon: I, space: null");
    expect(() => checkGroups(shape)).not.toThrow();
  });

  it('rejects a domain menus/ package that owns a null-space group', () => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs.replace("{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: 'mars'", "{ id: 'quality', label: { ko: 'g', en: 'g' }, icon: I, space: null");
    expect(() => checkGroups(shape)).toThrow(/space mismatch/);
  });

  it('rejects a group owned by packages in both roots', () => {
    const shape = loadShape(fresh());
    shape.folders.push('menus/mars/copy');
    shape.indexes['menus/mars/copy'] = shape.indexes['platform/dashboard'] as string;
    expect(() => checkGroups(shape)).toThrow(/exactly one package index/);
  });

  it.each([
    ['package name across roots', (shape: RepoShape) => { shape.folders.push('menus/mars/copy'); shape.indexes['menus/mars/copy'] = "export const manifests = [{ id: 'copy-x', group: 'quality', path: '/copy' }];"; shape.packageNames['menus/mars/copy'] = shape.packageNames['platform/dashboard']; }, /package name/],
    ['menu id across roots', (shape: RepoShape) => { shape.folders.push('menus/mars/copy'); shape.indexes['menus/mars/copy'] = "export const manifests = [{ id: 'dashboard-x', group: 'quality', path: '/copy' }];"; }, /menu id 'dashboard-x'/],
    ['path shape across roots', (shape: RepoShape) => { shape.folders.push('menus/mars/copy'); shape.indexes['menus/mars/copy'] = "export const manifests = [{ id: 'copy-x', group: 'quality', path: '/dashboard' }];"; }, /path shape '\/dashboard'/],
  ])('rejects a duplicate %s', (_label, mutate, error) => {
    const shape = loadShape(fresh());
    expect(() => checkUniqueness(shape)).not.toThrow();
    mutate(shape);
    expect(() => checkUniqueness(shape)).toThrow(error);
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

  it('wires by the actual import and spread, so menu-dashboard / foDashboard and menu-feature-admin / foAdmin pass', () => {
    const shape = loadShape(fresh());
    expect(shape.menusTs).toContain(`import { manifests as foDashboard } from '${PACKAGE_PREFIX}menu-dashboard';`);
    expect(shape.menusTs).toContain(`import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';`);
    expect(() => checkWiring(shape)).not.toThrow();
  });

  it.each([
    ['missing import', `import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';\n`, '', /no manifests import/],
    ['missing spread', '  ...foAdmin,\n', '', /no spread inside the spread markers/],
    ['spread of a different binding', '  ...foAdmin,\n', '  ...elsewhere,\n', /no spread inside the spread markers/],
    ['import under a different binding', `import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';`, `import { manifests as renamed } from '${PACKAGE_PREFIX}menu-feature-admin';`, /no spread inside the spread markers/],
    ['duplicate import', `import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';\n`, `import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';\nimport { manifests as foAdmin2 } from '${PACKAGE_PREFIX}menu-feature-admin';\n`, /2 manifests imports/],
    ['duplicate spread', '  ...foAdmin,\n', '  ...foAdmin,\n  ...foAdmin,\n', /spread 2 times/],
    ['commented-out import', `import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';`, `// import { manifests as foAdmin } from '${PACKAGE_PREFIX}menu-feature-admin';`, /no manifests import/],
    ['commented-out spread', '  ...foAdmin,', '  // ...foAdmin,', /no spread inside the spread markers/],
  ])('rejects %s for a package whose binding differs from its name', (_label, from, to, error) => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs.replace(from, to);
    expect(() => checkWiring(shape)).toThrow(error);
  });

  it('rejects an app-side spread that no menu import backs', () => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs.replace('  ...foAdmin,\n', '  ...foAdmin,\n  ...stray,\n');
    expect(() => checkWiring(shape)).toThrow(/'\.\.\.stray'/);
  });

  it('rejects a manifests import and matching spread of a package that is not an app dependency', () => {
    const shape = loadShape(fresh());
    shape.menusTs = shape.menusTs
      .replace('// <gen:menu-imports>\n', `// <gen:menu-imports>\nimport { manifests as unlisted } from '${PACKAGE_PREFIX}menu-unlisted';\n`)
      .replace('  ...foAdmin,\n', '  ...foAdmin,\n  ...unlisted,\n');
    expect(() => checkWiring(shape)).toThrow(/'\.\.\.unlisted'.*no matching manifests import of a menu dependency/);
  });

  it('rejects a package that is not an app dependency', () => {
    const shape = loadShape(fresh());
    shape.packageNames['platform/home'] = `${PACKAGE_PREFIX}menu-orphan`;
    expect(() => checkWiring(shape)).toThrow(/not an app dependency/);
  });

  it('validates the mock import against the package\'s actual export and a matching spread', () => {
    const shape = loadShape(fresh());
    shape.mockIndexes['menus/mars/quality'] = 'export const otherMock = [];\n';
    expect(() => checkWiring(shape)).toThrow(/does not export 'qualityMock'/);
    shape.mockIndexes['menus/mars/quality'] = 'const x = []; export { x as qualityMock };\n';
    expect(() => checkWiring(shape)).not.toThrow();
    shape.mockAssemblyTsx = shape.mockAssemblyTsx.replace('  ...qualityMock,', '  ...qualityMock,\n  ...qualityMock,');
    expect(() => checkWiring(shape)).toThrow(/spread 2 times/);
  });

  it('accepts a mock import under a local alias when the spread uses the alias', () => {
    const shape = loadShape(fresh());
    shape.mockAssemblyTsx = shape.mockAssemblyTsx
      .replace("import { qualityMock } from", "import { qualityMock as qm } from").replace('  ...qualityMock,', '  ...qm,');
    expect(() => checkWiring(shape)).not.toThrow();
  });

  it('rejects a second aliased mock import of one package even when each alias is spread once', () => {
    const shape = loadShape(fresh());
    shape.mockAssemblyTsx = shape.mockAssemblyTsx
      .replace("import { qualityMock } from", "import { qualityMock as qm2 } from 'x';\nimport { qualityMock } from")
      .replace("import { qualityMock as qm2 } from 'x';", `import { qualityMock as qm2 } from '${PACKAGE_PREFIX}menu-quality/mock';`)
      .replace('  ...qualityMock,', '  ...qualityMock,\n  ...qm2,');
    expect(() => checkWiring(shape)).toThrow(/2 imports/);
  });

  it('rejects a mock spread with no matching mock import', () => {
    const shape = loadShape(fresh());
    shape.mockAssemblyTsx = shape.mockAssemblyTsx.replace('  ...qualityMock,', '  ...qualityMock,\n  ...strayMock,');
    expect(() => checkWiring(shape)).toThrow(/spread '\.\.\.strayMock'/);
  });

  it('rejects a mock import that belongs to no discovered mock package', () => {
    const shape = loadShape(fresh());
    shape.mockAssemblyTsx = shape.mockAssemblyTsx
      .replace('// <gen:menu-mock-imports>\n', `// <gen:menu-mock-imports>\nimport { strayMock } from '${PACKAGE_PREFIX}menu-stray/mock';\n`)
      .replace('  ...qualityMock,', '  ...qualityMock,\n  ...strayMock,');
    expect(() => checkWiring(shape)).toThrow(/menu-stray\/mock/);
  });

  it('rejects a platform/gen-probe package folder with no other probe token in the app files', () => {
    const shape = loadShape(fresh());
    expect(() => checkNoProbe(shape, false)).not.toThrow();
    shape.folders.push('platform/gen-probe');
    expect(() => checkNoProbe(shape, false)).toThrow(/probe leftover: gen-probe package folder exists/);
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
  it('checks platform features too', () => {
    const root = fresh();
    mkdirSync(join(root, 'platform/feature'), { recursive: true });
    writeFileSync(join(root, 'platform/feature/package.json'), JSON.stringify({ version: '0.0.0' }));
    expect(() => checkMenuVersions(root)).toThrow(/platform\/feature\/package\.json: invalid version/);
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
