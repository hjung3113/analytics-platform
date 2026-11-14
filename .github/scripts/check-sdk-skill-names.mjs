#!/usr/bin/env node
// Keeps the hand-written skill .agents/skills/ap-sdk-consumer true to the SDK (#1207, ADR-0131): every `@ap/<entry>#Name` it names
// is a menu-importable public export in the release snapshots or the current public entry, and every relative link and anchor resolves.
// check-doc-links.mjs excludes .agents/skills/, so this script covers that folder. Node builtins only; runs on every PR before install,
// because a PR that only edits .agents/ skips the static steps.
//
// Usage: node .github/scripts/check-sdk-skill-names.mjs [--self-test]
// Exit status: 0 = clean, 1 = at least one problem, 2 = the skill, a snapshot or a current entry cannot be read.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const linkChecker = join(here, 'check-doc-links.mjs');
const SKILL_DIR = '.agents/skills/ap-sdk-consumer';
// What the `menu` lint preset lets a menu import (tooling/eslint/src/index.js MENU_ALLOW, UI_THEME_SUBPATHS): the skill guides menu work.
const MENU_ENTRIES = new Set(['contracts', 'kernel', 'components', 'ui', 'ui/theme']);

class Unreadable extends Error {}

/** `name | kind | definition` lines before `# reachable types` are the exports; the section after it names non-exported types. */
export function exportNames(snapshot) {
  const names = new Set();
  for (const line of snapshot.split(/\r?\n/)) {
    if (line.startsWith('# reachable types')) break;
    const name = line.split(' | ')[0];
    if (line.includes(' | ') && name) names.add(name);
  }
  return names;
}

function snapshotFile(root, entry) {
  const [pkg, sub] = entry.split('/');
  return join(root, 'tooling/sdk/api', `${pkg}.${sub ?? 'root'}.api.txt`);
}

/** Pre-install fallback: inspect only explicit names in the manifest-selected source entry, never follow `export *`. */
function currentExportNames(root, entry) {
  const [pkg, ...subpath] = entry.split('/');
  const packageRoot = join(root, 'packages/sdk', pkg);
  const manifestPath = join(packageRoot, 'package.json');
  if (!existsSync(manifestPath)) return new Set();
  let source;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const key = subpath.length ? `./${subpath.join('/')}` : '.';
    const target = manifest.exports?.[key];
    // Workspace SDK entries are direct source paths. Unsupported conditions fail closed.
    if (typeof target !== 'string' || !target.startsWith('./')) return new Set();
    const sourcePath = resolve(packageRoot, target);
    if (relative(packageRoot, sourcePath).startsWith('..')) return new Set();
    source = readFileSync(sourcePath, 'utf8');
  } catch (error) {
    throw new Unreadable(`cannot read current public entry @ap/${entry}: ${error.message}`);
  }
  // Mask comments and literals before matching declarations so examples cannot invent exports.
  source = source.replace(/\/\/[^\n\r]*|\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g, ' ');
  const names = new Set();
  for (const [, list] of source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of list.split(',')) {
      const match = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(item.trim());
      if (match) names.add(match[2] ?? match[1]);
    }
  }
  for (const [, name] of source.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class|interface|type|enum)\s+([\w$]+)/g)) {
    names.add(name);
  }
  return names;
}

function anchorsOf(root, file) {
  const result = spawnSync(process.execPath, [linkChecker, '--root', root, '--list-anchors', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Unreadable(`cannot list anchors of ${relative(root, file)}: ${result.stderr.trim()}`);
  return new Set(result.stdout.split(/\r?\n/).filter(Boolean));
}

/** Backticked names and Markdown links in code fences are examples, not claims. */
function withoutFences(text) {
  let fenced = false;
  return text.split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return ''; }
    return fenced ? '' : line;
  }).join('\n');
}

