import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// #1668: `test` and `typecheck` of this package read files outside it. Turbo hashes only the package
// directory by default, so a PR that touches only such a file would reuse a cached pass. This test scans the
// package sources for paths that leave the package and asserts every one is matched by an `inputs` glob in
// `apps/platform-api/turbo.json` (the package definition replaces the root `@ap/platform-api#test|typecheck`
// entries; checked with `turbo run ... --dry=json`).
//
// What it can SEE (static text only): relative import / `vi.mock` / `import()` specifiers, any string literal that
// starts with `../`, `new URL('<literal>', import.meta.url)`, `path.join|resolve(<__dirname | dirname(fileURLToPath(
// import.meta.url)) | a const holding one of those>, '<literal>', ...)` (the leading literal arguments), and
// `${CONST}literal` template paths.
// What it CANNOT see: computed paths (a variable that is not one of the forms above, a literal built by string
// concatenation, `process.cwd()`-relative paths, a file a spawned script reads, paths in config files). Workspace
// package imports (`@ap/*`) are out of scope: the turbo dependency graph already hashes them.

const PKG = path.resolve(__dirname, '../..');
const REPO = path.resolve(PKG, '../..');
const SELF = path.join(PKG, 'src/__tests__/turbo-inputs.test.ts');

function listSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listSources(full, out);
    else if (/\.(ts|mts|mjs)$/.test(name) && full !== SELF) out.push(full);
  }
  return out;
}

/** Index of the `)` closing the `(` at `open`, ignoring parens inside quotes. */
function closeParen(src: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i] as string;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

function splitArgs(s: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quote) {
      cur += c;
      if (c === '\\') cur += s[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

/** A plain string literal's text (a template is cut at its first `${`); null for anything else. */
function literal(arg: string): string | null {
  const m = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1$/.exec(arg);
  if (!m) return null;
  const text = m[2] as string;
  return m[1] === '`' ? text.split('${')[0] ?? '' : text;
}

function evalDir(expr: string, fileDir: string, vars: Map<string, string>): string | null {
  const e = expr.trim();
  if (e === '__dirname' || e === 'dirname(fileURLToPath(import.meta.url))') return fileDir;
  if (vars.has(e)) return vars.get(e) as string;
  const url = /^fileURLToPath\(\s*new URL\(\s*(['"`])([^'"`$]*)\1\s*,\s*import\.meta\.url\s*\)\s*\)$/.exec(e);
  if (url) return path.resolve(fileDir, url[2] as string);
  const call = /^(?:path\.)?(join|resolve)\(/.exec(e);
  if (call && e.endsWith(')')) {
    const args = splitArgs(e.slice(call[0].length, -1));
    const base = evalDir(args[0] ?? '', fileDir, vars);
    if (base === null) return null;
    const lits: string[] = [];
    for (const a of args.slice(1)) {
      const l = literal(a);
      if (l === null) break;
      lits.push(l);
    }
    return path.resolve(base, ...lits);
  }
  return null;
}

export function outsidePaths(file: string, src: string): string[] {
  const fileDir = path.dirname(file);
  const found = new Set<string>();
  const add = (abs: string) => {
    // a path that is the repo root or above is only the base of a later join, never a file read by itself
    const isBase = PKG === abs || PKG.startsWith(abs + path.sep);
    if (!isBase && !abs.startsWith(PKG + path.sep)) found.add(abs);
  };

  // any string literal starting with `../` (imports, vi.mock, new URL(..., import.meta.url), data tables)
  for (const m of src.matchAll(/(['"`])((?:\.\.\/)+[^'"`$]*)/g)) add(path.resolve(fileDir, m[2] as string));

  // consts that hold a directory, in source order so a later const may build on an earlier one
  const vars = new Map<string, string>();
  for (const m of src.matchAll(/^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(.+?);?\s*$/gm)) {
    const dir = evalDir(m[2] as string, fileDir, vars);
    if (dir !== null) vars.set(m[1] as string, dir);
  }

  // path.join|resolve(<base>, 'lit', ...)
  for (const m of src.matchAll(/(?:\bpath\.)?\b(?:join|resolve)\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = closeParen(src, open);
    if (close < 0) continue;
    const args = splitArgs(src.slice(open + 1, close));
    const base = evalDir(args[0] ?? '', fileDir, vars);
    if (base === null) continue;
    const lits: string[] = [];
    for (const a of args.slice(1)) {
      const l = literal(a);
      if (l === null) break;
      lits.push(l);
    }
    if (lits.length > 0) add(path.resolve(base, ...lits));
  }

  // `${CONST}relative/path` templates
  for (const m of src.matchAll(/\$\{(\w+)\}([^`'"$]+)/g)) {
    const base = vars.get(m[1] as string);
    if (base !== undefined) add(path.resolve(base, m[2] as string));
  }
  return [...found];
}

function globToRegExp(glob: string): RegExp {
  const bare = glob.replace(/\/\*\*$/, '');
  const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = bare
    .split('**/')
    .map((part) => part.split('*').map(esc).join('[^/]*'))
    .join('(?:.*/)?');
  // `dir/**` matches the directory itself and everything below it
  return new RegExp(glob.endsWith('/**') ? `^${body}(?:/.*)?$` : `^${body}$`);
}

function inputGlobs(task: 'test' | 'typecheck'): string[] {
  const config = JSON.parse(readFileSync(path.join(PKG, 'turbo.json'), 'utf8')) as {
    tasks: Record<string, { inputs?: string[] }>;
  };
  const prefix = '$TURBO_ROOT$/';
  return (config.tasks[task]?.inputs ?? []).filter((i) => i.startsWith(prefix)).map((i) => i.slice(prefix.length));
}

function uncovered(paths: string[], globs: string[]): string[] {
  const res = globs.map(globToRegExp);
  return paths.filter((abs) => {
    const rel = path.relative(REPO, abs).split(path.sep).join('/');
    const candidates = [rel, rel.replace(/\.js$/, '.ts')];
    return !res.some((re) => candidates.some((c) => re.test(c)));
  });
}

describe('turbo inputs cover every file the package reads from outside itself', () => {
  const outside = new Set<string>();
  for (const file of listSources(path.join(PKG, 'src'))) {
    for (const abs of outsidePaths(file, readFileSync(file, 'utf8'))) outside.add(abs);
  }

  it('the scanner finds the known out-of-package reads', () => {
    const rel = [...outside].map((p) => path.relative(REPO, p).split(path.sep).join('/'));
    expect(rel).toEqual(
      expect.arrayContaining([
        'menus/log-dev/log-analysis/src/endpoints.js',
        'menus/log-dev/log-knowledge/src/endpoints.js',
        'tooling/scripts/validation-worker-mock.mjs',
        'docs/architecture/platform-api/api/log-knowledge.md',
        'apps/feature-screens/src',
        'ops/platform-api/.env.example',
      ]),
    );
  });

  it.each(['test', 'typecheck'] as const)('%s inputs match every out-of-package path', (task) => {
    const missing = uncovered([...outside], inputGlobs(task)).map((p) => path.relative(REPO, p));
    expect(missing.sort()).toEqual([]);
  });

  it.each(['test', 'typecheck'] as const)('%s inputs include the tsconfig base this package extends', (task) => {
    const tsconfig = JSON.parse(readFileSync(path.join(PKG, 'tsconfig.json'), 'utf8')) as { extends: string };
    const base = path.resolve(PKG, tsconfig.extends);
    expect(uncovered([base], inputGlobs(task)).map((p) => path.relative(REPO, p))).toEqual([]);
  });
});
