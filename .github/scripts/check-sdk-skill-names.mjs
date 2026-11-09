#!/usr/bin/env node
// Keeps the hand-written skill .agents/skills/ap-sdk-consumer true to the SDK (#1207, ADR-0131): every `@ap/<entry>#Name` it names
// is a menu-importable public export in the committed tooling/sdk/api/*.api.txt snapshots, and every relative link and anchor resolves.
// check-doc-links.mjs excludes .agents/skills/, so this script covers that folder. Node builtins only; runs on every PR before install,
// because a PR that only edits .agents/ skips the static steps.
//
// Usage: node .github/scripts/check-sdk-skill-names.mjs [--self-test]
// Exit status: 0 = clean, 1 = at least one problem, 2 = the skill or a snapshot cannot be read.
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
      if (!snapshots.get(file).has(name)) problems.push(`${label}: @ap/${entry}#${name} is not exported (${relative(root, file)})`);
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
  ];
  let bad = 0;
  for (const [title, body, expected] of cases) {
    const root = mkdtempSync(join(tmpdir(), 'ap-skill-names-'));
    try {
      mkdirSync(join(root, SKILL_DIR), { recursive: true });
      mkdirSync(join(root, 'tooling/sdk/api'), { recursive: true });
      writeFileSync(join(root, SKILL_DIR, 'SKILL.md'), 'skill\n');
      writeFileSync(join(root, SKILL_DIR, 'intents.md'), `${body}\n`);
      writeFileSync(join(root, 'tooling/sdk/api/ui.root.api.txt'), 'Button | const | const Button: X\n# reachable types\nHidden | type | type Hidden = 1\n');
      writeFileSync(join(root, 'd.md'), '# Title\n');
      const count = checkSkill(root).length;
      if (count !== expected) { bad += 1; console.error(`FAIL ${title}: expected ${expected} problem(s), got ${count}`); }
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
    console.log(`check-sdk-skill-names: ${SKILL_DIR} matches the API snapshots`);
  } catch (error) {
    if (!(error instanceof Unreadable)) throw error;
    console.error(`check-sdk-skill-names: ${error.message}`);
    process.exit(2);
  }
}