export function checkSkill(root) {
  const skillDir = join(root, SKILL_DIR);
  if (!existsSync(join(skillDir, 'SKILL.md')) || !existsSync(join(skillDir, 'intents.md'))) throw new Unreadable(`${SKILL_DIR} needs SKILL.md and intents.md`);
  const problems = [];
  const snapshots = new Map();
  const currentEntries = new Map();
  const anchors = new Map();
  let named = 0;
  for (const fileName of readdirSync(skillDir).filter((name) => name.endsWith('.md')).sort()) {
    const path = join(skillDir, fileName);
    const label = `${SKILL_DIR}/${fileName}`;
    const text = withoutFences(readFileSync(path, 'utf8'));
    // Every backticked `@ap/...#Name`, whatever its path, so a deep path is refused rather than skipped. `<pkg>` marks a placeholder.
    for (const [, entry, name] of text.matchAll(/`@ap\/([^`#\s<]+)#([^`\s]*)`/g)) {
      named += 1;
      if (!MENU_ENTRIES.has(entry)) { problems.push(`${label}: @ap/${entry}#${name} is not an entry a menu may import`); continue; }
      const file = snapshotFile(root, entry);
      if (!snapshots.has(file)) {
        if (!existsSync(file)) throw new Unreadable(`missing snapshot ${relative(root, file)}`);
        snapshots.set(file, exportNames(readFileSync(file, 'utf8')));
      }
      if (!snapshots.get(file).has(name)) {
        if (!currentEntries.has(entry)) currentEntries.set(entry, currentExportNames(root, entry));
        if (!currentEntries.get(entry).has(name)) problems.push(`${label}: @ap/${entry}#${name} is not exported (${relative(root, file)})`);
      }
    }
    // Inline links (a title may follow the target) and reference definitions.
    const targets = [...text.matchAll(/\]\(\s*<?([^)\s>]+)/g), ...text.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)/gm)].map((match) => match[1]);
    for (const target of targets) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [pathPart, anchor] = target.split('#');
      const linked = pathPart ? resolve(skillDir, pathPart) : path;
      if (!existsSync(linked)) { problems.push(`${label}: link target ${target} does not exist`); continue; }
      if (!anchor) continue;
      if (!anchors.has(linked)) anchors.set(linked, anchorsOf(root, linked));
      if (!anchors.get(linked).has(decodeURIComponent(anchor))) problems.push(`${label}: anchor ${target} does not exist`);
    }
  }
  if (named === 0) problems.push(`${SKILL_DIR}: names no public piece, so this check would prove nothing`);
  return problems;
}

