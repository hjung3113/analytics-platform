import { groupSpaces } from './menu-layout.ts';
import { packageFolders, parseLocation } from './package-location.ts';
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_PKG, GROUPS_END, IMPORT_END, IMPORT_START, MOCK_ASSEMBLY_TSX, MENUS_TS, MOCK_IMPORTS_END, MOCK_IMPORTS_START,
  MOCK_SPREADS_END, MOCK_SPREADS_START, SPREADS_END, SPREADS_START,
  STYLES_END, STYLES_START, STYLE_CSS, manifestEntries, packageName, parseDepLine, pathShape,
} from './generate.ts';
import { PACKAGE_PREFIX } from './prefix.ts';

const MENUS_MARKERS = [IMPORT_START, IMPORT_END, GROUPS_END, SPREADS_START, SPREADS_END] as const;
const MOCK_ASSEMBLY_MARKERS = [MOCK_IMPORTS_START, MOCK_IMPORTS_END, MOCK_SPREADS_START, MOCK_SPREADS_END] as const;

/** Everything the wiring invariants read from one repo tree. */
export type RepoShape = {
  menusTs: string;
  mockAssemblyTsx: string;
  styleCss: string;
  appPkg: string;
  /** Repo-relative package folders of both roots: `menus/<space>/<folder>` and `platform/<folder>`. */
  folders: string[];
  /** Folders that ship a src/styles.css and therefore need an app-side @import. */
  cssFolders: string[];
  /** Folders that ship a src/mock/index.ts (`./mock` export) and therefore need a mock-assembly.tsx mock registration. */
  mockFolders: string[];
  /** `<folder>/src/index.ts` text by folder. */
  indexes: Record<string, string>;
  /** `<folder>/package.json` name by folder; undefined when absent or unreadable. */
  packageNames: Record<string, string | undefined>;
  /** `<folder>/src/mock/index.ts` text by folder. */
  mockIndexes: Record<string, string>;
};

