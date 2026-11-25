import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./rollback-round-trip-check.sh', import.meta.url));
const valid = ['--prev-tag', 'prev', '--tag', 'next'];
const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1 $2" in
  "image inspect")
    case "$*" in *"platform-release-web:next") [ "$SCENARIO" != missing ] || exit 1 ;; esac
    echo linux/amd64
    ;;
  "image ls")
    case "$SCENARIO:$*" in
      occupied:*backend:local) echo occupied ;;
      preoccupied:*migrate:pre-*) echo platform-release-migrate:pre-20200101T000000Z ;;
    esac
    ;;
  "tag platform-release-backend:prev") [ "$SCENARIO" != install-tag-fails ] || exit 17 ;;
  "inspect --format") echo sha256:fixture ;;
  compose\\ *)
    case "$*" in
      *"select hash from drizzle"*) echo fixture-hash ;;
      *" ps -a -q "*) echo fixture-container ;;
    esac
    ;;
  run\\ *)
    case "$*" in
      *"--entrypoint cat"*) echo '{"entries":[{"tag":"0000_fixture"}]}' ;;
      *"--entrypoint sh"*) echo 'fixture-hash  0000_fixture.sql' ;;
    esac
    ;;
  "tag sha256:fixture")
    case "$SCENARIO:$*" in partial:*migrate:pre-*) exit 17 ;; esac
    ;;
esac
`;

function run(args, scenario = '') {
  const dir = mkdtempSync(join(tmpdir(), 'ap-rollback-test-'));
  try {
    const log = join(dir, 'docker.log');
    writeFileSync(join(dir, 'docker'), fakeDocker, { mode: 0o755 });
    const result = spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        TMPDIR: dir,
        DOCKER_LOG: log,
        SCENARIO: scenario,
      },
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    return { ...result, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const args of [
  [],
  ['--prev-tag'],
  ['--prev-tag', 'prev'],
  ['--tag', 'next'],
  ['--prev-tag', 'prev', '--tag', 'prev'],
  ['--prev-tag', 'local', '--tag', 'next'],
  ['--prev-tag', 'prev', '--tag', 'pre-20261125T000000Z'],
  ['--prev-tag', '../prev', '--tag', 'next'],
  [...valid, '--tag', 'again'],
  [...valid, '--unexpected'],
]) {
  test(`refuses invalid arguments before Docker: ${args.join(' ') || '(none)'}`, () => {
    const result = run(args);
    assert.equal(result.status, 2, result.stderr);
    assert.deepEqual(result.calls, []);
  });
}

for (const [scenario, diagnosis] of [
  ['missing', /platform-release-web:next/],
  ['occupied', /platform-release-backend:local/],
]) {
  test(`preflight refuses ${scenario} images before changing Docker state`, () => {
    const result = run(valid, scenario);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, diagnosis);
    assert.ok(result.calls.length > 0);
    assert.ok(
      result.calls.every((call) => /^image (inspect|ls) /.test(call)),
      result.calls,
    );
  });
}

test('names a failed install tag step and preserves its exit code', () => {
  const result = run(valid, 'install-tag-fails');
  assert.equal(result.status, 17, result.stderr);
  assert.match(result.stderr, /first install/);
  assert.equal(
    result.calls.at(-1),
    'tag platform-release-backend:prev platform-release-backend:local',
  );
});

test('cleanup never removes a :pre-* tag that existed before the run, and always drops its :local tags', () => {
  const result = run(valid, 'preoccupied');
  assert.ok(
    result.calls.some((call) => call.endsWith(' down --volumes')),
    result.stderr,
  );
  const removed = result.calls.filter((call) => call.startsWith('image rm '));
  assert.ok(
    removed.every((call) => !call.includes(':pre-')),
    `foreign rollback tag removed: ${removed.join(' | ')}`,
  );
  for (const name of ['backend', 'migrate', 'web']) {
    assert.ok(removed.includes(`image rm --no-prune platform-release-${name}:local`), removed);
  }
});
