import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const script = fileURLToPath(new URL('./offline-start-check.sh', import.meta.url));
const tag = 'ci-test';
const names = ['backend', 'migrate', 'web'];

const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1 $2" in
  "image ls") for arg; do ref="$arg"; done; echo "\${ref#reference=}" ;;
  "image inspect")
    case "$*" in *"platform-release-web:"*) [ "\${MISSING_WEB:-}" != 1 ] || exit 1 ;; esac
    echo "linux/amd64"
    ;;
  compose\\ *)
    case " $* " in *" up "*" edge "*) [ "\${FAIL_START:-}" != 1 ] || exit 17 ;; esac
    ;;
esac
`;

function withUnit(fn) {
  const unit = mkdtempSync(join(tmpdir(), 'ap-offline-start-test-'));
  try {
    const bin = join(unit, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
    const log = join(unit, 'docker.log');
    const row = (file, bytes) => {
      writeFileSync(join(unit, file), bytes);
      return `${createHash('sha256').update(bytes).digest('hex')}  ${file}\n`;
    };
    const sums = [
      ...names.map((name) =>
        row(`platform-release-${name}-${tag}.tar.gz`, gzipSync(`fixture image: ${name}`)),
      ),
      ...names.map((name) => row(`platform-release-${name}-${tag}.cdx.json`, `{"name":"${name}"}`)),
    ];
    const manifest = join(unit, 'SHA256SUMS');
    writeFileSync(manifest, sums.join(''));
    const args = ['--unit', unit, '--tag', tag];
    const run = (options = args, env = {}) =>
      spawnSync('bash', [script, ...options], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_LOG: log, ...env },
      });
    const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
    fn({ unit, manifest, sums, args, run, calls });
  } finally {
    rmSync(unit, { recursive: true, force: true });
  }
}

for (const options of [
  [],
  ['--unit'],
  ['--tag', 'local'],
  ['--tag', '../other'],
  ['--unexpected'],
]) {
  test(`refuses invalid arguments: ${options.join(' ') || '(none)'}`, () => {
    withUnit(({ unit, run, calls }) => {
      const result = run(
        options.length && options[0] !== '--unit' ? ['--unit', unit, ...options] : options,
      );
      assert.equal(result.status, 2, result.stderr);
      assert.deepEqual(calls(), []);
    });
  });
}

test('refuses a truncated archive before calling Docker', (t) => {
  withUnit(({ unit, run, calls }) => {
    truncateSync(join(unit, `platform-release-backend-${tag}.tar.gz`), 3);
    const result = run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stdout + result.stderr,
      /platform-release-backend-ci-test\.tar\.gz: FAILED/,
    );
    assert.match(result.stderr, /SHA256SUMS check failed/);
    assert.deepEqual(calls(), []);
    t.diagnostic(`exit ${result.status}\n${result.stdout}${result.stderr}`);
  });
});

test('refuses a manifest without the SBOM of one image', () => {
  withUnit(({ manifest, sums, run, calls }) => {
    writeFileSync(manifest, sums.filter((line) => !line.includes('web-ci-test.cdx.json')).join(''));
    const result = run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /three archives and three SBOMs/);
    assert.deepEqual(calls(), []);
  });
});

for (const problem of ['omits', 'misformats']) {
  test(`refuses a manifest that ${problem} one of the loaded archives`, () => {
    withUnit(({ manifest, sums, run, calls }) => {
      const rows = sums.slice(1);
      if (problem === 'misformats') rows.unshift(sums[0].replace('  ', '\t'));
      writeFileSync(manifest, rows.join(''));
      const result = run();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /SHA256SUMS must list exactly/);
      assert.deepEqual(calls(), []);
    });
  });
}

test('removes all three tags before loading and starts the production project with builds and pulls disabled', () => {
  withUnit(({ run, calls }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const commands = calls();
    const pulls = commands.filter((call) => call.includes(' pull '));
    assert.equal(pulls.length, 1);
    assert.match(pulls[0], / pull --policy missing postgres minio oidc$/);
    const removals = commands.filter((call) => call.startsWith('image rm '));
    assert.deepEqual(
      removals,
      names.map((name) => `image rm --no-prune platform-release-${name}:${tag}`),
    );
    const loads = commands.filter((call) => call.startsWith('load '));
    assert.equal(loads.length, 3);
    assert.ok(commands.indexOf(removals[2]) < commands.indexOf(loads[0]));
    assert.ok(commands.indexOf(loads[2]) < commands.findIndex((call) => call.includes(' up ')));
    const compose = commands.filter((call) => call.startsWith('compose '));
    const project = compose[0].match(/ --project-name (offline-start-[a-z0-9]+) /)?.[1];
    assert.ok(project);
    for (const call of compose) {
      assert.ok(call.includes(` --project-name ${project} `), call);
      assert.match(call, /docker-compose\.production\.yml/);
    }
    assert.match(
      compose.find((call) => call.endsWith(' edge')),
      / up -d --pull never --no-build --wait --wait-timeout \d+ edge$/,
    );
    for (const service of ['set-role-passwords', 'cutover']) {
      assert.match(
        compose.find((call) => call.endsWith(` ${service}`)),
        / run --rm -T --no-deps --pull never /,
      );
    }
    assert.match(
      compose.find((call) => call.includes(' exec ')),
      /\/health\/ready.*status === 200/,
    );
    assert.match(compose.at(-1), / down --volumes$/);
  });
});

test('refuses when the archives do not restore all expected tags', () => {
  withUnit(({ args, run, calls }) => {
    const result = run(args, { MISSING_WEB: '1' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /platform-release-web:ci-test/);
    assert.ok(calls().every((call) => !call.includes(' up ')));
  });
});

test('propagates a failed offline start and tears down the project', () => {
  withUnit(({ args, run, calls }) => {
    const result = run(args, { FAIL_START: '1' });
    assert.equal(result.status, 17, result.stderr);
    assert.ok(calls().every((call) => !call.includes(' exec ')));
    assert.match(calls().at(-1), / down --volumes$/);
  });
});
