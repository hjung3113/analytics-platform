#!/usr/bin/env node
// Checks the static files of a release web image (#2960): no source map and no external origin, the same scan the
// start kit's build output gets (tooling/sdk/sdk-kit-check.mjs).
// Usage: node web-image-output-check.mjs <image>   e.g. platform-release-web:v0.50.0 (linux/amd64, already on this host)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_ORIGINS, scanBuildOutput } from '../../../../tooling/sdk/sdk-kit-check.mjs';

/** Where build-web-image.sh puts the platform-web build inside the edge image. */
export const WEB_ROOT = '/usr/share/nginx/html';

/**
 * Origins the platform-web build names without fetching them, on top of the start kit's list. Exact origins only,
 * each with its reason:
 * - localhost, platform.local, platform.invalid, host.invalid, recovery.internal: base URLs platform code hands
 *   `new URL()` to parse a relative path or query; the origin is compared or dropped, never requested.
 * - json-schema.org (http and https): `$schema` identifiers zod writes into a generated JSON Schema.
 * - schemas.openxmlformats.org, schemas.microsoft.com: XML namespace identifiers in the spreadsheet export.
 * - github.com: highlight.js prints its security wiki link in a console warning.
 * - prosemirror.net: a ProseMirror error message names its guide.
 */
export const WEB_IMAGE_ORIGINS = Object.freeze([
  'http://localhost',
  'http://platform.local',
  'https://platform.invalid',
  'https://host.invalid',
  'https://recovery.internal',
  'http://json-schema.org',
  'https://json-schema.org',
  'http://schemas.openxmlformats.org',
  'http://schemas.microsoft.com',
  'https://github.com',
  'https://prosemirror.net',
]);

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`docker could not run: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`docker ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** Copies the image's web root out and scans it. Returns failure strings. */
export function checkWebImage(image) {
  const root = mkdtempSync(join(tmpdir(), 'ap-web-image-'));
  const container = docker(['create', '--platform', 'linux/amd64', image]);
  try {
    docker(['cp', `${container}:${WEB_ROOT}`, join(root, 'html')]);
    return scanBuildOutput(join(root, 'html'), [...ALLOWED_ORIGINS, ...WEB_IMAGE_ORIGINS]);
  } finally {
    docker(['rm', container]);
    rmSync(root, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const image = process.argv[2];
  if (!image || process.argv.length > 3) {
    process.stderr.write('usage: web-image-output-check.mjs <image>\n');
    process.exit(2);
  }
  try {
    const failures = checkWebImage(image);
    if (failures.length > 0) {
      process.stderr.write(
        `web-image-output-check: ${image} FAILED\n${failures.map((f) => `  ${f}`).join('\n')}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(
      `web-image-output-check: ${image} has no source map and no external origin\n`,
    );
  } catch (error) {
    process.stderr.write(
      `web-image-output-check: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
