// The Dockview engine is a lazy chunk (ADR-0067 decision 2, review D11): nothing the app loads at start may contain it.
// Reads a built app (`vite build --mode mock` emits index.html + assets/*.js and no manifest): the entry scripts named in
// index.html, then every chunk they import statically (`import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`).
// Dynamic `import("./x.js")` is the lazy edge and is not followed. Fails if a chunk in that closure mentions `dockview`, and also if no chunk
// at all does (then the engine is not where this check looks and it would pass for nothing).
//
//   node tooling/scripts/check-dock-chunk.mjs [distDir]     (default apps/platform-web/dist)
//   node tooling/scripts/check-dock-chunk.mjs --self-test
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = 'dockview';

/** `src` of every `<script … src>` in the page (the entry; modulepreload links are the same files the entry imports). */
function entryScripts(html) {
  return [...html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
}

/** Specifiers of static imports and re-exports in a built chunk (minified or not); `import(…)` is dynamic and skipped. */
function staticImports(code) {
  const found = new Set();
  const patterns = [
    /\bimport\s*["']([^"']+)["']/g,
    /\b(?:import|export)\s*(?:[\w$*{}\s,]|\bas\b)*?\bfrom\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.add(match[1]);
  return [...found];
}

const isExternal = (specifier) => /^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('//');

/** The file a specifier names, inside `root`; null for anything outside the build or not there. */
function locate(root, from, specifier) {
  if (isExternal(specifier)) return null;
  const clean = specifier.split(/[?#]/)[0];
  const candidates = clean.startsWith('/')
    ? [join(root, clean), join(root, clean.replace(/^\/[^/]+\//, ''))] // the base path (`/` or `/sub/`) is not a folder of the build
    : [resolve(dirname(from), clean)];
  for (const candidate of candidates) {
    const path = normalize(candidate);
    const inside = relative(root, path);
    if (!inside.startsWith('..') && !inside.startsWith(sep) && existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

/** @returns {{ ok: boolean, message: string }} */
export function checkDockChunk(dist) {
  const root = resolve(dist);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) return { ok: false, message: `no build at ${dist} (index.html missing) — run pnpm build first` };
  const closure = new Map();
  const queue = entryScripts(readFileSync(indexPath, 'utf8')).map((src) => locate(root, indexPath, src)).filter(Boolean);
  while (queue.length > 0) {
    const file = queue.shift();
    if (closure.has(file)) continue;
    const code = readFileSync(file, 'utf8');
    closure.set(file, code);
    if (!/\.m?js$/.test(file)) continue;
    for (const specifier of staticImports(code)) {
      const next = locate(root, file, specifier);
      if (next && !closure.has(next)) queue.push(next);
    }
  }
  if (closure.size === 0) return { ok: false, message: `index.html in ${dist} names no script that exists in the build` };
  const leaked = [...closure].filter(([, code]) => code.includes(ENGINE)).map(([file]) => relative(root, file));
  if (leaked.length > 0) return { ok: false, message: `the layout engine is in the start-up chunks (it must stay a lazy chunk): ${leaked.join(', ')}` };
  const anywhere = walk(root).some((file) => /\.m?js$/.test(file) && readFileSync(file, 'utf8').includes(ENGINE));
  if (!anywhere) return { ok: false, message: `no chunk in ${dist} contains "${ENGINE}" — the engine is missing from the build, so this check proves nothing` };
  return { ok: true, message: `ok: ${closure.size} start-up file(s) checked, none contains "${ENGINE}"` };
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)]));
}

function selfTest() {
  const failures = [];
  const expect = (name, actual, wanted) => { if (actual.ok !== wanted) failures.push(`${name}: expected ok=${wanted}, got ${JSON.stringify(actual)}`); };
  const build = (files) => {
    const dir = mkdtempSync(join(tmpdir(), 'dock-chunk-'));
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    return dir;
  };
  const page = (...scripts) => `<!doctype html><html><head>${scripts.map((src) => `<script type="module" crossorigin src="${src}"></script>`).join('')}</head><body></body></html>`;
  const engine = 'const dv="dockview-react";export{dv as e};';
  const cases = [
    ['lazy engine behind a dynamic import', true, {
      'index.html': page('/assets/index-a.js'),
      'assets/index-a.js': 'import{r as t}from"./react-b.js";const L=()=>import("./DockEngine-c.js");t();',
      'assets/react-b.js': 'export const r=()=>1;',
      'assets/DockEngine-c.js': engine,
    }],
    ['engine imported statically by the entry', false, {
      'index.html': page('/assets/index-a.js'),
      'assets/index-a.js': 'import{e}from"./DockEngine-c.js";e;',
      'assets/DockEngine-c.js': engine,
    }],
    ['engine two static hops away (side-effect import and re-export)', false, {
      'index.html': page('/assets/index-a.js'),
      'assets/index-a.js': 'import"./mid-b.js";',
      'assets/mid-b.js': 'export*from"./DockEngine-c.js";',
      'assets/DockEngine-c.js': engine,
    }],
    ['engine inlined into the entry', false, { 'index.html': page('/assets/index-a.js'), 'assets/index-a.js': 'const x="dockview-core";' }],
    ['a base path before the asset folder', true, {
      'index.html': page('/sub/assets/index-a.js'),
      'assets/index-a.js': 'const L=()=>import("./DockEngine-c.js");',
      'assets/DockEngine-c.js': engine,
    }],
    ['no engine chunk anywhere (the check would prove nothing)', false, { 'index.html': page('/assets/index-a.js'), 'assets/index-a.js': 'export const a=1;' }],
    ['no index.html', false, { 'assets/index-a.js': 'export const a=1;' }],
    ['entry script missing from the build', false, { 'index.html': page('/assets/gone.js') }],
  ];
  for (const [name, wanted, files] of cases) {
    const dir = build(files);
    try { expect(name, checkDockChunk(dir), wanted); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (failures.length > 0) { console.error(failures.join('\n')); return 1; }
  console.log(`check-dock-chunk self-test: ${cases.length} cases ok`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) process.exit(selfTest());
  const dist = args[0] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'platform-web', 'dist');
  const result = checkDockChunk(dist);
  (result.ok ? console.log : console.error)(`check:dock-chunk ${result.message}`);
  process.exit(result.ok ? 0 : 1);
}
