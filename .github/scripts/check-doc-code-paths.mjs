#!/usr/bin/env node
// check-doc-code-paths.mjs — dependency-free check that repo paths written in inline code in living Markdown still exist (#2284).
// Root script: part of `pnpm docs:links`. CI runs it with the link checker, before install.
//
// Why: a code PR that moves or deletes a file leaves every document that names it in backticks quietly stale. The link checker only sees
// Markdown links. This check reads every living document on every PR, not only the changed ones, because the stale document is usually one
// the moving PR never touched.
//
// Usage:  node check-doc-code-paths.mjs [--self-test] [--json]
//
// Scope: git-tracked *.md (symlinks skipped) except the frozen or dated records below (ADRs, any `history/`, reviews, research, planning,
//   the intro site, fixtures), local scratch and vendored skill or reference folders (those with a SOURCE.md record).
// A path is an inline code span outside fenced blocks that starts with a repo root (apps/ packages/ menus/ platform/ tooling/ ops/ docs/
//   .agents/ .github/). A `:line`, `:line:col` or `#anchor` suffix is dropped. Spans with whitespace, glob or placeholder characters
//   (* ? { } < > $ [ ]) or an ellipsis (... or …) are not paths and are skipped.
// A path passes when git tracks it (a file, or a directory with tracked files) or when .gitignore ignores it (a generated output such as a
//   report folder; only the repo's .gitignore files count, not a user's global excludes). There is no exception list: a line that names a path that must not exist is written without backticks.
//
// Exit status: 0 = clean, 1 = at least one missing path, 2 = usage / git error.

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isVendored, LOCAL_SCRATCH, scanLines } from './lib/markdown.mjs';

export const ROOTS = ['apps/', 'packages/', 'menus/', 'platform/', 'tooling/', 'ops/', 'docs/', '.agents/', '.github/'];
const EXCLUDED_PREFIXES = [
  'docs/adr/', // decisions are dated records; they cite the code of their day
  '.planning/', // planning snapshots
  'site/', // the intro site is its own product
  LOCAL_SCRATCH,
]; // plus vendored skill and reference folders (lib/markdown.mjs isVendored)
const EXCLUDED_SEGMENTS = ['history', 'reviews', 'research'];
// An ellipsis abbreviates a family of paths (`docs/adr/0095...`), so it is not one path either.
const NOT_A_PATH = /[\s*?{}<>$[\]…]|\.\.\./;

export function excluded(file, vendored = () => false) {
  if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)) || vendored(file)) return true;
  const segments = file.split('/').slice(0, -1);
  if (segments.some((segment) => EXCLUDED_SEGMENTS.includes(segment))) return true;
  return /(^|\/)(__)?fixtures?(__)?\//.test(file);
}

