import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../../../..');
const script = join(repo, 'ops/platform-api/scripts/release/build-web-image.sh');
const dockerfile = readFileSync(join(repo, 'apps/platform-web/Dockerfile'), 'utf8');

test('edge packaging rejects mock and empty-snapshot dist before Docker, and accepts a production dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-web-image-'));
  try {
    const dist = join(root, 'dist');
    const bin = join(root, 'bin');
    const called = join(root, 'called');
    mkdirSync(dist);
    mkdirSync(bin);
    writeFileSync(join(dist, 'index.html'), '<html>fixture</html>');
    writeFileSync(join(bin, 'docker'), '#!/bin/sh\nprintf called > "$DOCKER_CALLED"\n', {
      mode: 0o755,
    });
    const run = () =>
      spawnSync('bash', [script, '--dist', dist], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_CALLED: called },
      });
    const missing = run();
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, /menu-declarations.snapshot.json/);
    assert.equal(existsSync(called), false);
    writeFileSync(join(dist, 'menu-declarations.snapshot.json'), '');
    assert.equal(run().status, 1);
    assert.equal(existsSync(called), false);
    writeFileSync(join(dist, 'menu-declarations.snapshot.json'), '{"version":1}');
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(existsSync(called), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the Dockerfile itself checks the production declaration snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-dockerfile-check-'));
  try {
    writeFileSync(join(root, 'index.html'), '<html>fixture</html>');
    const run = dockerfile.match(/^RUN (test -s .*?(?:\\\n.*)*)$/m)?.[1];
    assert.ok(run, 'Dockerfile has its bundle check');
    const check = () =>
      spawnSync('sh', ['-c', run.replaceAll('/usr/share/nginx/html/', '"$DIST"/')], {
        env: { ...process.env, DIST: root },
      }).status;
    assert.equal(check(), 1);
    writeFileSync(join(root, 'menu-declarations.snapshot.json'), '{}');
    assert.equal(check(), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
