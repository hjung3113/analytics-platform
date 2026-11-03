// Tests for the backup scripts (#1266 b6): argument and safety refusals, retention, manifest verification and the
// upgrade ordering (a stub `docker` records every call; no Docker, no database). The live path (real dump, restore,
// MinIO mirror) is the conductor's rehearsal on a disposable compose project.
// Run: node --test scripts/backup/backup.test.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OPS = join(HERE, '..', '..');
const BACKUP = join(HERE, 'backup.sh');
const RESTORE = join(HERE, 'restore.sh');
const VERIFY = join(HERE, 'verify-backup.sh');
const LIB = join(HERE, 'lib.sh');
const UPGRADE = join(OPS, 'scripts', 'release', 'upgrade.sh');
const COMPOSE = join(OPS, 'docker-compose.production.yml');

const SECRET = 'secretpass0123456789';
const roots = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'backup-test-'));
  chmodSync(d, 0o700);
  roots.push(d);
  return d;
}
after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

const sha = (s) => createHash('sha256').update(s).digest('hex');

function run(cmd, args, env = {}, extra = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    ...extra,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const bash = (script, args, env) => run('bash', [script, ...args], env);

// A hand-built backup directory in the exact manifest layout backup.sh writes.
function makeBackup(root, stamp = '20260101T000000Z', { project = 'platform-api' } = {}) {
  const dir = join(root, stamp);
  mkdirSync(join(dir, 'objects', 'a'), { recursive: true, mode: 0o700 });
  const objects = { './a/one.bin': 'object-one', './two.bin': 'object-two!' };
  writeFileSync(join(dir, 'objects', 'a', 'one.bin'), objects['./a/one.bin']);
  writeFileSync(join(dir, 'objects', 'two.bin'), objects['./two.bin']);
  const inventory = Object.keys(objects)
    .sort()
    .map((k) => `${sha(objects[k])}  ${k}\n`)
    .join('');
  const bytes = Object.values(objects).reduce((n, v) => n + v.length, 0);
  writeFileSync(join(dir, 'objects.sha256'), inventory);
  writeFileSync(join(dir, 'platform.dump'), 'PGDMP-fake');
  writeFileSync(join(dir, 'globals.sql'), 'CREATE ROLE platform_app;\n');
  const manifest = `{
  "format": 1,
  "createdAt": "2026-01-01T00:00:00Z",
  "identity": "platform",
  "database": "platform",
  "project": "${project}",
  "bucket": "platform-attachments",
  "backendDowntimeSeconds": 3,
  "images": {
    "backend": "sha256:b",
    "migrate": "sha256:m"
  },
  "journal": {
    "count": 2,
    "lastHash": "h2",
    "digest": "d"
  },
  "rowCounts": {
    "core.workspaces": 1,
    "drizzle.__drizzle_migrations": 2
  },
  "objects": {
    "count": 2,
    "bytes": ${bytes}
  },
  "files": {
    "globals.sql": "${sha('CREATE ROLE platform_app;\n')}",
    "objects.sha256": "${sha(inventory)}",
    "platform.dump": "${sha('PGDMP-fake')}"
  }
}
`;
  writeFileSync(join(dir, 'manifest.json'), manifest);
  return dir;
}

function lib(snippet, env = {}) {
  return run('bash', ['-c', `set -Eeuo pipefail; BK_TAG=t; . "${LIB}"; ${snippet}`], env);
}

describe('backup.sh refusals', () => {
  test('missing BACKUP_ROOT', () => {
    const r = bash(BACKUP, [], {});
    assert.equal(r.code, 2);
    assert.match(r.err, /set BACKUP_ROOT/);
  });
  for (const [name, root] of [
    ['relative', 'relative/dir'],
    ['slash', '/'],
    ['dotdot', '/tmp/../etc'],
  ]) {
    test(`BACKUP_ROOT ${name}`, () => {
      const r = bash(BACKUP, [], { BACKUP_ROOT: root });
      assert.equal(r.code, 2);
      assert.match(r.err, /BACKUP_ROOT/);
    });
  }
  test('BACKUP_KEEP must be a positive integer', () => {
    const r = bash(BACKUP, [], { BACKUP_ROOT: tmp(), BACKUP_KEEP: '0' });
    assert.equal(r.code, 2);
    assert.match(r.err, /BACKUP_KEEP/);
  });
  test('BACKUP_ROOT must not be world-writable', () => {
    const d = tmp();
    chmodSync(d, 0o777);
    const r = bash(BACKUP, [], { BACKUP_ROOT: d });
    assert.equal(r.code, 2);
    assert.match(r.err, /world-writable/);
  });
  test('unknown argument and --help', () => {
    assert.equal(bash(BACKUP, ['--nope'], { BACKUP_ROOT: tmp() }).code, 2);
    assert.equal(bash(BACKUP, ['--help'], {}).code, 0);
  });
});

describe('retention', () => {
  const stamps = ['20260101T000000Z', '20260102T000000Z', '20260103T000000Z', '20260104T000000Z', '20260105T000000Z'];
  function populate() {
    const root = tmp();
    const outside = tmp();
    writeFileSync(join(outside, 'precious'), 'keep me');
    for (const s of stamps) mkdirSync(join(root, s));
    mkdirSync(join(root, 'notes'));
    writeFileSync(join(root, 'a-file'), 'x');
    symlinkSync(outside, join(root, '20250101T000000Z'));
    return { root, outside };
  }
  test('keeps the newest N timestamp directories and nothing else is touched', () => {
    const { root, outside } = populate();
    const r = lib(`bk_retention "${root}" 2 20260105T000000Z`);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(r.out.trim().split('\n'), stamps.slice(0, 3));
    for (const s of stamps.slice(3)) assert.ok(existsSync(join(root, s)));
    assert.ok(existsSync(join(root, 'notes')) && existsSync(join(root, 'a-file')));
    assert.ok(existsSync(join(outside, 'precious')), 'a symlinked entry must never be followed');
  });
  test('never deletes the backup just written, even when it is the oldest', () => {
    const { root } = populate();
    const r = lib(`bk_retention "${root}" 1 ${stamps[0]}`);
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(root, stamps[0])));
  });
  test('refuses a root of / and a non-timestamp newest name', () => {
    assert.notEqual(lib('bk_retention / 1 20260101T000000Z').code, 0);
    assert.notEqual(lib(`bk_retention "${tmp()}" 1 ../x`).code, 0);
  });
});

