// Per-issue SDK release notes; Node built-ins only, no build or Git required.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/sdk');
const pending = /^다음 릴리스 \((#\d+(?:, #\d+)*)\)$/;

function cells(line, file) {
  // An escaped Markdown pipe belongs to its cell, including inside inline code.
  const parts = line.trim().split(/(?<!\\)(?:\\\\)*\|/);
  if (parts.length !== 6 || parts[0] !== '' || parts.at(-1) !== '' || parts.slice(1, -1).some(part => !part.trim())) {
    throw new Error(`${file}: expected a four-cell table row`);
  }
  return parts.slice(1, -1).map(part => part.trim());
}

export function checkFragments(root = sdkRoot) {
  const directory = join(root, 'changes');
  if (!existsSync(directory)) return [];
  const rows = [];
  for (const file of readdirSync(directory).sort()) {
    if (file === 'README.md') continue;
    if (!/^[1-9]\d*\.md$/.test(file)) throw new Error(`${file}: expected <issue>.md`);
    const content = readFileSync(join(directory, file), 'utf8').trim();
    if (!content) throw new Error(`${file}: fragment is empty`);
    for (const line of content.split(/\r?\n/).filter(line => line.trim())) {
      const parts = cells(line, file);
      if (parts[0] !== `다음 릴리스 (#${file.slice(0, -3)})`) throw new Error(`${file}: row issue must match filename`);
      rows.push({ line: line.trim(), issue: Number(file.slice(0, -3)), file });
    }
  }
  return rows;
}

export function releaseChangelog(root, version, dryRun = false) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) throw new Error('version must be X.Y.Z (optional prerelease)');
  const fragments = checkFragments(root);
  const path = join(root, 'CHANGELOG.md');
  const before = readFileSync(path, 'utf8');
  const lines = before.split('\n');
  const section = lines.findIndex(line => line.trim() === '## 변경 기록');
  const table = lines.findIndex((line, index) => index > section && /^\| 버전 \|/.test(line));
  if (section < 0 || table < 0 || !/^\|(?:\s*:?-+:?\s*\|){4}$/.test(lines[table + 1] ?? '')) throw new Error('CHANGELOG.md: missing 변경 기록 table');
  let end = table + 2;
  while (lines[end]?.startsWith('|')) end++;
  const rows = [...fragments];
  const retained = [];
  for (const line of lines.slice(table + 2, end)) {
    if (!/^\|\s*다음 릴리스/.test(line)) { retained.push(line); continue; }
    const parts = cells(line, 'CHANGELOG.md');
    const match = pending.exec(parts[0]);
    if (!match) throw new Error('CHANGELOG.md: invalid next-release issue label');
    rows.push({ line, issue: Number(match[1].match(/\d+/)[0]) });
  }
  const label = `\`sdk-v${version}\``;
  const released = [...new Set(rows.sort((a, b) => a.issue - b.issue).map(({ line }) =>
    line.replace(/다음 릴리스 (?=\()/, `[${label}](https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v${version}) `)))];
  const after = [...lines.slice(0, table + 2), ...released, ...retained, ...lines.slice(end)].join('\n');
  if (!dryRun) {
    if (after !== before) writeFileSync(path, after);
    for (const file of new Set(fragments.map(row => row.file))) unlinkSync(join(root, 'changes', file));
  }
  return after;
}

function main(args) {
  if (args.length === 1 && args[0] === '--check') {
    console.log(`sdk:changelog passed: ${checkFragments().length} row(s)`);
  } else if (args.length === 1 && args[0] === '--self-test') {
    assert.deepEqual(cells('| 다음 릴리스 (#1) | kernel | A \\| B | 없음 |', 'fixture'), ['다음 릴리스 (#1)', 'kernel', 'A \\| B', '없음']);
    assert.throws(() => cells('bad', 'fixture'), /fixture/);
    assert.ok(pending.test('다음 릴리스 (#1, #2)'));
    console.log('sdk:changelog self-test passed');
  } else if (args[0] === '--release' && args[1] && (args.length === 2 || (args.length === 3 && args[2] === '--dry-run'))) {
    const output = releaseChangelog(sdkRoot, args[1], args[2] === '--dry-run');
    if (args[2] === '--dry-run') process.stdout.write(output);
    else console.log(`sdk:changelog released sdk-v${args[1]}`);
  } else throw new Error('usage: pnpm sdk:changelog --check | --release X.Y.Z [--dry-run] | --self-test');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`sdk:changelog FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
