// Menu change fragments: `<menu package>/changes/<issue>.md` holds `bump: patch|minor` and `- ` lines. A menu PR adds only that file;
// the release-docs PR folds them (`pnpm menu:changelog --release --date YYYY-MM-DD`): one version bump per menu by the highest bump, one
// CHANGELOG section, fragments deleted. Two PRs on one menu then never pick the same next version (#3113). Node built-ins only.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteFragmentFiles, fragmentFiles } from './fragments.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Menu packages are `menus/<system>/<group>` and `platform/<feature>` (menus/AGENTS.md: the package rules apply under both roots).
// Only `<package>/changes/` holds fragments. A `changes/` at a root or system level is a misplaced fragment folder; deeper folders
// (`src/**/changes`) are code and are not read. Directory entries are not followed through symbolic links.
const subdirs = (dir) => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules').map((e) => e.name).sort()
  : [];

function menusWithChanges(root) {
  const misplaced = (rel) => new Error(`${rel}: changes/ is not a menu package (menus/<system>/<group>/changes or platform/<feature>/changes)`);
  const packages = [];
  for (const system of subdirs(join(root, 'menus'))) {
    if (system === 'changes') throw misplaced('menus/changes');
    for (const group of subdirs(join(root, 'menus', system))) {
      if (group === 'changes') throw misplaced(`menus/${system}/changes`);
      packages.push(`menus/${system}/${group}`);
    }
  }
  for (const feature of subdirs(join(root, 'platform'))) {
    if (feature === 'changes') throw misplaced('platform/changes');
    packages.push(`platform/${feature}`);
  }
  const menus = [];
  for (const rel of packages) {
    const dir = join(root, rel);
    const changes = join(dir, 'changes');
    if (!existsSync(changes)) continue;
    if (!lstatSync(changes).isDirectory() || !existsSync(join(dir, 'package.json'))) throw misplaced(`${rel}/changes`);
    menus.push({ dir, changes, rel });
  }
  return menus.sort((a, b) => a.rel.localeCompare(b.rel));
}

function parseMenu(content, where) {
  const lines = content.split(/\r?\n/);
  const head = lines[0].trim();
  if (!head.startsWith('bump:')) throw new Error(`${where}: missing bump`);
  if (!/^bump: (patch|minor)$/.test(head)) throw new Error(`${where}: unknown bump`);
  const bullets = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    if (!line.startsWith('- ')) throw new Error(`${where}: expected a '- ' bullet`);
    const text = line.slice(2).trim();
    if (!text) throw new Error(`${where}: no bullet`);
    if (/^\(#\d+\)/.test(text)) throw new Error(`${where}: bullet must not start with (#n)`);
    bullets.push(text);
  }
  if (bullets.length === 0) throw new Error(`${where}: no bullet`);
  return { bump: head.slice('bump: '.length), bullets };
}

function assertReleaseDate(date) {
  const match = RELEASE_DATE.exec(date);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (!match || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error('date must be YYYY-MM-DD');
}

function nextVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`version must be X.Y.Z (got ${version})`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function rewriteVersion(text, bump) {
  const matches = text.match(/"version":\s*"[^"]*"/g);
  if (!matches || matches.length !== 1) throw new Error('package.json: expected one "version"');
  const current = /"version":\s*"([^"]*)"/.exec(matches[0])[1];
  const bumped = nextVersion(current, bump);
  return { from: current, to: bumped, text: text.replace(matches[0], matches[0].replace(/"[^"]*"$/, `"${bumped}"`)) };
}

function insertSection(text, version, date, bullets) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.startsWith('## '));
  if (at < 0) throw new Error('CHANGELOG.md: missing a version heading');
  const block = [`## ${version} — ${date}`, '', ...bullets, ''];
  return [...lines.slice(0, at), ...block, ...lines.slice(at)].join('\n');
}

function parsedMenus(root) {
  const parsed = [];
  for (const menu of menusWithChanges(root)) {
    const where = (file) => `${menu.rel}/changes/${file}`;
    const files = fragmentFiles(menu.changes, { label: where }).map((file) => ({ ...file, ...parseMenu(file.content, where(file.file)) }));
    if (files.length > 0) parsed.push({ ...menu, files });
  }
  return parsed;
}

export function checkMenuFragments(root) {
  return parsedMenus(root).flatMap((menu) => menu.files.map((file) => ({ ...file, menu: menu.rel })));
}

function menuPlans(root) {
  return parsedMenus(root).map((menu) => {
    const bump = menu.files.some((file) => file.bump === 'minor') ? 'minor' : 'patch';
    const version = rewriteVersion(readFileSync(join(menu.dir, 'package.json'), 'utf8'), bump);
    const bullets = menu.files.flatMap((file) => file.bullets.map((text) => ({ issue: file.issue, text })))
      .sort((a, b) => a.issue - b.issue).map(({ issue, text }) => `- (#${issue}) ${text}`);
    const logPath = join(menu.dir, 'CHANGELOG.md');
    if (!existsSync(logPath)) throw new Error(`${menu.rel}/CHANGELOG.md: missing CHANGELOG`);
    return { menu, files: menu.files, from: version.from, to: version.to, bullets, pkg: version.text, changelog: readFileSync(logPath, 'utf8') };
  });
}

export function releaseMenuChangelogs(root, date, { dryRun = false } = {}) {
  assertReleaseDate(date);
  const plans = menuPlans(root).map((plan) => ({ ...plan, log: insertSection(plan.changelog, plan.to, date, plan.bullets) }));
  if (!dryRun) {
    for (const plan of plans) {
      writeFileSync(join(plan.menu.dir, 'package.json'), plan.pkg);
      writeFileSync(join(plan.menu.dir, 'CHANGELOG.md'), plan.log);
      deleteFragmentFiles(plan.menu.changes, plan.files.map((file) => file.file));
    }
  }
  return plans.map((plan) => ({ rel: plan.menu.rel, from: plan.from, to: plan.to, bullets: plan.bullets }));
}

export function formatMenuRelease(plans, date) {
  if (plans.length === 0) return 'menu:changelog: no fragments\n';
  const blocks = plans.map((plan) => `# ${plan.rel} ${plan.from} → ${plan.to}\n## ${plan.to} — ${date}\n\n${plan.bullets.join('\n')}\n`);
  return `${blocks.join('\n')}\n`;
}

export function mainMenus(args, root = repoRoot) {
  if (args.length === 1 && args[0] === '--check') {
    console.log(`menu:changelog passed: ${checkMenuFragments(root).length} fragment(s)`);
    return;
  }
  const dryRun = args.at(-1) === '--dry-run';
  const body = dryRun ? args.slice(0, -1) : args;
  if (body[0] === '--release' && body[1] === '--date' && body[2] && body.length === 3) {
    const plans = releaseMenuChangelogs(root, body[2], { dryRun });
    if (dryRun) process.stdout.write(formatMenuRelease(plans, body[2]));
    else console.log(`menu:changelog released ${plans.length} menu(s)`);
    return;
  }
  throw new Error('usage: pnpm menu:changelog --check | --release --date YYYY-MM-DD [--dry-run]');
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { mainMenus(process.argv.slice(2)); } catch (error) {
    console.error(`menu:changelog FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
