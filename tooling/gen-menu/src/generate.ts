import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  depLine, importLine, menuPackage, pageImportedIdentifiers, renderFiles, spreadLine, styleLine,
  PAGE_TYPES, type MenuInputs, type PageType,
} from './templates.ts';

export class GenMenuError extends Error {}

/** camelCase ids only: `master-data` and `MasterData` fail the regex, `HTMLParser` fails the first char. */
export const GROUP_RE = /^[a-z][a-zA-Z0-9]*$/;
const MENU_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PATH_SEGMENT = '([a-z0-9]+(-[a-z0-9]+)*|:[a-z][a-zA-Z0-9]*)';
const PATH_RE = new RegExp(`^/${PATH_SEGMENT}(/${PATH_SEGMENT})*$`);

/** Bindings and identifiers: reject reserved words that would break `import { manifests as <binding> }`,
 * plus strict-mode-only bindings (`eval`, `arguments`) (F5). */
const RESERVED_WORDS: Record<string, true> = {
  break: true, case: true, catch: true, class: true, const: true, continue: true, debugger: true,
  default: true, delete: true, do: true, else: true, enum: true, export: true, extends: true,
  false: true, finally: true, for: true, function: true, if: true, import: true, in: true,
  instanceof: true, new: true, null: true, return: true, super: true, switch: true, this: true,
  throw: true, true: true, try: true, typeof: true, var: true, void: true, while: true, with: true,
  yield: true, let: true, static: true, await: true, implements: true, interface: true,
  package: true, private: true, protected: true, public: true, eval: true, arguments: true,
};

export const MENUS_TS = 'apps/platform-web/src/menus.ts';
export const STYLE_CSS = 'apps/platform-web/src/style.css';
export const APP_PKG = 'apps/platform-web/package.json';
const CONTRACTS_MENU = 'packages/contracts/src/menu.ts';

export const IMPORT_START = '// <gen:menu-imports>';
export const IMPORT_END = '// </gen:menu-imports>';
export const GROUPS_END = '// </gen:menu-groups>';
export const SPREADS_START = '// <gen:menu-spreads>';
export const SPREADS_END = '// </gen:menu-spreads>';
export const STYLES_START = '/* <gen:menu-styles> */';
export const STYLES_END = '/* </gen:menu-styles> */';

/** `masterData` → `master-data` (folder, package name tail). */
export const kebab = (camel: string): string => camel.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/** `gen-probe` → `GenProbe` (page component name). */
export const pageName = (menuId: string): string =>
  menuId.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');

/** Route shapes — mirrors packages/kernel/src/registry.ts createRegistry: split on '/', drop empty
 * segments (leading/trailing/double slashes), whole-segment params become ':'. Static-vs-param
 * overlaps are allowed by the kernel, so only identical shapes collide. */
export const pathShape = (path: string): string =>
  `/${path.split('/').filter(Boolean).map(s => (s.startsWith(':') ? ':' : s)).join('/')}`;

/** Walk up from the generator's own directory for `pnpm-workspace.yaml`. */
export function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new GenMenuError('pnpm-workspace.yaml not found — pass --root <dir>');
    dir = parent;
  }
}

export function resolveRoot(explicit?: string): string {
  const root = explicit === undefined
    ? findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)))
    : explicit;
  if (!existsSync(join(root, 'pnpm-workspace.yaml'))) {
    throw new GenMenuError(`'${root}' has no pnpm-workspace.yaml`);
  }
  return root;
}

function readText(root: string, rel: string): string {
  const path = join(root, rel);
  if (!existsSync(path)) throw new GenMenuError(`${rel} not found`);
  return readFileSync(path, 'utf8');
}

/** A plain string literal for the id/group/path properties of one manifest entry (F6). */
export type ManifestEntry = { id: string; group: string; path: string };

/**
 * F6: collect id/group/path string literals from the `manifests` array of one index file with the
 * TS parser — any quote style, any spacing. Entries that are not plain object literals of plain
 * string literals (spreads, computed values, template expressions) are refused, never skipped.
 */
