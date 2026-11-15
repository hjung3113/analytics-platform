import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('storage-account.sh', import.meta.url));
const compose = readFileSync(
  new URL('../../docker-compose.production.yml', import.meta.url),
  'utf8',
);
const service = (name) =>
  compose.match(new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S|^\\S)`, 'm'))[1];

function run(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'storage-account-'));
  try {
    writeFileSync(
      join(dir, 'mc'),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const policy = args.indexOf('--policy');
if (policy >= 0) fs.copyFileSync(args[policy + 1], process.env.POLICY);
if (args.includes('info') && process.env.MC_EXISTS !== 'yes') process.exit(1);
if (args.includes(process.env.MC_FAIL)) process.exit(1);
`,
      { mode: 0o700 },
    );
    const result = spawnSync('sh', [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CALLS: join(dir, 'calls'),
        POLICY: join(dir, 'policy'),
        MINIO_ROOT_USER: 'root-synthetic',
        MINIO_ROOT_PASSWORD: 'root-secret-synthetic',
        STORAGE_S3_ACCESS_KEY_ID: 'app-synthetic',
        STORAGE_S3_SECRET_ACCESS_KEY: 'app-secret-synthetic',
        STORAGE_S3_BUCKET: 'synthetic-bucket',
        ...extra,
      },
    });
    const read = (name) => {
      try {
        return readFileSync(join(dir, name), 'utf8');
      } catch {
        return '';
      }
    };
    return {
      ...result,
      calls: read('calls')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
      policy: read('policy'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('production gives the backend only its dedicated storage credentials', () => {
  assert.doesNotMatch(service('backend'), /MINIO_ROOT_USER|MINIO_ROOT_PASSWORD/);
  assert.match(service('backend'), /STORAGE_S3_ACCESS_KEY_ID: \$\{STORAGE_S3_ACCESS_KEY_ID:\?/);
  assert.match(
    service('backend'),
    /STORAGE_S3_SECRET_ACCESS_KEY: \$\{STORAGE_S3_SECRET_ACCESS_KEY:\?/,
  );
  assert.match(
    service('backend'),
    /minio-bootstrap:\n {8}condition: service_completed_successfully/,
  );
  assert.match(service('minio-bootstrap'), /storage-account\.sh/);
});

for (const exists of ['no', 'yes']) {
  test(`bootstrap ${exists === 'yes' ? 'updates' : 'creates'} an account with an explicit single-bucket policy`, () => {
    const r = run({ MC_EXISTS: exists });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.calls.some((args) => args[0] === 'mb' && args.includes('--ignore-existing')));
    const command = r.calls.find((args) => args.includes(exists === 'yes' ? 'edit' : 'add'));
    assert.ok(command?.includes('--policy'));
    assert.ok(command.includes('--secret-key'));
    if (exists === 'no') assert.ok(command.includes('root-synthetic'));
    const policy = JSON.parse(r.policy);
    assert.deepEqual(policy.Statement, [
      {
        Effect: 'Allow',
        Action: ['s3:GetBucketLocation', 's3:ListBucket'],
        Resource: ['arn:aws:s3:::synthetic-bucket'],
      },
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'],
        Resource: ['arn:aws:s3:::synthetic-bucket/*'],
      },
    ]);
    assert.doesNotMatch(r.stdout + r.stderr, /root-secret-synthetic|app-secret-synthetic/);
  });
}

test('bootstrap fails closed when account creation fails without printing credentials', () => {
  const r = run({ MC_FAIL: 'add' });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /root-secret-synthetic|app-secret-synthetic/);
});

test('bootstrap rejects root credentials and unsafe bucket names before calling mc', () => {
  for (const extra of [
    { STORAGE_S3_ACCESS_KEY_ID: 'root-synthetic' },
    { STORAGE_S3_SECRET_ACCESS_KEY: 'root-secret-synthetic' },
    { STORAGE_S3_BUCKET: 'bucket"injection' },
  ]) {
    const r = run(extra);
    assert.equal(r.status, 1);
    assert.deepEqual(r.calls, []);
  }
});