function selfTest() {
  const cases = [
    ['a real export and anchor pass', '`@ap/ui#Button` [c](../../../d.md#title)', 0],
    ['a name that is not exported fails', '`@ap/ui#Nope`', 1],
    ['a reachable type is not an export', '`@ap/ui#Hidden`', 1],
    ['an entry menus may not import fails', '`@ap/shell#AppShell`', 1],
    ['a missing link target fails', '`@ap/ui#Button` [c](../../../gone.md)', 1],
    ['a broken anchor fails', '`@ap/ui#Button` [c](../../../d.md#nope)', 1],
    ['a name inside a code fence is not a claim', '`@ap/ui#Button`\n```\n`@ap/ui#Nope`\n```', 0],
    ['a file naming nothing fails', 'no names here', 1],
    ['a deep path beside a valid name fails', '`@ap/ui#Button` `@ap/components/src/Table#Table`', 1],
    ['a placeholder is not a claim', '`@ap/ui#Button` `@ap/<pkg>#Type`', 0],
    ['a titled link to a missing target fails', '`@ap/ui#Button` [c](../../../gone.md "Title")', 1],
    ['a titled link to a real anchor passes', '`@ap/ui#Button` [c](../../../d.md#title "Title")', 0],
    ['a reference definition to a missing target fails', '`@ap/ui#Button` [c][r]\n\n[r]: ../../../gone.md', 1],
    ['a reference definition with a broken anchor fails', '`@ap/ui#Button` [c][r]\n\n[r]: ../../../d.md#nope "Title"', 1],
    ...[
      ['named re-exports', 'export { Table, TableHead } from "./table";', 'Table'],
      ['aliased re-exports', 'export { Internal as Public } from "./table";', 'Public'],
      ['type re-exports', 'export type { Internal as PublicType } from "./table";', 'PublicType'],
      ['inline type re-exports', 'export { type PublicType } from "./table";', 'PublicType'],
      ['local export lists', 'const Local = 1; export { Local };', 'Local'],
      ['function declarations', 'export function Freshfunction() {}', 'Freshfunction'],
      ['const declarations', 'export const Freshconst = 1;', 'Freshconst'],
      ['class declarations', 'export class Freshclass {}', 'Freshclass'],
      ['interface declarations', 'export interface Freshinterface {}', 'Freshinterface'],
      ['type declarations', 'export type Freshtype = 1;', 'Freshtype'],
    ].map(([kind, source, name]) => [`new ${kind} absent from the snapshot pass`, `\`@ap/ui#${name}\``, 0, { source }]),
    ['a subpath resolves its own public entry', '`@ap/ui/theme#ThemeFresh`', 0, { source: 'export const ThemeFresh = 1;', subpath: './theme' }],
    ['a root name does not leak into a subpath', '`@ap/ui/theme#RootOnly`', 1, { source: 'export const RootOnly = 1;', message: '.agents/skills/ap-sdk-consumer/intents.md: @ap/ui/theme#RootOnly is not exported (tooling/sdk/api/ui.theme.api.txt)' }],
    ['an invented name absent from both sources keeps its diagnostic', '`@ap/ui#Invented`', 1, { source: 'export { Table } from "./table";', message: '.agents/skills/ap-sdk-consumer/intents.md: @ap/ui#Invented is not exported (tooling/sdk/api/ui.root.api.txt)' }],
    ['an alias does not export the original name', '`@ap/ui#Internal`', 1, { source: 'export { Internal as Public } from "./table";' }],
    ['comments and strings do not declare exports', '`@ap/ui#Invented`', 1, { source: '// export const Invented = 1;\n/* export { Invented }; */\nconst text = "export class Invented {}";\nconst template = `export interface Invented {}`;' }],
    ['star exports are not followed', '`@ap/ui#StarOnly`', 1, { source: 'export * from "./table";' }],
    ['a named default declaration does not export its local name', '`@ap/ui#Internal`', 1, { source: 'export default class Internal {}' }],
  ];
  let bad = 0;
  for (const [title, body, expected, fixture] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'ap-skill-names-'));
    try {
      mkdirSync(join(root, SKILL_DIR), { recursive: true });
      mkdirSync(join(root, 'tooling/sdk/api'), { recursive: true });
      writeFileSync(join(root, SKILL_DIR, 'SKILL.md'), 'skill\n');
      writeFileSync(join(root, SKILL_DIR, 'intents.md'), `${body}\n`);
      writeFileSync(join(root, 'tooling/sdk/api/ui.root.api.txt'), 'Button | const | const Button: X\n# reachable types\nHidden | type | type Hidden = 1\n');
      writeFileSync(join(root, 'd.md'), '# Title\n');
      if (fixture) {
        mkdirSync(join(root, 'packages/sdk/ui/src'), { recursive: true });
        writeFileSync(join(root, 'packages/sdk/ui/package.json'), JSON.stringify({ exports: { '.': './src/public.ts', './theme': './src/theme.ts' } }));
        writeFileSync(join(root, 'packages/sdk/ui/src/public.ts'), fixture.subpath ? '' : fixture.source);
        writeFileSync(join(root, 'packages/sdk/ui/src/theme.ts'), fixture.subpath ? fixture.source : '');
        writeFileSync(join(root, 'packages/sdk/ui/src/table.ts'), 'export const Table = 1, TableHead = 2, Internal = 3, StarOnly = 4;\nexport type PublicType = string;\n');
        writeFileSync(join(root, 'tooling/sdk/api/ui.theme.api.txt'), '# reachable types\n');
      }
      const problems = checkSkill(root);
      const count = problems.length;
      if (count !== expected) { bad += 1; console.error(`FAIL ${title}: expected ${expected} problem(s), got ${count}`); }
      if (fixture?.message && problems[0] !== fixture.message) { bad += 1; console.error(`FAIL ${title}: diagnostic changed: ${problems[0]}`); }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (bad > 0) { console.error(`check-sdk-skill-names self-test: ${bad} failing`); process.exit(1); }
  console.log(`check-sdk-skill-names self-test passed (${cases.length} cases)`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  try {
    const problems = checkSkill(repoRoot);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log(`check-sdk-skill-names: ${SKILL_DIR} matches the API snapshots or current public entries`);
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    console.error(`check-sdk-skill-names: ${error.message}`);
    process.exit(2);
  }
}