export function manifestEntries(sourceText: string, rel: string): ManifestEntry[] {
  const sf = ts.createSourceFile(rel, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries: ManifestEntry[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!(ts.isIdentifier(d.name) && d.name.text === 'manifests')) continue;
      const init = d.initializer;
      if (init === undefined || !ts.isArrayLiteralExpression(init)) {
        throw new GenMenuError(`unsupported manifest form in ${rel} — manifests must be an array literal`);
      }
      for (const element of init.elements) {
        if (!ts.isObjectLiteralExpression(element)) unsupportedEntry(rel);
        const values: { id?: string; group?: string; path?: string } = {};
        for (const prop of element.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
          if (name === undefined || (name !== 'id' && name !== 'group' && name !== 'path')) continue;
          if (!ts.isStringLiteral(prop.initializer)) unsupportedEntry(rel);
          values[name] = prop.initializer.text;
        }
        if (values.id === undefined || values.group === undefined || values.path === undefined) unsupportedEntry(rel);
        entries.push({ id: values.id, group: values.group, path: values.path });
      }
    }
  }
  return entries;
}

function unsupportedEntry(rel: string): never {
  throw new GenMenuError(`unsupported manifest form in ${rel}`);
}

/** Every `menus/<folder>/src/index.ts` that exists, parsed into manifest literals. */
function menuManifests(root: string): { folder: string; entries: ManifestEntry[] }[] {
  const menusDir = join(root, 'menus');
  if (!existsSync(menusDir)) return [];
  const result: { folder: string; entries: ManifestEntry[] }[] = [];
  for (const e of readdirSync(menusDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const rel = `menus/${e.name}/src/index.ts`;
    const path = join(menusDir, e.name, 'src', 'index.ts');
    if (!existsSync(path)) continue;
    result.push({ folder: e.name, entries: manifestEntries(readFileSync(path, 'utf8'), rel) });
  }
  return result;
}

/** F5: every binding name a top-level declaration in menus.ts introduces (imports included). */
export function appTopLevelBindings(menusText: string): Set<string> {
  const sf = ts.createSourceFile(MENUS_TS, menusText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();
  const add = (name: ts.Identifier | undefined): void => {
    if (name !== undefined) names.add(name.text);
  };
  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, collect);
  };
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (clause === undefined) continue;
      add(clause.name ?? undefined);
      if (clause.namedBindings !== undefined) {
        if (ts.isNamedImports(clause.namedBindings)) for (const el of clause.namedBindings.elements) add(el.name);
        else if (ts.isNamespaceImport(clause.namedBindings)) add(clause.namedBindings.name);
      }
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) collect(d.name);
    }
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      add(stmt.name ?? undefined);
    }
  }
  return names;
}

const bracesIn = (line: string): number => (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);

/** F7: the import marker region may only contain import statements and comments. */
function assertImportsOnly(menusText: string): void {
  const lines = menusText.split('\n');
  const s = lines.findIndex(l => l.trim() === IMPORT_START);
  const e = lines.findIndex(l => l.trim() === IMPORT_END);
  if (s === -1 || e === -1 || e <= s) throw new GenMenuError(`import markers missing or out of order in ${MENUS_TS}`);
  let depth = 0;
  for (let i = s + 1; i < e; i++) {
    const line = (lines[i] as string).trim();
    if (depth > 0) {
      depth += bracesIn(line);
      continue;
    }
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    if (line.startsWith('import')) {
      depth += bracesIn(line);
      continue;
    }
    throw new GenMenuError(`${MENUS_TS} import marker region contains a non-import line: '${line}'`);
  }
  if (depth !== 0) throw new GenMenuError(`${MENUS_TS} import marker region has an unterminated import`);
}

