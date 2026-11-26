import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkMenuFragments, releaseMenuChangelogs } from './menus.mjs';

const PKG = '{\n  "name": "@ap/menu-hw-time",\n  "version": "0.11.34",\n  "ap": { "sdk": ">=0.49.0 <0.50.0" }\n}\n';
const LOG = '# @ap/menu-hw-time 변경 기록\n\n내부 버전.\n\n## 0.11.34 — 2026-11-26\n\n- (#1) 기존\n';
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };

function withRepo(run) {
  const root = mkdtempSync(join(tmpdir(), 'ap-menu-changelog-'));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function writeMenu(root, { group = 'mars', name = 'hw-time', version = '0.11.34' } = {}) {
  const dir = join(root, 'menus', group, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), PKG.replaceAll('0.11.34', version).replaceAll('hw-time', name));
  writeFileSync(join(dir, 'CHANGELOG.md'), LOG.replaceAll('0.11.34', version));
  return dir;
}
const fragment = (bump, ...lines) => `bump: ${bump}\n${lines.map((line) => `- ${line}`).join('\n')}\n`;

test('invalid menu fragments name the file', () => withRepo((root) => {
  const dir = writeMenu(root);
  mkdirSync(join(dir, 'changes'));
  for (const [file, text, pattern] of [
    ['10.md', '', /empty/],
    ['10.md', '- 설명\n', /missing bump/],
    ['10.md', 'bump: major\n- 설명\n', /unknown bump/],
    ['10.md', 'bump: patch\n', /no bullet/],
    ['10.md', 'bump: patch\n- (#10) 설명\n', /\(#n\)/],
    ['10.md', 'bump: patch\nnote\n', /bullet/],
    ['notes.md', 'bump: patch\n- 설명\n', /expected <issue>\.md/],
    ['0.md', 'bump: patch\n- 설명\n', /expected <issue>\.md/],
  ]) {
    writeFileSync(join(dir, 'changes', file), text);
    assert.throws(() => checkMenuFragments(root), pattern, file);
    rmSync(join(dir, 'changes', file));
  }
}));

test('a changes directory outside a menu package is an error', () => withRepo((root) => {
  for (const rel of ['menus/changes', 'menus/mars/changes', 'menus/mars/hw-time/src/changes', 'menus/mars/hw-time/changes']) {
    mkdirSync(join(root, rel), { recursive: true });
    assert.throws(() => checkMenuFragments(root), /menu package/, rel);
    rmSync(join(root, rel), { recursive: true });
  }
  mkdirSync(join(root, 'packages/sdk/changes'), { recursive: true });
  writeFileSync(join(root, 'packages/sdk/changes/1.md'), 'not a menu fragment');
  assert.deepEqual(checkMenuFragments(root), []);
}));

test('release applies the highest bump once and prepends issue lines in order', () => withRepo((root) => {
  const dir = writeMenu(root);
  const other = writeMenu(root, { group: 'bravo', name: 'metrics', version: '0.3.9' });
  mkdirSync(join(dir, 'changes'));
  mkdirSync(join(other, 'changes'));
  writeFileSync(join(dir, 'changes/10.md'), fragment('patch', '나중', '같은 이슈'));
  writeFileSync(join(dir, 'changes/2.md'), fragment('minor', '먼저'));
  writeFileSync(join(other, 'changes/4.md'), fragment('patch', '설명'));
  const before = readFileSync(join(dir, 'package.json'), 'utf8');
  assert.equal(checkMenuFragments(root).length, 3);
  assert.throws(() => releaseMenuChangelogs(root, '2026-13-01'), /date/);
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before);
  releaseMenuChangelogs(root, '2026-11-27', { dryRun: true });
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before);
  assert.equal(releaseMenuChangelogs(root, '2026-11-27').length, 2);
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), before.replace('"version": "0.11.34"', '"version": "0.12.0"'));
  const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(log.includes('## 0.12.0 — 2026-11-27\n\n- (#2) 먼저\n- (#10) 나중\n- (#10) 같은 이슈\n\n## 0.11.34 — 2026-11-26'), log);
  assert.ok((/^## (.+)$/m.exec(log)?.[1] ?? '').startsWith('0.12.0 — '));
  assert.match(readFileSync(join(other, 'package.json'), 'utf8'), /"version": "0\.3\.10"/);
  assert.equal(readdirSync(join(dir, 'changes')).length, 0);
  assert.equal(releaseMenuChangelogs(root, '2026-11-27').length, 0);
}));

test('two branches merge in either order, then one release bump carries both lines', () => {
  for (const order of [[1, 2], [2, 1]]) {
    withRepo((root) => {
      const dir = writeMenu(root);
      const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, env: gitEnv });
      const ok = (...args) => { const result = git(...args); assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr || result.stdout}`); };
      ok('init', '-b', 'main'); ok('add', '.'); ok('commit', '-m', 'base');
      for (const n of [1, 2]) {
        ok('checkout', '-b', `issue-${n}`, 'main');
        mkdirSync(join(dir, 'changes'), { recursive: true });
        writeFileSync(join(dir, 'changes', `${n}.md`), fragment('patch', `변경 ${n}`));
        ok('add', '.'); ok('commit', '-m', `issue ${n}`); ok('checkout', 'main');
      }
      for (const n of order) ok('merge', '--no-ff', '-m', `merge ${n}`, `issue-${n}`);
      assert.equal(releaseMenuChangelogs(root, '2026-11-26').length, 1);
      const pkg = readFileSync(join(dir, 'package.json'), 'utf8');
      assert.match(pkg, /"version": "0\.11\.35"/);
      assert.doesNotMatch(pkg, /0\.11\.36/);
      const log = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
      assert.match(log, /## 0\.11\.35 — 2026-11-26\n\n- \(#1\) 변경 1\n- \(#2\) 변경 2\n/);
      assert.match(log, /## 0\.11\.34 — 2026-11-26/);
    });
  }
});