describe('verify-backup.sh', () => {
  test('an intact backup passes', () => {
    const dir = makeBackup(tmp());
    const r = bash(VERIFY, [dir], {});
    assert.equal(r.code, 0, r.err);
  });
  test('usage errors', () => {
    assert.equal(bash(VERIFY, [], {}).code, 2);
    assert.equal(bash(VERIFY, [join(tmp(), 'missing')], {}).code, 1);
  });
  test('checksum mismatch of the dump fails', () => {
    const dir = makeBackup(tmp());
    writeFileSync(join(dir, 'platform.dump'), 'tampered');
    const r = bash(VERIFY, [dir], {});
    assert.equal(r.code, 1);
    assert.match(r.err, /checksum mismatch: platform\.dump/);
  });
  test('a changed object fails', () => {
    const dir = makeBackup(tmp());
    writeFileSync(join(dir, 'objects', 'two.bin'), 'object-twoX');
    assert.equal(bash(VERIFY, [dir], {}).code, 1);
  });
  test('a missing object fails', () => {
    const dir = makeBackup(tmp());
    rmSync(join(dir, 'objects', 'a', 'one.bin'));
    assert.equal(bash(VERIFY, [dir], {}).code, 1);
  });
  test('an extra object fails', () => {
    const dir = makeBackup(tmp());
    writeFileSync(join(dir, 'objects', 'extra.bin'), 'x');
    assert.equal(bash(VERIFY, [dir], {}).code, 1);
  });
  test('a missing manifest, a missing payload file and a stray file fail', () => {
    const a = makeBackup(tmp());
    rmSync(join(a, 'manifest.json'));
    assert.equal(bash(VERIFY, [a], {}).code, 1);
    const b = makeBackup(tmp());
    rmSync(join(b, 'globals.sql'));
    assert.equal(bash(VERIFY, [b], {}).code, 1);
    const c = makeBackup(tmp());
    writeFileSync(join(c, 'notes.txt'), 'x');
    assert.equal(bash(VERIFY, [c], {}).code, 1);
  });
});

describe('journal comparison', () => {
  const pending = (db, img) => {
    const d = tmp();
    writeFileSync(join(d, 'db'), db.map((h) => `${h}\n`).join(''));
    writeFileSync(join(d, 'img'), img.map((h) => `${h}\n`).join(''));
    return lib(`bk_journal_pending "${d}/db" "${d}/img"`);
  };
  test('prefix = pending count', () => {
    assert.equal(pending(['a', 'b'], ['a', 'b', 'c', 'd']).out.trim(), '2');
    assert.equal(pending(['a', 'b'], ['a', 'b']).out.trim(), '0');
    assert.equal(pending([], ['a']).out.trim(), '1');
  });
  test('a divergent hash or an older image is refused', () => {
    assert.equal(pending(['a', 'x'], ['a', 'b', 'c']).code, 1);
    assert.equal(pending(['a', 'b', 'c'], ['a', 'b']).code, 1);
  });
});

