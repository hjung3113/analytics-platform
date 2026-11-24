import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

const repo = resolve(import.meta.dirname, '../../../..');
const script = join(repo, 'ops/platform-api/scripts/release/pack-images.sh');

// A fake docker: `image inspect` answers $FAKE_ARCH, `save … <image>` writes "image:<image>"; every call is logged.
const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1 $2" in
  "image inspect") echo "$FAKE_ARCH" ;;
  save\\ *) for a; do image="$a"; done; printf 'image:%s' "$image" ;;
esac
`;

function withFixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ap-pack-images-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
    // A web build must never run here: pnpm fails at once.
    writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const log = join(root, 'docker.log');
    const run = (args, arch = 'linux/amd64') =>
      spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_LOG: log, FAKE_ARCH: arch },
      });
    const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    fn({ root, run, calls });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('saves the three release images of one tag with a SHA256SUMS that checks', () => {
  withFixture(({ root, run, calls }) => {
    const out = join(root, 'unit');
    const result = run(['--tag', 'v0.49.0', '--out', out, '--no-build']);
    assert.equal(result.status, 0, result.stderr);
    const files = ['backend', 'migrate', 'web'].map((n) => `platform-release-${n}-v0.49.0.tar.gz`);
    assert.deepEqual(readdirSync(out).sort(), ['SHA256SUMS', ...files].sort());
    for (const [i, n] of ['backend', 'migrate', 'web'].entries()) {
      assert.equal(gunzipSync(readFileSync(join(out, files[i]))).toString(), `image:platform-release-${n}:v0.49.0`);
    }
    const sums = readFileSync(join(out, 'SHA256SUMS'), 'utf8').trim().split('\n');
    assert.deepEqual(sums.map((l) => l.split(/\s+\*?/)[1]).sort(), files.sort());
    assert.doesNotMatch(calls(), /^build /m, '--no-build never builds');
    assert.equal(calls().match(/^save --platform linux\/amd64 /gm)?.length, 3, 'each save keeps only linux/amd64');
    assert.equal(calls().match(/^image inspect --platform linux\/amd64 /gm)?.length, 3);
  });
});

test('refuses an image that is not linux/amd64 and writes nothing', () => {
  withFixture(({ root, run }) => {
    const out = join(root, 'unit');
    const result = run(['--tag', 'v0.49.0', '--out', out, '--no-build'], 'linux/arm64');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /has no linux\/amd64 image \(got 'linux\/arm64'\)/);
    assert.equal(existsSync(out), false);
  });
});

test('refuses a non-empty output directory and the moving tag local before calling docker', () => {
  withFixture(({ root, run, calls }) => {
    const out = join(root, 'unit');
    mkdirSync(out);
    writeFileSync(join(out, 'stale.tar.gz'), 'old');
    const dirty = run(['--tag', 'v0.49.0', '--out', out, '--no-build']);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /not empty/);
    const local = run(['--tag', 'local', '--out', join(root, 'other'), '--no-build']);
    assert.equal(local.status, 2);
    assert.equal(calls(), '');
  });
});

test('a build targets linux/amd64 for both server images', () => {
  withFixture(({ root, run, calls }) => {
    // build-web-image.sh then fails on the stub pnpm; only the server image builds are asserted here.
    run(['--tag', 'v0.49.0', '--out', join(root, 'unit')]);
    const builds = calls()
      .split('\n')
      .filter((l) => l.startsWith('build '));
    for (const target of ['runtime', 'migrate']) {
      assert.ok(
        builds.some((l) => l.includes('--platform linux/amd64') && l.includes(`--target ${target}`)),
        `${target} build: ${builds.join(' | ')}`,
      );
    }
  });
});
