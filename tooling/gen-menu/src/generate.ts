import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  depLine, importLine, menuPackage, renderFiles, spreadLine, styleLine,
  PAGE_TYPES, type MenuInputs, type PageType,
} from './templates.ts';

export class GenMenuError extends Error {}

/** camelCase ids only: `master-data` and `MasterData` fail the regex, `HTMLParser` fails the first char. */
export const GROUP_RE = /^[a-z][a-zA-Z0-9]*$/;
const MENU_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PATH_SEGMENT = '([a-z0-9]+(-[a-z0-9]+)*|:[a-z][a-zA-Z0-9]*)';
const PATH_RE = new RegExp(`^/${PATH_SEGMENT}(/${PATH_SEGMENT})*$`);

/** Bindings and identifiers: reject reserved words that would break `import { manifests as <binding> }`. */
const RESERVED_WORDS: Record<string, true> = {
  break: true, case: true, catch: true, class: true, const: true, continue: true, debugger: true,
  default: true, delete: true, do: true, else: true, enum: true, export: true, extends: true,
  false: true, finally: true, for: true, function: true, if: true, import: true, in: true,
  instanceof: true, new: true, null: true, return: true, super: true, switch: true, this: true,
  throw: true, true: true, try: true, typeof: true, var: true, void: true, while: true, with: true,
  yield: true, let: true, static: true, await: true, implements: true, interface: true,
  package: true, private: true, protected: true, public: true,
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

/** Erase `:param` names so `/metrics/:metricId` and `/metrics/:other` count as the same shape. */
export const pathShape = (path: string): string => path.replace(/:[a-zA-Z0-9]+/g, ':');

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

/** Every `menus/<folder>/src/index.ts` that exists; folders without one are skipped. */
function menuIndexes(root: string): { folder: string; text: string }[] {
  const menusDir = join(root, 'menus');
  if (!existsSync(menusDir)) return [];
  return readdirSync(menusDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => existsSync(join(menusDir, e.name, 'src', 'index.ts'))
      ? { folder: e.name, text: readFileSync(join(menusDir, e.name, 'src', 'index.ts'), 'utf8') }
      : null)
    .filter(x => x !== null);
}

/** The nearest `id: '…'` above the match — names the menu that owns a colliding path. */
function owningMenuId(text: string, at: number): string {
  const matches = [...text.slice(0, at).matchAll(/(?<![\w$])id: '([^']*)'/g)];
  return matches.at(-1)?.[1] ?? '?';
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

/** True when the exact line exists, tolerating a CRLF file's trailing carriage returns. */
export function hasLine(text: string, line: string): boolean {
  return splitLines(text).lines.some(l => l === line || l.replace(/\r$/, '') === line);
}

/** Remove one exact line (EOL-tolerant); absent means already gone (rollback after a failed write). */
export function removeLine(text: string, line: string): string {
  const { lines, eol } = splitLines(text);
  const at = lines.findIndex(l => l === line || l.replace(/\r$/, '') === line);
  if (at === -1) return text;
  lines.splice(at, 1);
  return lines.join(eol);
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
  for (const marker of [IMPORT_START, IMPORT_END, GROUPS_END, SPREADS_START, SPREADS_END]) {
    if (!menusText.includes(marker)) throw new GenMenuError(`missing marker '${marker}' in ${MENUS_TS}`);
  }
  for (const marker of [STYLES_START, STYLES_END]) {
    if (!stylesText.includes(marker)) throw new GenMenuError(`missing marker '${marker}' in ${STYLE_CSS}`);
  }

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

  for (const { folder: owner, text } of menuIndexes(root)) {
    if (new RegExp(`(?<![\\w$])group: '${group}'`).test(text)) {
      throw new GenMenuError(`group '${group}' is already owned by menus/${owner} — one package per group`);
    }
  }

  const packageDir = join(root, 'menus', folder);
  if (existsSync(packageDir)) throw new GenMenuError(`menus/${folder} already exists`);

  const shape = pathShape(path);
  for (const { folder: owner, text } of menuIndexes(root)) {
    if (new RegExp(`(?<![\\w$])id: '${menuId}'`).test(text)) {
      throw new GenMenuError(`menu id '${menuId}' is already used by menus/${owner}`);
    }
    for (const m of text.matchAll(/(?<![\w$])path: '([^']*)'/g)) {
      if (pathShape(m[1]) === shape) {
        throw new GenMenuError(`path shape '${shape}' collides with menus/${owner} (menu '${owningMenuId(text, m.index)}')`);
      }
    }
  }

  if (new RegExp(`manifests as ${binding}(?![\\w$])`).test(menusText)) {
    throw new GenMenuError(`binding 'manifests as ${binding}' is already imported in ${MENUS_TS}`);
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