describe('restore.sh refusals', () => {
  const env = (extra = {}) => ({ ...extra });
  test('usage', () => {
    assert.equal(bash(RESTORE, [], env()).code, 2);
    const dir = makeBackup(tmp());
    assert.equal(bash(RESTORE, [dir], env()).code, 2);
    assert.equal(bash(RESTORE, [dir, '--project', 'Bad Name'], env()).code, 2);
    assert.equal(bash(RESTORE, [join(tmp(), 'missing'), '--project', 'x'], env()).code, 2);
  });
  test('a damaged backup stops before anything else', () => {
    const dir = makeBackup(tmp());
    writeFileSync(join(dir, 'platform.dump'), 'tampered');
    const r = bash(RESTORE, [dir, '--project', 'restored'], env());
    assert.notEqual(r.code, 0);
    assert.match(r.err, /failed verification/);
  });
  test('the live project name needs --replace-live', () => {
    const dir = makeBackup(tmp());
    const r = bash(RESTORE, [dir, '--project', 'platform-api'], env());
    assert.notEqual(r.code, 0);
    assert.match(r.err, /--replace-live/);
  });
  test('--replace-live needs RESTORE_CONFIRM equal to the project', () => {
    const dir = makeBackup(tmp());
    for (const confirm of [undefined, 'yes', 'other']) {
      const r = bash(RESTORE, [dir, '--project', 'platform-api', '--replace-live'], env(confirm ? { RESTORE_CONFIRM: confirm } : {}));
      assert.notEqual(r.code, 0);
      assert.match(r.err, /RESTORE_CONFIRM=platform-api/);
    }
  });
  test('--replace-live is refused for any other project name', () => {
    const dir = makeBackup(tmp());
    const r = bash(RESTORE, [dir, '--project', 'restored', '--replace-live'], env({ RESTORE_CONFIRM: 'restored' }));
    assert.notEqual(r.code, 0);
    assert.match(r.err, /applies only to the live/);
  });
  test('the source project name of the manifest counts as live', () => {
    const dir = makeBackup(tmp(), '20260101T000000Z', { project: 'acme-prod' });
    const r = bash(RESTORE, [dir, '--project', 'acme-prod'], env());
    assert.notEqual(r.code, 0);
    assert.match(r.err, /running\/source project/);
  });
  describe('volume isolation (stub docker)', () => {
    function setup() {
      const bin = tmp();
      writeFileSync(
        join(bin, 'docker'),
        `#!/usr/bin/env bash
case "$*" in
  "volume inspect "*) [ "$3" = "$STUB_EXISTING_VOLUME" ] && exit 0 || exit 1 ;;
  "compose version --short") echo 2.29.1 ;;
esac
exit 0
`,
      );
      chmodSync(join(bin, 'docker'), 0o755);
      const envFile = join(tmp(), 'env');
      writeFileSync(envFile, 'POSTGRES_PASSWORD=x\n');
      return { bin, envFile, dir: makeBackup(tmp()) };
    }
    const base = ({ bin }, extra = {}) => ({ PATH: `${bin}:${process.env.PATH}`, ...extra });
    test('target volume equal to a source volume is refused', () => {
      const s = setup();
      const r = bash(RESTORE, [s.dir, '--project', 'foo', '--env-file', s.envFile, '--compose-file', COMPOSE], base(s, { RELEASE_POSTGRES_VOLUME: 'foo_postgres' }));
      assert.notEqual(r.code, 0);
      assert.match(r.err, /source\/live volume/);
    });
    test('a pre-existing target volume is refused before any start', () => {
      const s = setup();
      const r = bash(RESTORE, [s.dir, '--project', 'restored', '--env-file', s.envFile, '--compose-file', COMPOSE], base(s, { STUB_EXISTING_VOLUME: 'restored_minio' }));
      assert.notEqual(r.code, 0);
      assert.match(r.err, /volume 'restored_minio' already exists/);
    });
  });
});

describe('upgrade.sh ordering (stub docker)', () => {
  function stub(bin, logFile) {
    writeFileSync(
      join(bin, 'docker'),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${logFile}"
case "$*" in
  "compose version --short") echo 2.29.1; exit 0 ;;
  "image inspect --format"*) echo sha256:imageid; exit 0 ;;
  "image inspect"*) exit 0 ;;
  "inspect --format"*) echo sha256:oldimage; exit 0 ;;
  *"ps --status running --services"*) echo backend; exit 0 ;;
  *"ps -a -q"*) echo cid1; exit 0 ;;
  *"exec -T minio printenv MINIO_ROOT_USER"*) echo minioadmin; exit 0 ;;
  *"exec -T minio printenv MINIO_ROOT_PASSWORD"*) echo ${SECRET}; exit 0 ;;
  *"datname='platform'"*) echo '1 0 2 0'; exit 0 ;;
  *to_regclass*) printf 'core.workspaces\\ndrizzle.__drizzle_migrations\\n'; exit 0 ;;
  *"union all"*) printf 'core.workspaces|1\\ndrizzle.__drizzle_migrations|2\\n'; exit 0 ;;
  *"__drizzle_migrations order by id"*) printf 'h1\\nh2\\n'; exit 0 ;;
  *"exec -T postgres pg_dumpall"*) echo GLOBALS; exit 0 ;;
  *"exec -T postgres pg_dump "*) echo DUMP; exit 0 ;;
  *"--entrypoint cat"*) echo '{"entries":[{"tag":"0000_a"},{"tag":"0001_b"},{"tag":"0002_c"}]}'; exit 0 ;;
  *"--entrypoint sh"*) printf 'h1  0000_a.sql\\nh2  0001_b.sql\\nh3  0002_c.sql\\n'; exit 0 ;;
  *"run --rm --no-deps migrate"*) exit "\${STUB_MIGRATE_RC:-0}" ;;
