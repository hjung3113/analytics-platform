import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve(import.meta.dirname, 'web-image-output-check.mjs');

// A fake docker: `create` answers an id, `cp <id>:<root> <dest>` copies $FAKE_HTML to <dest>; every call is logged.
const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  create) echo fake-container ;;
  cp) cp -R "$FAKE_HTML" "$3" ;;
  rm) ;;
esac
`;

function withImage(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'ap-web-image-test-'));
  try {
    const bin = join(root, 'bin');
    const html = join(root, 'image-html');
    mkdirSync(bin);
    mkdirSync(join(html, 'assets'), { recursive: true });
    writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
    for (const [path, text] of Object.entries(files)) writeFileSync(join(html, path), text);
    const log = join(root, 'docker.log');
    const result = spawnSync('node', [script, 'platform-release-web:v0.50.0'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_LOG: log, FAKE_HTML: html },
    });
    fn(result, existsSync(log) ? readFileSync(log, 'utf8') : '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes a web root whose origins are all on the allowed lists, and removes its container', () => {
  withImage(
    {
      'index.html': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'assets/app.js':
        'new URL(p,"https://recovery.internal");x="https://json-schema.org/draft/2020-12/schema"',
    },
    (result, calls) => {
      assert.equal(result.status, 0, result.stderr);
      assert.match(calls, /^create --platform linux\/amd64 platform-release-web:v0\.50\.0$/m);
      assert.match(calls, /^cp fake-container:\/usr\/share\/nginx\/html /m);
      assert.match(calls, /^rm fake-container$/m);
    },
  );
});

test('fails on a source map file and a sourceMappingURL comment', () => {
  withImage(
    {
      'index.html': '',
      'assets/app.js': 'x\n//# sourceMappingURL=app.js.map',
      'assets/app.js.map': '{}',
    },
    (result, calls) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /assets\/app\.js\.map: source map in the build output/);
      assert.match(result.stderr, /assets\/app\.js: sourceMappingURL comment/);
      assert.match(calls, /^rm fake-container$/m, 'the container is removed on failure too');
    },
  );
});

test('fails on an origin outside the allowed lists', () => {
  withImage(
    { 'index.html': '', 'assets/app.js': 'fetch("https://telemetry.example.com/v1")' },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /assets\/app\.js: external origin https:\/\/telemetry\.example\.com/,
      );
    },
  );
});

test('refuses a missing image argument before calling docker', () => {
  const result = spawnSync('node', [script], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});