/** Inline code spans of one Markdown text outside fenced blocks, with their line numbers. */
export function codeSpans(text) {
  const spans = [];
  for (const { line, text: content, inFence } of scanLines(text)) {
    if (inFence) continue;
    for (const match of content.matchAll(/(`+)([^`]+?)\1(?!`)/g)) spans.push({ line, code: match[2].trim() });
  }
  return spans;
}

/** The repo path a code span names, or null when it is not a checkable path. */
export function pathOf(code) {
  if (!ROOTS.some((root) => code.startsWith(root)) || NOT_A_PATH.test(code)) return null;
  const bare = code.replace(/#.*$/, '').replace(/:\d+(?:[-:]\d+)*$/, '').replace(/[.,;:)]+$/, '');
  return bare.replace(/\/+$/, '') || null;
}

/** Missing paths in the given documents. `exists(path)` decides; the caller owns git. */
export function findMissing(documents, exists) {
  const missing = [];
  for (const { file, text } of documents) {
    for (const span of codeSpans(text)) {
      const target = pathOf(span.code);
      if (target !== null && !exists(target)) missing.push({ file, line: span.line, path: target });
    }
  }
  return missing;
}

export function git(root, args, input) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, input });
}

export function repoExists(root) {
  const tracked = new Set();
  const directories = new Set();
  for (const file of git(root, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    tracked.add(file);
    for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) directories.add(dir);
  }
  const ignored = new Map();
  const isIgnored = (target) => {
    if (!ignored.has(target)) {
      let result = false;
      // A directory pattern such as `dist/` matches only a path that ends in `/` when the folder is absent, so ask both ways.
      for (const candidate of [target, `${target}/`]) {
        // Only the repo's .gitignore files count: a user's global excludesFile would pass locally what CI fails.
        try { git(root, ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', '--no-index', candidate]); result = true; break; } catch { result = false; }
      }
      ignored.set(target, result);
    }
    return ignored.get(target);
  };
  return (target) => tracked.has(target) || directories.has(target) || isIgnored(target);
}

function selfTest() {
  const assert = (condition, message) => { if (!condition) { console.error(`self-test failed: ${message}`); process.exit(1); } };
  const text = [
    'See `packages/sdk/a.ts` and `packages/sdk/gone.ts:12`, `docs/x.md#part`, `apps/web/`.',
    'Not paths: `packages/*/src`, `apps/<app>/x`, `pnpm --filter apps/web`, `README.md`.',
    '````md',
    '```ts',
    '`packages/in-fence.ts`',
    '````',
    'Generated: `apps/e2e/contract-report/index.html`.',
  ].join('\n');
  const present = new Set(['packages/sdk/a.ts', 'docs/x.md', 'apps/web', 'apps/e2e/contract-report/index.html']);
  const missing = findMissing([{ file: 'docs/guide.md', text }], (target) => present.has(target));
  assert(missing.length === 1, `one missing path, got ${JSON.stringify(missing)}`);
  assert(missing[0].path === 'packages/sdk/gone.ts' && missing[0].line === 1, 'line suffix dropped and the line reported');
  assert(excluded('docs/adr/0001-x.md') && excluded('docs/design/history/old.md') && excluded('docs/reviews/r.md'), 'dated records excluded');
  assert(excluded('packages/x/__fixtures__/a.md') && !excluded('docs/contract/kernel.md'), 'fixtures excluded, living docs kept');
  const record = (folder) => folder === '.agents/skills/vendored';
  assert(excluded('.agents/skills/vendored/SKILL.md', (f) => isVendored(f, '', record)) && !excluded('.agents/skills/ours/SKILL.md', (f) => isVendored(f, '', record)), 'only skill folders with a SOURCE.md record are vendored');
  // The git-backed half on this checkout: tracked files and folders, an absent ignored output folder (a `dir/` pattern), a missing file.
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const exists = repoExists(root);
  assert(exists('docs') && exists('.github/scripts/check-doc-code-paths.mjs'), 'tracked folder and file pass');
  assert(exists('apps/platform-e2e/contract-report'), 'an ignored generated folder passes even when absent');
  assert(!exists('packages/sdk/ui/src/__missing__.ts'), 'a missing path fails');
  assert(pathOf('`x`') === null && pathOf('.github/scripts/x.mjs') === '.github/scripts/x.mjs', 'root prefixes only');
  console.log('check-doc-code-paths self-test passed');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) { selfTest(); return; }
  const json = args.includes('--json');
  const unknown = args.filter((arg) => arg !== '--json');
  if (unknown.length) { console.error(`unknown argument: ${unknown[0]}`); process.exit(2); }
  let root;
  try { root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim(); } catch { console.error('not inside a git repository'); process.exit(2); }
  const files = git(root, ['ls-files', '-z', '--', '*.md']).split('\0').filter(Boolean)
    .filter((file) => !excluded(file, (f) => isVendored(f, root)))
    .filter((file) => { try { return !lstatSync(path.join(root, file)).isSymbolicLink(); } catch { return false; } });
  const documents = files.map((file) => ({ file, text: readFileSync(path.join(root, file), 'utf8') }));
  const missing = findMissing(documents, repoExists(root));
  if (json) console.log(JSON.stringify({ documents: files.length, missing }, null, 2));
  else if (missing.length) {
    for (const item of missing) console.error(`${item.file}:${item.line}: \`${item.path}\` does not exist`);
    console.error(`\n${missing.length} missing code path(s) in ${new Set(missing.map((item) => item.file)).size} document(s). Fix the path, move a finished record to its area's history/, or write a deliberate non-path without backticks.`);
  } else console.log(`check-doc-code-paths passed: ${files.length} document(s)`);
  process.exit(missing.length ? 1 : 0);
}

main();
