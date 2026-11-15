// #2211: rewrite the `@/` alias and `@ap/feature-ui` imports of the moved feature-screens package to relative specifiers.
// Usage: node 2211-rewrite-imports.mjs <screens-root> [--dry]   Idempotent: a second run finds nothing to rewrite.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'packages/feature/screens');
const dry = process.argv.includes('--dry');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
const EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.css']);
const srcRoot = path.join(root, 'src');
const uiIndex = path.join(srcRoot, 'ui', 'index');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    // Build and tool output folders are skipped at the package root only (src/operator-screens/coverage is source).
    if (dir === root && SKIP_DIRS.has(name)) continue;
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXT.has(path.extname(name))) yield full;
  }
}

export function relativeSpecifier(fromFile, target) {
  let rel = path.relative(path.dirname(fromFile), target).split(path.sep).join('/');
  if (rel === '') rel = '.';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// A quoted specifier: '@/x', "@/x", `@/x`, or exactly '@ap/feature-ui'. Only whole string literals are rewritten.
const QUOTED = /(['"`])(@\/[^'"`\n]*|@ap\/feature-ui)\1/g;

export function rewrite(file, text) {
  return text.replace(QUOTED, (all, q, spec) => {
    if (spec === '@ap/feature-ui') return `${q}${relativeSpecifier(file, uiIndex)}${q}`;
    return `${q}${relativeSpecifier(file, path.join(srcRoot, spec.slice(2)))}${q}`;
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('2211-rewrite-imports.mjs')) {
  let files = 0;
  let uses = 0;
  for (const file of walk(root)) {
    const before = readFileSync(file, 'utf8');
    if (!before.includes('@/') && !before.includes('@ap/feature-ui')) continue;
    const after = rewrite(file, before);
    if (after === before) continue;
    files += 1;
    uses += (before.match(QUOTED) ?? []).length;
    if (!dry) writeFileSync(file, after);
  }
  console.log(`${dry ? 'would rewrite' : 'rewrote'} ${uses} specifiers in ${files} files under ${path.relative(process.cwd(), root)}`);
}