export function loadShape(root: string): RepoShape {
  const folders = packageFolders(root);
  const indexes: Record<string, string> = {};
  const packageNames: Record<string, string | undefined> = {};
  const mockIndexes: Record<string, string> = {};
  const cssFolders: string[] = [];
  const mockFolders: string[] = [];
  for (const folder of folders) {
    const index = join(root, folder, 'src', 'index.ts');
    if (existsSync(index)) indexes[folder] = readFileSync(index, 'utf8');
    packageNames[folder] = packageName(root, folder);
    if (existsSync(join(root, folder, 'src', 'styles.css'))) cssFolders.push(folder);
    const mockIndex = join(root, folder, 'src', 'mock', 'index.ts');
    if (existsSync(mockIndex)) {
      mockFolders.push(folder);
      mockIndexes[folder] = readFileSync(mockIndex, 'utf8');
    }
  }
  return {
    menusTs: readFileSync(join(root, MENUS_TS), 'utf8'),
    mockAssemblyTsx: readFileSync(join(root, MOCK_ASSEMBLY_TSX), 'utf8'),
    styleCss: readFileSync(join(root, STYLE_CSS), 'utf8'),
    appPkg: readFileSync(join(root, APP_PKG), 'utf8'),
    folders,
    cssFolders,
    mockFolders,
    indexes,
    packageNames,
    mockIndexes,
  };
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function markerIndex(lines: string[], marker: string): number {
  const at = lines.findIndex(l => l.trim() === marker);
  if (at === -1) throw new Error(`missing marker '${marker}'`);
  return at;
}

/** Require explicit entries for every package folder and reject entries that point at nothing, in `menus/` and `platform/`. */
export function checkCodeowners(folders: string[], codeowners: string, systems = [...new Set(folders.filter(f => f.startsWith('menus/')).map(f => f.split('/')[1]))]): void {
  const paths = codeowners.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('#'))
    .map(line => line.split(/\s+/)[0])
    .map(path => /^(menus|platform)\//.test(path) ? `/${path}` : path);
  const existing = new Set(['/platform/', ...systems.map(system => `/menus/${system}/`), ...folders.map(folder => `/${folder}/`)]);
  for (const path of paths) {
    if (/^\/(menus|platform)\//.test(path) && !existing.has(path)) throw new Error(`CODEOWNERS points to nonexistent package folder: ${path}`);
  }
  for (const folder of folders) {
    if (!paths.includes(`/${folder}/`)) throw new Error(`CODEOWNERS missing ${folder}/`);
  }
}

/** Markers exist exactly once and in import → groups → spreads (→ styles) order; the mock-assembly.tsx
 * mock markers exist exactly once and in imports → spreads order. */
export function checkMarkers(shape: RepoShape): void {
  for (const marker of MENUS_MARKERS) {
    if (countOccurrences(shape.menusTs, marker) !== 1) {
      throw new Error(`marker '${marker}' must appear exactly once in ${MENUS_TS}`);
    }
  }
  for (const marker of MOCK_ASSEMBLY_MARKERS) {
    if (countOccurrences(shape.mockAssemblyTsx, marker) !== 1) {
      throw new Error(`marker '${marker}' must appear exactly once in ${MOCK_ASSEMBLY_TSX}`);
    }
  }
  for (const marker of [STYLES_START, STYLES_END]) {
    if (countOccurrences(shape.styleCss, marker) !== 1) {
      throw new Error(`marker '${marker}' must appear exactly once in ${STYLE_CSS}`);
    }
  }
  const menusLines = shape.menusTs.split('\n');
  const order = MENUS_MARKERS.map(m => markerIndex(menusLines, m));
  for (let k = 1; k < order.length; k++) {
    if (order[k] <= order[k - 1]) throw new Error(`markers out of order in ${MENUS_TS}: ${MENUS_MARKERS.join(', ')}`);
  }
  const mainLines = shape.mockAssemblyTsx.split('\n');
  const mockOrder = MOCK_ASSEMBLY_MARKERS.map(m => markerIndex(mainLines, m));
  for (let k = 1; k < mockOrder.length; k++) {
    if (mockOrder[k] <= mockOrder[k - 1]) throw new Error(`markers out of order in ${MOCK_ASSEMBLY_TSX}: ${MOCK_ASSEMBLY_MARKERS.join(', ')}`);
  }
  if (markerIndex(shape.styleCss.split('\n'), STYLES_START) > markerIndex(shape.styleCss.split('\n'), STYLES_END)) {
    throw new Error(`markers out of order in ${STYLE_CSS}`);
  }
}

/**
 * Every group the app declares in GROUPS (the closed list, ADR-0072) is owned by exactly one package index.
 * A `menus/<space>/<folder>` package must sit in the space of the group it owns; a `platform/<folder>` package
 * takes its space only from GROUPS and is never judged by its folder name.
 */
export function checkGroups(shape: RepoShape): void {
  const rows = groupSpaces(shape.menusTs);
  const located = shape.folders.map(folder => {
    try {
      return parseLocation(folder);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  });
  for (const folder of shape.folders) {
    if (!Object.hasOwn(shape.indexes, folder)) throw new Error(`missing manifest owner: ${folder}/src/index.ts`);
  }
  const owners = Object.entries(shape.indexes).map(([folder, text]) => ({
    folder,
    entries: manifestEntries(text, `${folder}/src/index.ts`),
  }));
  for (const owner of owners) {
    const groups = new Set(owner.entries.map(entry => entry.group));
    if (groups.size !== 1) throw new Error(`${owner.folder} must own exactly one group`);
    const where = located.find(l => l.path === owner.folder);
    for (const group of groups) {
      if (!rows.has(group)) throw new Error(`${owner.folder} owns unknown group '${group}'`);
      if (where?.root === 'menus' && where.space !== rows.get(group)) {
        throw new Error(`space mismatch: ${owner.folder} and GROUPS '${group}'`);
      }
    }
  }
  for (const group of rows.keys()) {
    const owned = owners.filter(o => o.entries.some(e => e.group === group));
    if (owned.length !== 1) {
      throw new Error(`group '${group}' must be owned by exactly one package index (menus/*/*/src/index.ts or platform/*/src/index.ts), found ${owned.length === 0 ? 'none' : owned.map(o => o.folder).join(',')}`);
    }
  }
}

/** Package names, menu ids and route shapes are unique across both roots. */
export function checkUniqueness(shape: RepoShape): void {
  const names = new Map<string, string>();
  for (const folder of shape.folders) {
    const name = shape.packageNames[folder];
    if (name === undefined) continue;
    const other = names.get(name);
    if (other !== undefined) throw new Error(`package name '${name}' is used by both ${other} and ${folder}`);
    names.set(name, folder);
  }
  const ids = new Map<string, string>();
  const shapes = new Map<string, string>();
  for (const [folder, text] of Object.entries(shape.indexes)) {
    for (const entry of manifestEntries(text, `${folder}/src/index.ts`)) {
      const sameId = ids.get(entry.id);
      if (sameId !== undefined) throw new Error(`menu id '${entry.id}' is used by both ${sameId} and ${folder}`);
      ids.set(entry.id, folder);
      const key = pathShape(entry.path);
      const sameShape = shapes.get(key);
      if (sameShape !== undefined) throw new Error(`path shape '${key}' is used by both ${sameShape} and ${folder}`);
      shapes.set(key, folder);
    }
  }
}

type ImportSpec = { module: string; imported: string; local: string };

/** Active import specifiers and `...identifier` spreads of one marker region; comments never count. */
function regionImports(lines: string[], start: string, end: string): ImportSpec[] {
  const text = lines.slice(markerIndex(lines, start) + 1, markerIndex(lines, end)).join('\n');
  const sf = ts.createSourceFile('region.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specs: ImportSpec[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) specs.push({ module: stmt.moduleSpecifier.text, imported: (el.propertyName ?? el.name).text, local: el.name.text });
  }
  return specs;
}

function regionSpreads(lines: string[], start: string, end: string): string[] {
  const text = lines.slice(markerIndex(lines, start) + 1, markerIndex(lines, end)).join('\n');
  const sf = ts.createSourceFile('region.ts', `const region = [\n${text}\n];`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names: string[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isSpreadElement(node) && ts.isIdentifier(node.expression)) names.push(node.expression.text);
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return names;
}

const countOf = <T,>(items: T[], pick: (item: T) => boolean): number => items.filter(pick).length;

/** Names a mock index exports (`export const x`, `export { a as b }`). */
function exportedNames(text: string): Set<string> {
  const sf = ts.createSourceFile('mock.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt) && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
    }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause !== undefined && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.add(el.name.text);
    }
  }
  return names;
}

/**
 * Contiguous, lexicographic menu dependency block; every menu dependency wired to a
 * manifests import and spread inside the markers; every shipped styles.css imported in the
 * style markers; every shipped src/mock/index.ts registered in the mock-assembly.tsx mock markers.
 */
export function checkWiring(shape: RepoShape): void {
  const deps = shape.appPkg.split('\n').map(parseDepLine).filter(d => d !== null);
  if (deps.length === 0) throw new Error(`no menu dependency block in ${APP_PKG}`);
  const names = deps.map(d => d.name);
  for (let k = 1; k < names.length; k++) {
    if (names[k] <= names[k - 1]) throw new Error(`menu dependency block in ${APP_PKG} is not lexicographic: '${names[k - 1]}' >= '${names[k]}'`);
  }
  const menusLines = shape.menusTs.split('\n');
  // Bindings are read from the app's own active import and spread, never derived from a folder or package name.
  const manifestImports = regionImports(menusLines, IMPORT_START, IMPORT_END).filter(i => i.imported === 'manifests');
  const spreads = regionSpreads(menusLines, SPREADS_START, SPREADS_END);
  for (const name of names) {
    const imports = manifestImports.filter(i => i.module === name);
    if (imports.length === 0) throw new Error(`dependency '${name}' has no manifests import inside the import markers`);
    if (imports.length > 1) throw new Error(`dependency '${name}' has ${imports.length} manifests imports inside the import markers`);
    const local = (imports[0] as ImportSpec).local;
    const spreadCount = countOf(spreads, n => n === local);
    if (spreadCount === 0) throw new Error(`dependency '${name}' has no spread inside the spread markers (expected '...${local},')`);
    if (spreadCount > 1) throw new Error(`dependency '${name}' is spread ${spreadCount} times inside the spread markers`);
  }
  for (const spread of spreads) {
    if (!manifestImports.some(i => i.local === spread && names.includes(i.module))) {
      throw new Error(`spread '...${spread}' inside the spread markers has no matching manifests import of a menu dependency`);
    }
  }
  for (const folder of shape.folders) {
    const name = shape.packageNames[folder];
    if (Object.hasOwn(shape.indexes, folder) && name !== undefined && !names.includes(name)) {
      throw new Error(`${folder} (${name}) is not an app dependency in ${APP_PKG}`);
    }
  }
  const styleLines = shape.styleCss.split('\n').slice(markerIndex(shape.styleCss.split('\n'), STYLES_START) + 1, markerIndex(shape.styleCss.split('\n'), STYLES_END)).map(l => l.trim());
  for (const folder of shape.cssFolders) {
    const name = shape.packageNames[folder];
    if (name === undefined) throw new Error(`${folder}/package.json has no name`);
    const cssImport = `@import "${name}/styles.css";`;
    if (!styleLines.includes(cssImport)) {
      throw new Error(`${folder}/src/styles.css has no @import inside the style markers`);
    }
    if (countOf(styleLines, l => l === cssImport) > 1) throw new Error(`${folder}/src/styles.css is imported more than once inside the style markers`);
  }
  const mainLines = shape.mockAssemblyTsx.split('\n');
  const mockImports = regionImports(mainLines, MOCK_IMPORTS_START, MOCK_IMPORTS_END);
  const mockSpreads = regionSpreads(mainLines, MOCK_SPREADS_START, MOCK_SPREADS_END);
  for (const folder of shape.mockFolders) {
    const name = shape.packageNames[folder];
    if (name === undefined) throw new Error(`${folder}/package.json has no name`);
    const exported = exportedNames(shape.mockIndexes[folder] ?? '');
    const imports = mockImports.filter(i => i.module === `${name}/mock`);
    if (imports.length === 0) throw new Error(`${folder}/src/mock has no import inside the mock-assembly.tsx mock import markers`);
    if (imports.length > 1) throw new Error(`${folder}/src/mock has ${imports.length} imports inside the mock-assembly.tsx mock import markers`);
    const imp = imports[0] as ImportSpec;
    if (!exported.has(imp.imported)) throw new Error(`${folder}/src/mock does not export '${imp.imported}' imported inside the mock-assembly.tsx mock import markers`);
    const spreadCount = countOf(mockSpreads, n => n === imp.local);
    if (spreadCount === 0) throw new Error(`${folder}/src/mock has no spread inside the mock-assembly.tsx mock spread markers (expected '...${imp.local},')`);
    if (spreadCount > 1) throw new Error(`${folder}/src/mock is spread ${spreadCount} times inside the mock-assembly.tsx mock spread markers`);
  }
  const mockModules = shape.mockFolders.map(f => `${shape.packageNames[f]}/mock`);
  for (const imp of mockImports) {
    if (!mockModules.includes(imp.module)) throw new Error(`mock import '${imp.module}' inside the mock-assembly.tsx mock import markers belongs to no package with a src/mock`);
  }
  for (const spread of mockSpreads) {
    if (!mockImports.some(i => i.local === spread)) {
      throw new Error(`spread '...${spread}' inside the mock-assembly.tsx mock spread markers has no matching mock import`);
    }
  }
}

/** Probe leftovers by name only; skipped while the probe's own menu exists (GEN_MENU_PROBE=1). */
export function checkNoProbe(shape: RepoShape, skip: boolean): void {
  if (skip) return;
  const surfaces = [
    [MENUS_TS, shape.menusTs], [MOCK_ASSEMBLY_TSX, shape.mockAssemblyTsx],
    [STYLE_CSS, shape.styleCss], [APP_PKG, shape.appPkg],
  ] as const;
  for (const name of ['genProbe', 'gen-probe']) {
    for (const [label, text] of surfaces) {
      if (text.includes(name)) throw new Error(`probe leftover '${name}' found in ${label}`);
    }
    if (shape.folders.some(folder => folder.split('/').at(-1) === name)) throw new Error(`probe leftover: ${name} package folder exists`);
  }
}

/** Each menu package records its internal version and expected SDK tag range. */
export function checkMenuVersions(root: string): void {
  for (const folder of packageFolders(root)) {
    const dir = join(root, folder);
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown; ap?: { sdk?: unknown } };
    if (typeof pkg.version !== 'string' || !pkg.version || pkg.version === '0.0.0') throw new Error(`${pkgPath}: invalid version`);
    const sdk = pkg.ap?.sdk;
    const range = typeof sdk === 'string' ? /^>=(\d+)\.(\d+)\.(\d+) <(\d+)\.(\d+)\.0$/.exec(sdk) : null;
    const caret = typeof sdk === 'string' && /^\^\d+\.\d+\.\d+$/.test(sdk);
    if (!caret && !(range && range[1] === range[4] && Number(range[5]) === Number(range[2]) + 1)) {
      throw new Error(`${pkgPath}: invalid ap.sdk range`);
    }
    const changelog = join(dir, 'CHANGELOG.md');
    if (!existsSync(changelog)) throw new Error(`${changelog}: missing CHANGELOG`);
    const heading = /^## (.+)$/m.exec(readFileSync(changelog, 'utf8'))?.[1];
    if (!heading || (heading !== pkg.version && !heading.startsWith(`${pkg.version} — `))) {
      throw new Error(`${changelog}: first CHANGELOG version does not match package.json`);
    }
  }
}