/** F7: the marker comment must sit inside the named top-level array literal. */
function assertMarkerInsideArray(menusText: string, arrayName: string, marker: string): void {
  const sf = ts.createSourceFile(MENUS_TS, menusText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!(ts.isIdentifier(d.name) && d.name.text === arrayName)) continue;
      if (d.initializer === undefined || !ts.isArrayLiteralExpression(d.initializer)) {
        throw new GenMenuError(`'${arrayName}' in ${MENUS_TS} is not an array literal`);
      }
      const at = menusText.indexOf(marker);
      if (d.initializer.getStart(sf) < at && at < d.initializer.getEnd()) return;
      throw new GenMenuError(`marker '${marker}' is not inside the '${arrayName}' array literal in ${MENUS_TS}`);
    }
  }
  throw new GenMenuError(`'${arrayName}' array literal not found in ${MENUS_TS}`);
}

/** F7: every marker appears exactly once, pairs are ordered, and each pair sits in its right context. */
export function checkAppMarkers(menusText: string, styleText: string): void {
  const pairs: [string, string, string][] = [
    [IMPORT_START, IMPORT_END, MENUS_TS],
    [SPREADS_START, SPREADS_END, MENUS_TS],
    [STYLES_START, STYLES_END, STYLE_CSS],
  ];
  for (const [start, end, file] of pairs) {
    const text = file === MENUS_TS ? menusText : styleText;
    for (const marker of [start, end]) {
      const count = countOccurrences(text, marker);
      if (count !== 1) throw new GenMenuError(`missing marker '${marker}' in ${file} (appears ${count} times, expected exactly once)`);
    }
    if (text.indexOf(start) > text.indexOf(end)) {
      throw new GenMenuError(`markers out of order in ${file}: '${start}' must precede '${end}'`);
    }
  }
  const groupsCount = countOccurrences(menusText, GROUPS_END);
  if (groupsCount !== 1) throw new GenMenuError(`missing marker '${GROUPS_END}' in ${MENUS_TS} (appears ${groupsCount} times, expected exactly once)`);
  assertMarkerInsideArray(menusText, 'GROUPS', GROUPS_END);
  assertMarkerInsideArray(menusText, 'MENUS', SPREADS_END);
  assertImportsOnly(menusText);
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function insertAbove(text: string, marker: string, line: string): string {
  const { lines, eol } = splitLines(text);
  const at = lines.findIndex(l => l.trim() === marker);
  if (at === -1) throw new GenMenuError(`missing marker '${marker}'`);
  lines.splice(at, 0, line);
  return lines.join(eol);
}

/** Insert the dependency line lexicographically inside the contiguous menu-* dependency lines. */
function insertDep(text: string, pkgName: string): string {
  const { lines, eol } = splitLines(text);
  const entries = lines
    .map((l, i) => ({ i, dep: parseDepLine(l) }))
    .filter((e): e is { i: number; dep: { indent: string; name: string } } => e.dep !== null);
  const first = entries[0];
  const last = entries.at(-1);
  if (first === undefined || last === undefined) throw new GenMenuError(`no menu dependency block in ${APP_PKG}`);
  if (entries.length !== last.i - first.i + 1) {
    throw new GenMenuError(`menu dependency block in ${APP_PKG} is not contiguous`);
  }
  const newLine = (comma: boolean): string => `${first.dep.indent}"${pkgName}": "workspace:*"${comma ? ',' : ''}`;
  // Before the first entry whose name sorts after the new one; else after the last (F2).
  const before = entries.find(e => e.dep.name > pkgName);
  if (before !== undefined) {
    // Preceding an existing entry, the new line can never be the object's last entry.
    lines.splice(before.i, 0, newLine(true));
    return lines.join(eol);
  }
  const lastText = (lines[last.i] as string).replace(/\r$/, '');
  const nextIsCloser = ((lines[last.i + 1] ?? '') as string).replace(/\r$/, '').trimStart().startsWith('}');
  if (lastText.trimEnd().endsWith(',')) {
    lines.splice(last.i + 1, 0, newLine(!nextIsCloser));
  } else {
    // The comma-less entry ended the object: it takes the comma, the new entry takes none (N1).
    lines[last.i] = `${lastText},`;
    lines.splice(last.i + 1, 0, newLine(false));
  }
  return lines.join(eol);
}

/** The file's line ending (CRLF wins when present), so re-joined edits keep it. */
export function splitLines(text: string): { lines: string[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { lines: text.split(eol), eol };
}

export type OwnedLineState =
  | { kind: 'found'; at: number }
  | { kind: 'missing' }
  | { kind: 'duplicate'; count: number };

/**
 * Where `line` sits strictly inside the marker region: full-line matches, tolerant only of a
 * trailing carriage return — never of indentation (F4).
 */
export function ownedLine(lines: string[], start: string, end: string, line: string): OwnedLineState {
  const s = lines.findIndex(l => l.trim() === start);
  const e = lines.findIndex(l => l.trim() === end);
  if (s === -1 || e === -1 || e <= s) return { kind: 'missing' };
  let count = 0;
  let at = -1;
  for (let i = s + 1; i < e; i++) {
    if ((lines[i] as string).replace(/\r$/, '') === line) {
      count++;
      at = i;
    }
  }
  if (count === 1) return { kind: 'found', at };
  return count === 0 ? { kind: 'missing' } : { kind: 'duplicate', count };
}

/** F9: refuse when `target` — or, for not-yet-created paths, its nearest existing ancestor — resolves outside the real root. */
export function checkInsideRoot(realRoot: string, target: string, label: string): void {
  let dir = target;
  let resolved: string | null = null;
  for (;;) {
    try {
      resolved = realpathSync(dir);
      break;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const boundary = resolved ?? dir;
  const inside = boundary === realRoot || boundary.startsWith(realRoot + sep);
  if (!inside) throw new GenMenuError(`${label} resolves outside the workspace root '${realRoot}' (via '${boundary}')`);
}

/** A menu-* workspace dependency line: indent, package name, optional trailing comma. */
export function parseDepLine(raw: string): { indent: string; name: string } | null {
  const m = /^(\s*)"([^"]*menu-[^"]*)": "workspace:\*"(,)?\s*?$/.exec(raw.replace(/\r$/, ''));
  return m === null ? null : { indent: m[1], name: m[2] };
}

export type FileEdit = { relPath: string; after: string };

export type GeneratePlan = {
  root: string;
  inputs: MenuInputs;
  /** Files relative to `menus/<folder>/`. */
  files: { relPath: string; content: string }[];
  packageDir: string;
  edits: FileEdit[];
};

export type GenerateArgs = {
  root: string;
  group: string;
  menu?: string;
  labelKo?: string;
  labelEn?: string;
  path?: string;
  pageType?: string;
};

/**
 * Validate in the §1 order and build every new file and edit in memory.
 * Throws before any write — `applyGenerate` only runs on a fully built plan.
 */
export function planGenerate(args: GenerateArgs): GeneratePlan {
  const { root } = args;
  const group = args.group;

  if (!GROUP_RE.test(group)) {
    throw new GenMenuError(`invalid group id '${group}' — use camelCase /^[a-z][a-zA-Z0-9]*$/ (rejects 'master-data', 'MasterData', 'HTMLParser')`);
  }
  if (RESERVED_WORDS[group] === true) {
    throw new GenMenuError(`invalid group id '${group}' — reserved word`);
  }
  const folder = kebab(group);
  const binding = group;
  const menuId = args.menu ?? folder;
  if (!MENU_ID_RE.test(menuId)) {
    throw new GenMenuError(`invalid --menu '${menuId}' — use kebab-case /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/ like 'metric-catalog'`);
  }
  const page = pageName(menuId);
  const pageImports = pageImportedIdentifiers();
  if (pageImports.includes(page)) {
    throw new GenMenuError(`invalid --menu '${menuId}' — page component '${page}' collides with the page template imports (${pageImports.join(', ')})`);
  }
  const pageType = args.pageType ?? 'overview';
  if (!(PAGE_TYPES as readonly string[]).includes(pageType)) {
    throw new GenMenuError(`invalid --page-type '${pageType}' — one of ${PAGE_TYPES.join(' | ')}`);
  }

  for (const [flag, value] of [['--label-ko', args.labelKo], ['--label-en', args.labelEn]] as const) {
    if (value === undefined || value === '') throw new GenMenuError(`${flag} is required and must be non-empty`);
    if (/['\\\r\n]/.test(value)) throw new GenMenuError(`${flag} must not contain ' \\ CR LF`);
  }
  const labelKo = args.labelKo as string;
  const labelEn = args.labelEn as string;

  const path = args.path ?? `/${folder}`;
  if (path === '/') throw new GenMenuError(`invalid --path '/' — home owns that route`);
  if (!PATH_RE.test(path)) {
    throw new GenMenuError(`invalid --path '${path}' — segments are [a-z0-9]+(-[a-z0-9]+)* or :[a-z][a-zA-Z0-9]*; no '?', '#', '\\', whitespace, empty segment`);
  }

  if (!existsSync(join(root, 'pnpm-workspace.yaml'))) {
    throw new GenMenuError(`'${root}' has no pnpm-workspace.yaml`);
  }
  // F9: every path this generator reads or writes must resolve inside the real root.
  const realRoot = realpathSync(root);
  checkInsideRoot(realRoot, join(root, 'menus'), 'menus/');
  checkInsideRoot(realRoot, join(root, 'menus', folder), `menus/${folder}`);
  for (const rel of [MENUS_TS, STYLE_CSS, APP_PKG]) checkInsideRoot(realRoot, join(root, rel), rel);

  const inputs: MenuInputs = { group, folder, menuId, page, path, pageType: pageType as PageType, labelKo, labelEn, binding };

  const menusText = readText(root, MENUS_TS);
  const stylesText = readText(root, STYLE_CSS);
  // F7: markers must be unique, ordered, and in the right context before planning.
  checkAppMarkers(menusText, stylesText);

  const groupIdLine = readText(root, CONTRACTS_MENU)
    .split('\n')
    .find(l => l.startsWith('export type GroupId ='));
  if (groupIdLine === undefined) {
    throw new GenMenuError(`GroupId union not found in ${CONTRACTS_MENU}`);
  }
  if (!groupIdLine.includes(`'${group}'`)) {
    throw new GenMenuError(`unknown group '${group}' — it is not in the GroupId union (${CONTRACTS_MENU}); edit GroupId and GROUPS by hand first, the generator does not add sidebar groups`);
  }
  const groupsSection = menusText.slice(0, menusText.indexOf(GROUPS_END));
  if (!new RegExp(`(?<![\\w$])id: '${group}'`).test(groupsSection)) {
    throw new GenMenuError(`unknown group '${group}' — no GROUPS row in ${MENUS_TS}; add { id: '${group}', … } by hand first, the generator does not add sidebar groups`);
  }

  // F6: ownership and id/path collisions are computed from parsed manifest literals, not text regexes.
  const manifests = menuManifests(root);
  for (const { folder: owner, entries } of manifests) {
    if (entries.some(entry => entry.group === group)) {
      throw new GenMenuError(`group '${group}' is already owned by menus/${owner} — one package per group`);
    }
  }

  const packageDir = join(root, 'menus', folder);
  if (existsSync(packageDir)) throw new GenMenuError(`menus/${folder} already exists`);

  const shape = pathShape(path);
  for (const { folder: owner, entries } of manifests) {
    for (const entry of entries) {
      if (entry.id === menuId) {
        throw new GenMenuError(`menu id '${menuId}' is already used by menus/${owner}`);
      }
      if (pathShape(entry.path) === shape) {
        throw new GenMenuError(`path shape '${shape}' collides with menus/${owner} (menu '${entry.id}')`);
      }
    }
  }

  // F5: the binding must not collide with any top-level declaration in the app's menus.ts.
  if (appTopLevelBindings(menusText).has(binding)) {
    throw new GenMenuError(`binding '${binding}' is already imported or declared in ${MENUS_TS}`);
  }

  const appPkgText = readText(root, APP_PKG);
  if (appPkgText.includes(`"${menuPackage(folder)}": "workspace:*"`)) {
    throw new GenMenuError(`${APP_PKG} already depends on ${menuPackage(folder)}`);
  }

  const menusEdit = insertAbove(
    insertAbove(menusText, IMPORT_END, importLine(inputs)),
    SPREADS_END,
    spreadLine(inputs),
  );
  // F7: the proposed menus.ts must parse before anything is written.
  const parsed = ts.transpileModule(menusEdit, { reportDiagnostics: true, fileName: MENUS_TS });
  if (parsed.diagnostics !== undefined && parsed.diagnostics.length > 0) {
    const first = parsed.diagnostics[0];
    throw new GenMenuError(`proposed ${MENUS_TS} does not parse: ${ts.flattenDiagnosticMessageText(first?.messageText, '\n')} — refusing to write`);
  }
  const stylesEdit = insertAbove(stylesText, STYLES_END, styleLine(inputs));
  const pkgEdit = insertDep(appPkgText, menuPackage(folder));

  return {
    root,
    inputs,
    files: renderFiles(inputs),
    packageDir,
    edits: [
      { relPath: MENUS_TS, after: menusEdit },
      { relPath: STYLE_CSS, after: stylesEdit },
      { relPath: APP_PKG, after: pkgEdit },
    ],
  };
}

export function applyGenerate(plan: GeneratePlan): void {
  // F3: capture the original bytes of every app file before the first mutation.
  const snapshots = new Map<string, string>();
  for (const e of plan.edits) snapshots.set(e.relPath, readFileSync(join(plan.root, e.relPath), 'utf8'));

  const completedAppWrites = new Set<string>();
  const failures: string[] = [];
  let originalError: unknown;
  try {
    mkdirSync(plan.packageDir, { recursive: true });
    for (const f of plan.files) {
      const target = join(plan.packageDir, f.relPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content);
    }
    writeFileSync(join(plan.packageDir, '.gen-menu.json'), `${JSON.stringify(plan.inputs, null, 2)}\n`);
    for (const e of plan.edits) {
      writeFileSync(join(plan.root, e.relPath), e.after);
      completedAppWrites.add(e.relPath);
    }
  } catch (err) {
    originalError = err;
  }
  if (originalError === undefined) return;
  // F3: attempt every cleanup independently — one failure must not suppress the rest —
  // and never rewrite an app file whose write did not complete.
  for (const e of plan.edits) {
    if (!completedAppWrites.has(e.relPath)) continue;
    try {
      const path = join(plan.root, e.relPath);
      const snapshot = snapshots.get(e.relPath) ?? '';
      if (readFileSync(path, 'utf8') !== snapshot) writeFileSync(path, snapshot);
    } catch (restoreErr) {
      failures.push(`${e.relPath}: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`);
    }
  }
  try {
    rmSync(plan.packageDir, { recursive: true, force: true });
  } catch (rmErr) {
    failures.push(`menus/${plan.inputs.folder}: ${rmErr instanceof Error ? rmErr.message : String(rmErr)}`);
  }
  const original = originalError instanceof Error ? originalError : new GenMenuError(String(originalError));
  if (failures.length > 0) {
    throw new GenMenuError(`generate failed (${original.message}) and rollback could not restore: ${failures.join('; ')}`);
  }
  throw original;
}

/** The four wiring lines, for stdout. */
export function editSummary(plan: GeneratePlan): string[] {
  return [
    `${MENUS_TS}: ${importLine(plan.inputs)}`,
    `${MENUS_TS}: ${spreadLine(plan.inputs)}`,
    `${STYLE_CSS}: ${styleLine(plan.inputs)}`,
    `${APP_PKG}: ${depLine(plan.inputs)}`,
  ];
}