esac
exit 0
`,
    );
    chmodSync(join(bin, 'docker'), 0o755);
  }
  function go(extraEnv = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    stub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\n');
    const root = tmp();
    const r = run('bash', [UPGRADE, 'local', '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: root,
      ...extraEnv,
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    return { ...r, calls, root, log: calls.join('\n') };
  }
  const idx = (calls, re) => calls.findIndex((c) => re.test(c));
  const startsBackend = (c) => /(^| )start backend$/.test(c) || (/ up -d/.test(c) && !/--no-deps/.test(c));

  test('success: stop -> dump -> migrate -> only then any start; backup verified and secret-free', () => {
    const r = go();
    assert.equal(r.code, 0, r.err);
    const stop = idx(r.calls, /stop backend$/);
    const dump = idx(r.calls, /pg_dump /);
    const migrate = idx(r.calls, /run --rm --no-deps migrate/);
    const firstStart = r.calls.findIndex(startsBackend);
    assert.ok(stop >= 0 && stop < dump && dump < migrate, r.log);
    assert.ok(firstStart > migrate, `no backend start before the migrate succeeded:\n${r.log}`);
    assert.doesNotMatch(r.log, new RegExp(SECRET));
    assert.doesNotMatch(r.out + r.err, new RegExp(SECRET));
  });
  test('the written backup passes verify-backup and holds no credential', () => {
    const r = go();
    assert.equal(r.code, 0, r.err);
    const name = readdirSync(r.root).find((n) => /^\d{8}T\d{6}Z$/.test(n));
    assert.ok(name, 'a backup directory exists');
    const dir = join(r.root, name);
    assert.equal(bash(VERIFY, [dir], {}).code, 0);
    for (const f of ['manifest.json', 'globals.sql', 'objects.sha256']) {
      assert.doesNotMatch(readFileSync(join(dir, f), 'utf8'), new RegExp(SECRET));
    }
    assert.match(readFileSync(join(dir, 'manifest.json'), 'utf8'), /"identity": "platform"/);
  });
  test('migration failure: no backend start at all, restore command printed, exit 1', () => {
    const r = go({ STUB_MIGRATE_RC: '1' });
    assert.equal(r.code, 1);
    assert.equal(r.calls.findIndex(startsBackend), -1, `backend must stay stopped:\n${r.log}`);
    assert.match(r.err, /MIGRATION FAILED/);
    assert.match(r.err, /restore\.sh/);
    assert.match(r.err, /--project <new-project>/);
  });
  test('backup failure: migrate never runs and the backend stays stopped', () => {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    stub(bin, log);
    // dump fails: replace the pg_dump answer
    const text = readFileSync(join(bin, 'docker'), 'utf8').replace('echo DUMP; exit 0', 'exit 3');
    writeFileSync(join(bin, 'docker'), text);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\n');
    const r = run('bash', [UPGRADE, 'local', '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: tmp(),
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert.notEqual(r.code, 0);
    assert.equal(calls.findIndex((c) => /run --rm --no-deps migrate/.test(c)), -1);
    assert.equal(calls.findIndex(startsBackend), -1);
  });
  test('a divergent journal is refused before the backend is touched', () => {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    stub(bin, log);
    const text = readFileSync(join(bin, 'docker'), 'utf8').replace("'h1\\nh2\\n'", "'h1\\nXX\\n'");
    writeFileSync(join(bin, 'docker'), text);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\n');
    const r = run('bash', [UPGRADE, 'local', '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: tmp(),
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /diverge/);
    assert.equal(calls.findIndex((c) => /stop backend/.test(c)), -1);
  });
  test('usage', () => {
    assert.equal(bash(UPGRADE, [], { BACKUP_ROOT: tmp() }).code, 2);
    assert.equal(bash(UPGRADE, ['local'], {}).code, 2);
    assert.equal(bash(UPGRADE, ['bad tag!'], { BACKUP_ROOT: tmp() }).code, 2);
  });
});
