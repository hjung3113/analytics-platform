#!/usr/bin/env node
// Checks that the migrations added since the last release tag only add (#2961, ADR-0177). A rollback to the previous
// release runs the previous backend on this release's schema, so this release may not drop, rename, retype or tighten
// what the previous backend reads or writes; the removing step waits for the next release.
// Usage: node migration-additive-check.mjs [--base <ref>]   (default: the latest vX.Y.Z tag reachable from HEAD)
// A file may opt out with a line `-- additive-check: allow <reason>`; the reason is required and printed.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS = 'apps/platform-api/migrations';

/** Statements a previous backend cannot survive, each with what it breaks. */
export const FORBIDDEN = Object.freeze([
  { pattern: /\bdrop\s+table\b/i, what: 'DROP TABLE (the previous backend still reads the table)' },
  {
    pattern: /\bdrop\s+column\b/i,
    what: 'DROP COLUMN (the previous backend still reads the column)',
  },
  { pattern: /\brename\s+(to|column)\b/i, what: 'RENAME (the previous backend uses the old name)' },
  {
    pattern: /\balter\s+column\s+("[^"]+"|\w+)\s+(set\s+data\s+)?type\b/i,
    what: 'ALTER COLUMN … TYPE (the previous backend writes the old type)',
  },
  { pattern: /\bset\s+not\s+null\b/i, what: 'SET NOT NULL (the previous backend may insert NULL)' },
]);

const ALLOW = /^\s*--\s*additive-check:\s*allow\b(.*)$/im;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

/** SQL text without `--` line comments and block comments, so prose that names a statement does not count. */
export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '');
}

/** Failure and note strings for one migration file's text. */
export function checkMigration(path, sql) {
  const allow = sql.match(ALLOW);
  if (allow) {
    const reason = allow[1].trim();
    return reason
      ? { failures: [], notes: [`${path}: allowed — ${reason}`] }
      : { failures: [`${path}: additive-check allow line has no reason`], notes: [] };
  }
  const code = stripComments(sql);
  const failures = [];
  for (const { pattern, what } of FORBIDDEN)
    if (pattern.test(code)) failures.push(`${path}: ${what}`);
  return { failures, notes: [] };
}

export function lastReleaseTag() {
  return git([
    'describe',
    '--tags',
    '--abbrev=0',
    '--match',
    'v[0-9]*.[0-9]*.[0-9]*',
    '--exclude',
    '*-*',
    'HEAD',
  ]);
}

export function changedMigrations(base) {
  const out = git([
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${base}...HEAD`,
    '--',
    `${MIGRATIONS}/*.sql`,
  ]);
  return out ? out.split('\n') : [];
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const args = process.argv.slice(2);
  let base = '';
  if (args.length === 2 && args[0] === '--base' && args[1]) base = args[1];
  else if (args.length !== 0) {
    process.stderr.write('usage: migration-additive-check.mjs [--base <ref>]\n');
    process.exit(2);
  }
  try {
    const root = git(['rev-parse', '--show-toplevel']);
    process.chdir(root);
    base ||= lastReleaseTag();
    const files = changedMigrations(base);
    const failures = [];
    for (const file of files) {
      const result = checkMigration(file, readFileSync(join(root, file), 'utf8'));
      failures.push(...result.failures);
      for (const note of result.notes) process.stdout.write(`migration-additive-check: ${note}\n`);
    }
    if (failures.length > 0) {
      process.stderr.write(
        `migration-additive-check: migrations since ${base} must only add (ADR-0177); move the removing step to the next release or add \`-- additive-check: allow <reason>\`\n${failures.map((f) => `  ${f}`).join('\n')}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(
      `migration-additive-check: ${files.length} migration file(s) since ${base} only add\n`,
    );
  } catch (error) {
    process.stderr.write(
      `migration-additive-check: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
