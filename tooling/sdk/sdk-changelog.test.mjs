import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checkFragments, releaseChangelog } from './sdk-changelog.mjs';

const row = (n, body = 'change') => `| 다음 릴리스 (#${n}) | kernel | ${body} | 없음 |`;
const header = '# SDK\n\n## 변경 기록\n\n| 버전 | 패키지 | 바뀐 공개 API | 이전 방법 |\n| --- | --- | --- | --- |\n';
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'ap-changelog-'));
  mkdirSync(join(root, 'changes'));
  writeFileSync(join(root, 'changes/README.md'), 'Fragments');
  writeFileSync(join(root, 'CHANGELOG.md'), header + row(20) + '\n| old | kernel | previous | 없음 |\n');
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('check accepts multiple rows and escaped pipes, ignoring README', () => fixture(root => {
  writeFileSync(join(root, 'changes/10.md'), row(10, 'A \\| B') + '\n' + row(10) + '\n');
  assert.equal(checkFragments(root).length, 2);
}));
for (const text of [row(11), 'not a row', '| 다음 릴리스 (#10) | kernel | | 없음 |', '| 다음 릴리스 (#10) | kernel | A | B | C |', '']) {
  test(`invalid fragment names its file: ${JSON.stringify(text)}`, () => fixture(root => {
    writeFileSync(join(root, 'changes/10.md'), text);
    assert.throws(() => checkFragments(root), /10\.md/);
  }));
}
test('release folds legacy and fragment rows, sorts numerically, dry-runs and repeats safely', () => fixture(root => {
  writeFileSync(join(root, 'changes/100.md'), row(100) + '\n');
  writeFileSync(join(root, 'changes/3.md'), row(3) + '\n');
  const before = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const preview = releaseChangelog(root, '1.2.3', true);
  assert.equal(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), before);
  assert.equal(readdirSync(join(root, 'changes')).length, 3);
  assert.ok(preview.indexOf('(#3)') < preview.indexOf('(#20)'));
  assert.ok(preview.indexOf('(#20)') < preview.indexOf('(#100)'));
  assert.match(preview, /\[`sdk-v1\.2\.3`\]\(https:\/\/github.com\/hjung3113\/analytics-platform\/releases\/tag\/sdk-v1\.2\.3\)/);
  assert.doesNotMatch(preview, /다음 릴리스/);
  assert.equal(releaseChangelog(root, '1.2.3'), preview);
  assert.deepEqual(readdirSync(join(root, 'changes')), ['README.md']);
  assert.equal(releaseChangelog(root, '1.2.3'), preview);
  assert.match(preview, /\| old \| kernel \| previous/);
}));
test('legacy multi-issue labels and duplicate rows are retained once', () => fixture(root => {
  writeFileSync(join(root, 'CHANGELOG.md'), header + row('20, #21') + '\n' + row(3) + '\n');
  writeFileSync(join(root, 'changes/3.md'), row(3));
  const output = releaseChangelog(root, '1.2.3');
  assert.match(output, /\(#20, #21\)/);
  assert.equal(output.match(/\(#3\)/g).length, 1);
}));
test('invalid release input preserves files', () => fixture(root => {
  writeFileSync(join(root, 'changes/10.md'), row(11));
  assert.throws(() => releaseChangelog(root, '1.2.3'), /10\.md/);
  assert.throws(() => releaseChangelog(root, '../bad'), /version/);
  assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes('다음 릴리스'));
}));

test('two branches: fragment rebase succeeds; old shared CHANGELOG row rebase conflicts', () => {
  for (const fragments of [true, false]) {
    fixture(root => {
      const git = (...args) => spawnSync('git', args, {
        cwd: root, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
      });
      const ok = (...args) => { const result = git(...args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
      ok('init', '-b', 'base');
      ok('add', '.'); ok('commit', '-m', 'base');
      for (const n of [1, 2]) {
        ok('checkout', '-b', `lane-${n}`, 'base');
        if (fragments) writeFileSync(join(root, `changes/${n}.md`), row(n) + '\n');
        else writeFileSync(join(root, 'CHANGELOG.md'), header + row(n) + '\n' + row(20) + '\n');
        ok('add', '.'); ok('commit', '-m', `issue ${n}`);
      }
      const result = git('rebase', 'lane-1');
      assert.equal(result.status, fragments ? 0 : 1, result.stdout + result.stderr);
      if (fragments) assert.deepEqual(readdirSync(join(root, 'changes')).sort(), ['1.md', '2.md', 'README.md']);
      else {
        assert.match(result.stdout + result.stderr, /CONFLICT.*CHANGELOG.md/);
        ok('rebase', '--abort');
      }
      console.log(`proof: ${fragments ? 'separate fragments: rebase exit 0, both files retained' : 'shared CHANGELOG rows: rebase exit 1, CHANGELOG.md conflict'}`);
    });
  }
});
