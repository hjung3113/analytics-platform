import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { removeFixture } from './fixture.ts';
import { checkGroups, checkMarkers, checkNoProbe, checkWiring, loadShape, type RepoShape } from './repo-invariants.ts';

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
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - menus/*\n');
  mkdirSync(join(root, 'packages/contracts/src'), { recursive: true });
  const union = GROUPS.map(g => `'${g.group}'`).join(' | ');
  writeFileSync(join(root, 'packages/contracts/src/menu.ts'), `export type GroupId = ${union};\n`);
  mkdirSync(join(root, 'apps/platform-web/src/dev'), { recursive: true });

  const imports = GROUPS.map(g => `import { manifests as ${binding(g.folder)} } from '${PACKAGE_PREFIX}menu-${g.folder}';`).join('\n');
  const rows = GROUPS.map(g => `  { id: '${g.group}', label: { ko: 'g', en: 'g' }, icon: I, space: 'analytics' },`).join('\n');
  const spreads = GROUPS.map(g => `  ...${binding(g.folder)},`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/menus.ts'), `// <gen:menu-imports>
${imports}
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
${rows}
  // </gen:menu-groups>
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
${spreads}
  // </gen:menu-spreads>
];
`);
  const mockImports = ['analytics', 'quality'].map(f => `import { ${binding(f)}Mock } from '${PACKAGE_PREFIX}menu-${f}/mock';`).join('\n');
  const mockSpreads = ['analytics', 'quality'].map(f => `    ...${binding(f)}Mock,`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/dev/mock-assembly.tsx'), `import { registry } from './menus';
import { createMockAdapter } from '${PACKAGE_PREFIX}mock-server';
// <gen:menu-mock-imports>
${mockImports}
// </gen:menu-mock-imports>

const adapter = createMockAdapter({
  endpoints: [
    // <gen:menu-mock-spreads>
${mockSpreads}
    // </gen:menu-mock-spreads>
  ],
  registry,
});
`);
  const cssImports = GROUPS.map(g => `@import "${PACKAGE_PREFIX}menu-${g.folder}/styles.css";`).join('\n');
  writeFileSync(join(root, 'apps/platform-web/src/style.css'), `/* <gen:menu-styles> */
${cssImports}
/* </gen:menu-styles> */
`);
  writeFileSync(join(root, 'apps/platform-web/package.json'), wiredAppPkg());
  for (const g of GROUPS) {
    mkdirSync(join(root, 'menus', g.folder, 'src'), { recursive: true });
    writeFileSync(join(root, 'menus', g.folder, 'src/index.ts'), `export const manifests = [{ id: '${g.folder}-x', group: '${g.group}', path: '/${g.folder}' }];\n`);
    writeFileSync(join(root, 'menus', g.folder, 'src/styles.css'), '@source "./";\n');
  }
  // Only analytics and quality ship a mock half; the other folders must not need registration.
  for (const folder of ['analytics', 'quality']) {
    mkdirSync(join(root, 'menus', folder, 'src/mock'), { recursive: true });
    writeFileSync(join(root, 'menus', folder, 'src/mock/index.ts'), `export const ${binding(folder)}Mock = [];\n`);
  }
  return root;
}

describe('wiring invariants against a fixture repo', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeWiredRepo(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('accepts a fully wired eighth group', () => {
    const shape: RepoShape = loadShape(fresh());
    expect(() => checkMarkers(shape)).not.toThrow();
    expect(() => checkGroups(shape)).not.toThrow();
    expect(() => checkWiring(shape)).not.toThrow();
    expect(() => checkNoProbe(shape, false)).not.toThrow();
  });

  it('rejects a missing mock spread for the eighth group in mock-assembly.tsx', () => {
    const root = fresh();
    const mockAssemblyTsx = join(root, 'apps/platform-web/src/dev/mock-assembly.tsx');
    writeFileSync(mockAssemblyTsx, readFileSync(mockAssemblyTsx, 'utf8').replace(`    ...${binding('quality')}Mock,\n`, ''));
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
      .replace(`    ...${binding('quality')}Mock,`, `//     ...${binding('quality')}Mock,`));
    expect(() => checkWiring(loadShape(root))).toThrow(/no import inside the mock-assembly\.tsx mock import markers/);
  });

  it('skips the probe-name check only under GEN_MENU_PROBE', () => {
    const root = fresh();
    const contracts = join(root, 'packages/contracts/src/menu.ts');
    writeFileSync(contracts, readFileSync(contracts, 'utf8').replace(" | 'quality'", " | 'genProbe'"));
    expect(() => checkNoProbe(loadShape(root), false)).toThrow(/genProbe/);
    expect(() => checkNoProbe(loadShape(root), true)).not.toThrow();
  });
});
