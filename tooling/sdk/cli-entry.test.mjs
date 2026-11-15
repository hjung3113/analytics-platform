import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));

// #2274: a CLI started through a symlinked path (macOS /var → /private/var) must still run its main, not exit 0 unchecked.
test('sdk-bundle-check run by an absolute path through a symlink still checks and fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-cli-entry-'));
  try {
    mkdirSync(join(root, 'real'));
    copyFileSync(join(repo, 'tooling/sdk/sdk-bundle-check.mjs'), join(root, 'real/sdk-bundle-check.mjs'));
    symlinkSync(join(root, 'real'), join(root, 'link'), 'dir');
    const result = spawnSync(process.execPath, [join(root, 'link/sdk-bundle-check.mjs'), 'verify', '--bundle', join(root, 'link')], { encoding: 'utf8' });
    assert.equal(result.status, 1, `expected a failed verify (no SHA256SUMS), got ${result.status}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout + result.stderr, /SHA256SUMS is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Script files under `dir`, skipping dependencies and build output. */
function scripts(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.turbo'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...scripts(path));
    else if (/\.(mjs|js|ts)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test('every CLI entry check compares real paths (realpathSync), so a symlinked path never skips main', () => {
  const offenders = [];
  for (const dir of ['tooling', 'ops/platform-api/scripts']) {
    for (const file of scripts(join(repo, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (line.includes('process.argv[1]') && line.includes('import.meta.url') && !line.includes('realpathSync')) offenders.push(`${relative(repo, file)}:${index + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, []);
});
