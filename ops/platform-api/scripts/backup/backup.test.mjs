// Tests for the backup scripts (#1266 b6): argument and safety refusals, retention, manifest verification and the
// upgrade ordering (a stub `docker` records every call; no Docker, no database). The live path (real dump, restore,
// MinIO mirror) is the conductor's rehearsal on a disposable compose project.
// Run: node --test scripts/backup/backup.test.mjs

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OPS = join(HERE, '..', '..');
const BACKUP = join(HERE, 'backup.sh');
const RESTORE = join(HERE, 'restore.sh');
const VERIFY = join(HERE, 'verify-backup.sh');
const LIB = join(HERE, 'lib.sh');
const UPGRADE = join(OPS, 'scripts', 'release', 'upgrade.sh');
const COMPOSE = join(OPS, 'docker-compose.production.yml');

// What is in the repository's ops directory before the suite runs (names, sizes, mtimes; node_modules left out).
function repoSnapshot() {
  return readdirSync(OPS, { recursive: true })
    .filter((f) => !f.split('/').includes('node_modules'))
    .sort()
    .map((f) => {
      const st = statSync(join(OPS, f));
      return `${f}:${st.isDirectory() ? 'dir' : `${st.size}:${st.mtimeMs}`}`;
    });
}
const REPO_BEFORE = repoSnapshot();

const SECRET = 'secretpass0123456789';
const ROLE_SECRET = 'SCRAM-SHA-256:4096:roleSecretSalt:roleSecretHash';
const SESSION_SECRET = 'sess-token-0123456789abcdef';
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

// Default maintenance directory of every script run (never the repository's ops/.maintenance); tests that look at the
// lock pass their own.
const MAINT = tmp();
const sha = (s) => createHash('sha256').update(s).digest('hex');

function run(cmd, args, env = {}, extra = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, BACKUP_MAINTENANCE_DIR: MAINT, ...env },
    ...extra,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const bash = (script, args, env) => run('bash', [script, ...args], env);

// A hand-built backup directory in the exact manifest layout backup.sh writes.
const IMAGE_BLOCKS = {
  new: `  "images": {
    "backend": "sha256:b",
    "migrate": "sha256:m",
    "web": "sha256:w",
    "verified": true
  },`,
  // Backups written before the web image and the verified flag existed.
  legacy: `  "images": {
    "backend": "sha256:b",
    "migrate": "sha256:m"
  },`,
  unverified: `  "images": {
    "backend": "",
    "migrate": "sha256:m",
    "web": "sha256:w",
    "verified": false
  },`,
  unknown: `  "images": {
    "backend": "unknown",
    "migrate": "unknown"
  },`,
};
function makeBackup(
  root,
  stamp = '20260101T000000Z',
  { project = 'platform-api', images = 'new' } = {},
) {
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
${IMAGE_BLOCKS[images]}
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
  const stamps = [
    '20260101T000000Z',
    '20260102T000000Z',
    '20260103T000000Z',
    '20260104T000000Z',
    '20260105T000000Z',
  ];
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
      const r = bash(
        RESTORE,
        [dir, '--project', 'platform-api', '--replace-live'],
        env(confirm ? { RESTORE_CONFIRM: confirm } : {}),
      );
      assert.notEqual(r.code, 0);
      assert.match(r.err, /RESTORE_CONFIRM=platform-api/);
    }
  });
  test('--replace-live is refused for any other project name', () => {
    const dir = makeBackup(tmp());
    const r = bash(
      RESTORE,
      [dir, '--project', 'restored', '--replace-live'],
      env({ RESTORE_CONFIRM: 'restored' }),
    );
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
      writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
      return { bin, envFile, dir: makeBackup(tmp()) };
    }
    const base = ({ bin }, extra = {}) => ({ PATH: `${bin}:${process.env.PATH}`, ...extra });
    test('target volume equal to a source volume is refused', () => {
      const s = setup();
      const r = bash(
        RESTORE,
        [s.dir, '--project', 'foo', '--env-file', s.envFile, '--compose-file', COMPOSE],
        base(s, { RELEASE_POSTGRES_VOLUME: 'foo_postgres' }),
      );
      assert.notEqual(r.code, 0);
      assert.match(r.err, /source\/live volume/);
    });
    test('a pre-existing target volume is refused before any start', () => {
      const s = setup();
      const r = bash(
        RESTORE,
        [s.dir, '--project', 'restored', '--env-file', s.envFile, '--compose-file', COMPOSE],
        base(s, { STUB_EXISTING_VOLUME: 'restored_minio' }),
      );
      assert.notEqual(r.code, 0);
      assert.match(r.err, /volume 'restored_minio' already exists/);
    });
  });
});

// Stub `docker` for the backup/upgrade flows: records every call and answers the queries the scripts make.
function writeStub(bin, logFile) {
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${logFile}"
case "$*" in
"compose version --short") echo 2.29.1; exit 0 ;;
"image inspect --format {{.Created}}"*platform-release-web*) echo "\${STUB_WEB_CREATED:-2026-01-02T00:00:00Z}"; exit 0 ;;
"image inspect --format {{.Created}}"*platform-release-backend*) echo 2026-01-01T00:00:00Z; exit 0 ;;
"image inspect --format"*platform-release-backend:local) echo "\${STUB_LOCAL_BACKEND_ID:-sha256:imageid}"; exit 0 ;;
"image inspect --format"*) echo sha256:imageid; exit 0 ;;
"image inspect"*) case "$*" in *"\${STUB_MISSING_IMAGE:-@@none@@}"*) exit 1 ;; esac; exit 0 ;;
"tag "*) exit 0 ;;
"inspect --format {{.State.ExitCode}}"*) echo 0; exit 0 ;;
"inspect --format {{.Image}} cid-"*) echo "sha256:c\${4#cid-}"; exit 0 ;;
"inspect --format"*) echo sha256:oldimage; exit 0 ;;
*"ps --status running --services"*) [ -n "\${STUB_PS_RC:-}" ] && exit "\$STUB_PS_RC"; echo backend; exit 0 ;;
*" start backend"*) if [ -n "\${STUB_LOCK_OWNER:-}" ]; then if [ -f "\$STUB_LOCK_OWNER" ]; then echo held; else echo free; fi >>"\${STUB_LOCK_LOG:?}"; fi; exit "\${STUB_START_RC:-0}" ;;
*"ps -a -q"*) case " \${STUB_NO_CID:-} " in *" \${@: -1} "*) exit 0 ;; esac; echo "cid-\${@: -1}"; exit 0 ;;
*" stop backend"*) if [ -n "\${STUB_BLOCK_DIR:-}" ]; then : >"\$STUB_BLOCK_DIR/reached"; while [ ! -e "\$STUB_BLOCK_DIR/release" ]; do sleep 0.05; done; fi; exit 0 ;;
*"exec -T minio printenv MINIO_ROOT_USER"*) echo minioadmin; exit 0 ;;
*"exec -T minio printenv MINIO_ROOT_PASSWORD"*) echo ${SECRET}; exit 0 ;;
*"datname='platform'"*) echo '1 0 2 0'; exit 0 ;;
*to_regclass*) printf 'core.workspaces\\ndrizzle.__drizzle_migrations\\n'; exit 0 ;;
*"union all"*) printf 'core.workspaces|1\\ndrizzle.__drizzle_migrations|2\\n'; exit 0 ;;
*"__drizzle_migrations order by id"*) printf 'h1\\nh2\\n'; exit 0 ;;
*"exec -T postgres pg_dumpall"*)
  case "$*" in *--globals-only*--no-role-passwords*) echo GLOBALS ;; *) echo "ALTER ROLE platform_app PASSWORD '${ROLE_SECRET}'" ;; esac
  exit 0 ;;
*"exec -T postgres pg_dump "*)
  if [ -n "\${STUB_BLOCK_DUMP_DIR:-}" ]; then : >"\$STUB_BLOCK_DUMP_DIR/reached"; while [ ! -e "\$STUB_BLOCK_DUMP_DIR/release" ]; do sleep 0.05; done; fi
  case "$*" in *--exclude-table-data=core.sessions*) echo DUMP ;; *) echo "COPY core.sessions FROM stdin; ${SESSION_SECRET}" ;; esac
  exit 0 ;;
*"--entrypoint cat"*) if [ -n "\${STUB_TWO_TAGS:-}" ]; then echo '{"entries":[{"tag":"0000_a"},{"tag":"0001_b"}]}'; else echo '{"entries":[{"tag":"0000_a"},{"tag":"0001_b"},{"tag":"0002_c"}]}'; fi; exit 0 ;;
*"--entrypoint sh"*) printf 'h1  0000_a.sql\\nh2  0001_b.sql\\nh3  0002_c.sql\\n'; exit 0 ;;
*"ps -q --filter label=com.docker.compose.project="*"service=migrate"*) [ -e "\${STUB_MIGRATE_RUNNING:-@@none@@}" ] && echo cid-migrate-run; exit 0 ;;
"stop cid-migrate-run"*) [ -n "\${STUB_MIGRATE_STUCK:-}" ] || rm -f "\${STUB_MIGRATE_RUNNING:-@@none@@}"; exit 0 ;;
*"run --rm --no-deps migrate"*)
  if [ -n "\${STUB_BLOCK_MIGRATE_DIR:-}" ]; then : >"\${STUB_MIGRATE_RUNNING:?}"; : >"\$STUB_BLOCK_MIGRATE_DIR/reached"; while [ ! -e "\$STUB_BLOCK_MIGRATE_DIR/release" ]; do sleep 0.05; done; fi
  exit "\${STUB_MIGRATE_RC:-0}" ;;
esac
exit 0
`,
  );
  chmodSync(join(bin, 'docker'), 0o755);
}

describe('upgrade.sh ordering (stub docker)', () => {
  function go(extraEnv = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
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
  // Any way to start the backend: `start backend`, or `up -d` that names backend (with or without --no-deps) or names nothing.
  const startsBackend = (c) =>
    /(^| )start backend$/.test(c) ||
    (/ up -d/.test(c) && (/(^| )backend( |$)/.test(c) || !/--no-deps/.test(c)));

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
  test('the dump commands carry the secret-exclusion flags', () => {
    const r = go();
    assert.equal(r.code, 0, r.err);
    assert.ok(
      r.calls.some((c) =>
        / pg_dump -U postgres -d platform -Fc --exclude-table-data=core\.sessions$/.test(c),
      ),
      r.log,
    );
    assert.ok(
      r.calls.some((c) => / pg_dumpall -U postgres --globals-only --no-role-passwords$/.test(c)),
      r.log,
    );
  });
  test('the written backup passes verify-backup and holds no credential', () => {
    const r = go();
    assert.equal(r.code, 0, r.err);
    const name = readdirSync(r.root).find((n) => /^\d{8}T\d{6}Z$/.test(n));
    assert.ok(name, 'a backup directory exists');
    const dir = join(r.root, name);
    assert.equal(bash(VERIFY, [dir], {}).code, 0);
    // The stub leaks a role password / session row into the output when the matching dump flag is missing.
    for (const f of ['manifest.json', 'globals.sql', 'objects.sha256', 'platform.dump']) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const secret of [SECRET, ROLE_SECRET, SESSION_SECRET])
        assert.ok(!text.includes(secret), `${f} holds a credential`);
    }
    assert.match(readFileSync(join(dir, 'platform.dump'), 'utf8'), /^DUMP$/m);
    assert.match(readFileSync(join(dir, 'globals.sql'), 'utf8'), /^GLOBALS$/m);
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
    writeStub(bin, log);
    // dump fails: replace the pg_dump answer
    const text = readFileSync(join(bin, 'docker'), 'utf8').replace(
      '*"exec -T postgres pg_dump "*)',
      '*"exec -T postgres pg_dump "*) exit 3 ;;\n  *"unused-pattern"*)',
    );
    writeFileSync(join(bin, 'docker'), text);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const r = run('bash', [UPGRADE, 'local', '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: tmp(),
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert.notEqual(r.code, 0);
    assert.equal(
      calls.findIndex((c) => /run --rm --no-deps migrate/.test(c)),
      -1,
    );
    assert.equal(calls.findIndex(startsBackend), -1);
  });
  test('a divergent journal is refused before the backend is touched', () => {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeStub(bin, log);
    const text = readFileSync(join(bin, 'docker'), 'utf8').replace("'h1\\nh2\\n'", "'h1\\nXX\\n'");
    writeFileSync(join(bin, 'docker'), text);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const r = run('bash', [UPGRADE, 'local', '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: tmp(),
    });
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /diverge/);
    assert.equal(
      calls.findIndex((c) => /stop backend/.test(c)),
      -1,
    );
  });
  test('usage', () => {
    assert.equal(bash(UPGRADE, [], { BACKUP_ROOT: tmp() }).code, 2);
    assert.equal(bash(UPGRADE, ['local'], {}).code, 2);
    assert.equal(bash(UPGRADE, ['bad tag!'], { BACKUP_ROOT: tmp() }).code, 2);
  });
});

describe('backup.sh standalone (stub docker)', () => {
  const stubDir = () => ({ bin: tmp(), log: join(tmp(), 'calls.log') });
  function runBackup(extraEnv = {}) {
    const { bin, log } = stubDir();
    writeStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const root = tmp();
    const r = run('bash', [BACKUP, '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: root,
      ...extraEnv,
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    return { ...r, calls, root, log: calls.join('\n') };
  }
  test('F3: a failed backend state query is a failure: no dump, no mirror, backend untouched', () => {
    const r = runBackup({ STUB_PS_RC: '1' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /could not read the backend state/);
    assert.equal(
      r.calls.findIndex((c) => /pg_dump|stop backend|^run /.test(c)),
      -1,
      r.log,
    );
    assert.deepEqual(
      readdirSync(r.root).filter((n) => /^\d{8}T/.test(n)),
      [],
    );
  });
  test('F4: a backend that cannot be started again makes the run fail and names the valid backup', () => {
    const r = runBackup({ STUB_START_RC: '1' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /could not start the backend again/);
    const name = readdirSync(r.root).find((n) => /^\d{8}T\d{6}Z$/.test(n));
    assert.ok(name, 'the backup directory stays');
    assert.ok(r.err.includes(join(r.root, name)), 'the message names the backup directory');
    assert.equal(bash(VERIFY, [join(r.root, name)], {}).code, 0);
  });
  test('a successful standalone run starts the backend again and exits 0', () => {
    const r = runBackup();
    assert.equal(r.code, 0, r.err);
    assert.ok(r.calls.some((c) => /start backend$/.test(c)));
  });
});

function writeRestoreStubFile(bin, logFile) {
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"${logFile}"
for a in "$@"; do case "$a" in *docker-compose.restore-*.yml) [ -f "$a" ] && cp "$a" "\${STUB_CAPTURE_DIR:?}/pins.yml" ;; *no-init.override.yml) [ -f "$a" ] && cp "$a" "\${STUB_CAPTURE_DIR:?}/verify.yml" ;; esac; done
case "$*" in *" -p "*" stop") if [ -n "\${STUB_LOCK_OWNER:-}" ]; then if [ -f "\$STUB_LOCK_OWNER" ]; then echo "stop held"; else echo "stop free"; fi >>"\${STUB_LOCK_LOG:?}"; fi ;; esac
case "$*" in
  "volume inspect "*) exit 1 ;;
  "compose version --short") echo 2.29.1; exit 0 ;;
  "image inspect --format"*platform-release-backend*) echo "\${STUB_BACKEND_ID:-sha256:b}"; exit 0 ;;
  "image inspect --format"*platform-release-migrate*) echo "\${STUB_MIGRATE_ID:-sha256:m}"; exit 0 ;;
  "image inspect --format"*platform-release-web*) [ "\${STUB_WEB_ID:-sha256:w}" = missing ] && exit 1; echo "\${STUB_WEB_ID:-sha256:w}"; exit 0 ;;
  "image inspect --format"*registry.local/be*) echo sha256:b; exit 0 ;;
  "image inspect --format"*registry.local/mig*) echo sha256:m; exit 0 ;;
  "image inspect --format"*registry.local/web*) echo sha256:w; exit 0 ;;
  *"psql"*"-f -"*) cat >/dev/null; exit 0 ;;
  *"pg_restore --exit-on-error"*) exit "\${STUB_PGRESTORE_RC:-0}" ;;
  *"exec -T backend node"*) exit 0 ;;
  *"pg_roles where rolname !~"*) echo 0; exit 0 ;;
  *"datname not in"*) echo 0; exit 0 ;;
  *"select count(*) from core.workspaces"*) echo 1; exit 0 ;;
  *"select count(*) from drizzle.__drizzle_migrations"*) echo 2; exit 0 ;;
  *"select count(*) from core.sessions"*) echo 0; exit 0 ;;
  *"string_agg(rolname"*) echo 'platform_app:true:true,platform_migrate:true:true'; exit 0 ;;
  *"like 'fops"*) echo 0; exit 0 ;;
  *"_owner' and rolcanlogin"*) echo 0; exit 0 ;;
  *"pg_auth_members"*) echo 7; exit 0 ;;
  *"pg_get_userbyid"*) echo platform_migrate; exit 0 ;;
  *"pg_extension"*) echo 1; exit 0 ;;
  *"relowner"*) echo 0; exit 0 ;;
  *"has_database_privilege"*) echo t; exit 0 ;;
  *"encode(sha256"*) echo d; exit 0 ;;
  *"__drizzle_migrations order by id"*) printf '%s' "\${STUB_DB_HASHES:-h1\\nh2\\n}" | sed 's/\\\\n/\\n/g'; exit 0 ;;
  *"--entrypoint cat"*) echo '{"entries":[{"tag":"0000_a"},{"tag":"0001_b"}'"\${STUB_EXTRA_TAG:-}"']}'; exit 0 ;;
  *"--entrypoint sh"*) printf 'h1  0000_a.sql\\nh2  0001_b.sql\\nh3  0002_c.sql\\n'; exit 0 ;;
  *"exec -T minio printenv MINIO_ROOT_USER"*) echo minioadmin; exit 0 ;;
  *"exec -T minio printenv MINIO_ROOT_PASSWORD"*) echo ${SECRET}; exit 0 ;;
  *"--entrypoint mc"*"ls --recursive"*) printf '{"type":"file","size":10}\\n{"type":"file","size":11}\\n'; exit 0 ;;
  *"--entrypoint mc"*"mirror bk/"*)
    for a in "$@"; do case "$a" in *:/data) cp -R "\${STUB_BACKUP_DIR}/objects/." "\${a%:/data}/" ;; esac; done
    exit 0 ;;
esac
exit 0
`,
  );
  chmodSync(join(bin, 'docker'), 0o755);
}

describe('restore.sh image pair and cleanup (stub docker)', () => {
  const writeRestoreStub = writeRestoreStubFile;
  function go(extraEnv = {}, backupOpts = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeRestoreStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const dir = makeBackup(tmp(), undefined, backupOpts);
    // The pin file is written next to the compose file: use a private copy so the repository stays clean.
    const composeDir = tmp();
    const compose = join(composeDir, 'docker-compose.production.yml');
    copyFileSync(COMPOSE, compose);
    const capture = tmp();
    const r = run(
      'bash',
      [RESTORE, dir, '--project', 'restored', '--env-file', envFile, '--compose-file', compose],
      {
        PATH: `${bin}:${process.env.PATH}`,
        STUB_BACKUP_DIR: dir,
        STUB_CAPTURE_DIR: capture,
        ...extraEnv,
      },
    );
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    const pinsPath = join(composeDir, 'docker-compose.restore-restored.yml');
    const captured = join(capture, 'pins.yml');
    return {
      ...r,
      calls,
      log: calls.join('\n'),
      compose,
      pinsPath,
      pinsKept: existsSync(pinsPath),
      pins: existsSync(captured) ? readFileSync(captured, 'utf8') : '',
    };
  }
  const startsBackend = (c) => / up -d/.test(c) && /(^| )backend( |$)/.test(c);
  const startsAnything = (c) =>
    / up -d/.test(c) || /(^| )start( |$)/.test(c) || / run --rm/.test(c);

  test('matching images: restore proceeds, backend starts, no migrate', () => {
    const r = go();
    assert.equal(r.code, 0, r.err + r.log);
    assert.ok(r.calls.some(startsBackend));
    assert.doesNotMatch(r.log, /run --rm --no-deps migrate|bootstrap/);
  });
  test('F1: images differing from the manifest are refused before anything starts', () => {
    const r = go({ STUB_BACKEND_ID: 'sha256:other' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /not the pair this backup was taken with/);
    assert.equal(r.calls.findIndex(startsAnything), -1, r.log);
  });
  test('F1: a missing local migrate image is a mismatch too', () => {
    const r = go({ STUB_MIGRATE_ID: 'sha256:other' });
    assert.notEqual(r.code, 0);
    assert.equal(r.calls.findIndex(startsBackend), -1, r.log);
  });
  test('F1: mismatch + RESTORE_IMAGE_MISMATCH_OK with a pending migration is refused, no backend start', () => {
    const r = go({
      STUB_BACKEND_ID: 'sha256:other',
      RESTORE_IMAGE_MISMATCH_OK: '1',
      STUB_EXTRA_TAG: ',{"tag":"0002_c"}',
    });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /1 pending migration/);
    assert.equal(r.calls.findIndex(startsBackend), -1, r.log);
    assert.doesNotMatch(r.log, /run --rm --no-deps migrate/);
  });
  test('F1: mismatch + ack with a divergent journal is refused', () => {
    const r = go({
      STUB_BACKEND_ID: 'sha256:other',
      RESTORE_IMAGE_MISMATCH_OK: '1',
      STUB_DB_HASHES: 'h1\\nXX\\n',
    });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /diverge/);
    assert.equal(r.calls.findIndex(startsBackend), -1, r.log);
  });
  test('F1: mismatch + ack with an identical journal proceeds', () => {
    const r = go({ STUB_BACKEND_ID: 'sha256:other', RESTORE_IMAGE_MISMATCH_OK: '1' });
    assert.equal(r.code, 0, r.err + r.log);
    assert.ok(r.calls.some(startsBackend));
  });
  test('F2: a failure after the first start stops the target and starts nothing more', () => {
    const r = go({ STUB_PGRESTORE_RC: '3' });
    assert.notEqual(r.code, 0);
    const firstUp = r.calls.findIndex((c) => / up -d/.test(c));
    const stop = r.calls.findIndex(
      (c, i) => i > firstUp && /-p restored .* stop$| stop$/.test(c) && !/stop backend/.test(c),
    );
    assert.ok(firstUp >= 0 && stop > firstUp, r.log);
    assert.equal(
      r.calls.slice(stop).findIndex((c) => / up -d|(^| )start( |$)/.test(c)),
      -1,
      r.log,
    );
    assert.equal(r.calls.findIndex(startsBackend), -1);
    assert.doesNotMatch(r.calls.join('\n'), / down|volume rm/);
    assert.match(r.err, /target project 'restored' stopped/);
  });
  test('F2: a failure before the first start runs no stop', () => {
    const r = go({ STUB_BACKEND_ID: 'sha256:other' });
    assert.equal(
      r.calls.findIndex((c) => / stop$/.test(c)),
      -1,
      r.log,
    );
  });
});

const readCalls = (log) =>
  existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
const manifestOf = (root) => {
  const name = readdirSync(root).find((n) => /^\d{8}T\d{6}Z$/.test(n));
  assert.ok(name, 'a backup directory exists');
  return readFileSync(join(root, name, 'manifest.json'), 'utf8');
};
function backupRun(extraEnv = {}) {
  const bin = tmp();
  const log = join(tmp(), 'calls.log');
  writeStub(bin, log);
  const envFile = join(tmp(), 'env');
  writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
  const root = tmp();
  const r = run('bash', [BACKUP, '--env-file', envFile, '--compose-file', COMPOSE], {
    PATH: `${bin}:${process.env.PATH}`,
    BACKUP_ROOT: root,
    ...extraEnv,
  });
  return { ...r, root, calls: readCalls(log) };
}

describe('OPS-04 backup records the images that produced the data (stub docker)', () => {
  test('container image ids, not the :local tags, after :local was retagged', () => {
    const r = backupRun({ STUB_LOCAL_BACKEND_ID: 'sha256:retagged' });
    assert.equal(r.code, 0, r.err);
    const m = manifestOf(r.root);
    assert.match(m, /"backend": "sha256:cbackend"/);
    assert.match(m, /"migrate": "sha256:cmigrate"/);
    assert.match(m, /"web": "sha256:cedge"/);
    assert.match(m, /"verified": true/);
    assert.doesNotMatch(m, /retagged|imageid|unknown/);
  });
  test('an unidentifiable backend image: the backup runs, verified false, no "unknown"', () => {
    const r = backupRun({ STUB_NO_CID: 'backend' });
    assert.equal(r.code, 0, r.err);
    const m = manifestOf(r.root);
    assert.match(m, /"backend": ""/);
    assert.match(m, /"verified": false/);
    assert.doesNotMatch(m, /unknown/);
    assert.match(r.err, /images\.verified is false/);
  });
  test('no migrate container: the :local ref is trusted only when its journal equals the database', () => {
    const differs = backupRun({ STUB_NO_CID: 'migrate' }); // image knows 3 migrations, database 2
    assert.equal(differs.code, 0, differs.err);
    assert.match(manifestOf(differs.root), /"migrate": ""/);
    const equal = backupRun({ STUB_NO_CID: 'migrate', STUB_TWO_TAGS: '1' });
    assert.equal(equal.code, 0, equal.err);
    assert.match(manifestOf(equal.root), /"migrate": "sha256:imageid"/);
  });
  test('the image ids are read before the backend is stopped', () => {
    const r = backupRun();
    const stop = r.calls.findIndex((c) => / stop backend$/.test(c));
    const inspectBackend = r.calls.findIndex((c) =>
      /^inspect --format \{\{\.Image\}\} cid-backend$/.test(c),
    );
    assert.ok(inspectBackend >= 0 && inspectBackend < stop, r.calls.join('\n'));
  });
});

describe('OPS-05 one maintenance lock per installation (stub docker)', () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(path, ms = 20000) {
    const end = Date.now() + ms;
    while (!existsSync(path)) {
      if (Date.now() > end) throw new Error(`timed out waiting for ${path}`);
      await sleep(25);
    }
  }
  function stubbed() {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    return { bin, log, envFile };
  }

  test('a second backup during an upgrade is refused at once, touching nothing; the nested backup proceeds', async () => {
    const maint = tmp();
    const block = tmp();
    const up = stubbed();
    const child = spawn(
      'bash',
      [UPGRADE, 'local', '--env-file', up.envFile, '--compose-file', COMPOSE],
      {
        env: {
          PATH: `${up.bin}:${process.env.PATH}`,
          HOME: process.env.HOME,
          BACKUP_ROOT: tmp(),
          BACKUP_MAINTENANCE_DIR: maint,
          STUB_BLOCK_DIR: block,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    const exited = new Promise((resolve) => child.on('close', resolve));
    try {
      // Barrier: the upgrade is stopped inside its stop window (the stub blocks `stop backend`).
      await waitFor(join(block, 'reached'));
      const second = stubbed();
      const other = run('bash', [BACKUP, '--env-file', second.envFile, '--compose-file', COMPOSE], {
        PATH: `${second.bin}:${process.env.PATH}`,
        BACKUP_ROOT: tmp(), // a different backup root must not bypass the lock
        BACKUP_MAINTENANCE_DIR: maint,
      });
      assert.equal(other.code, 3, other.err);
      assert.match(other.err, /another maintenance operation holds/);
      assert.match(other.err, /upgrade/);
      assert.match(other.err, /pid \d+ is running/);
      assert.match(other.err, /never taken over automatically/);
      assert.deepEqual(
        readCalls(second.log),
        [],
        'the refused backup ran no docker command at all',
      );
    } finally {
      writeFileSync(join(block, 'release'), '');
    }
    const code = await exited;
    assert.equal(code, 0, stderr);
    const calls = readCalls(up.log);
    assert.ok(
      calls.some((c) => /pg_dump /.test(c)),
      'the nested backup ran',
    );
    assert.ok(
      calls.findIndex((c) => /pg_dump /.test(c)) <
        calls.findIndex((c) => /run --rm --no-deps migrate/.test(c)),
    );
    assert.doesNotMatch(stderr, /another maintenance operation/);
    assert.deepEqual(readdirSync(maint), [], 'the lock is released at the end');
  });

  test('a stale lock is reported with its holder pid and is never taken over', () => {
    const maint = tmp();
    const lock = join(maint, 'platform-api.lock');
    mkdirSync(lock);
    writeFileSync(
      join(lock, 'owner'),
      'pid=2147483646\ntoken=x\noperation=backup\nsince=2026-01-01T03:15:00Z\n',
    );
    const r = backupRun({ BACKUP_MAINTENANCE_DIR: maint });
    assert.equal(r.code, 3);
    assert.match(r.err, /pid 2147483646 is NOT running/);
    assert.ok(r.err.includes(lock), 'names the lock to clear');
    assert.deepEqual(r.calls, []);
    assert.ok(existsSync(join(lock, 'owner')), 'the lock was not removed');
  });

  test('a lock directory of another compose project does not block', () => {
    const maint = tmp();
    mkdirSync(join(maint, 'other-project.lock'));
    const r = backupRun({ BACKUP_MAINTENANCE_DIR: maint });
    assert.equal(r.code, 0, r.err);
  });

  test('the lock is released after success and after a failure', () => {
    const maint = tmp();
    assert.equal(backupRun({ BACKUP_MAINTENANCE_DIR: maint }).code, 0);
    assert.deepEqual(readdirSync(maint), []);
    const failed = backupRun({ BACKUP_MAINTENANCE_DIR: maint, STUB_PS_RC: '1' });
    assert.notEqual(failed.code, 0);
    assert.deepEqual(readdirSync(maint), []);
  });

  test('the backup restarts the backend only while it still holds the lock', () => {
    const maint = tmp();
    const probe = join(tmp(), 'lock-at-start.log');
    const r = backupRun({
      BACKUP_MAINTENANCE_DIR: maint,
      STUB_LOCK_OWNER: join(maint, 'platform-api.lock', 'owner'),
      STUB_LOCK_LOG: probe,
    });
    assert.equal(r.code, 0, r.err);
    assert.ok(r.calls.some((c) => / start backend$/.test(c)));
    // The stub looks at the owner file at the very moment `start backend` runs: releasing before the restart fails this.
    assert.equal(readFileSync(probe, 'utf8').trim(), 'held');
    assert.deepEqual(readdirSync(maint), [], 'released after the restart');
  });
});

describe('N2 upgrade handles the web image with the others (stub docker)', () => {
  function upgradeRun(target, extraEnv = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const r = run('bash', [UPGRADE, target, '--env-file', envFile, '--compose-file', COMPOSE], {
      PATH: `${bin}:${process.env.PATH}`,
      BACKUP_ROOT: tmp(),
      ...extraEnv,
    });
    return { ...r, calls: readCalls(log), log: readCalls(log).join('\n') };
  }

  test('<tag> without platform-release-web:<tag> refuses before stopping anything', () => {
    const r = upgradeRun('v2', { STUB_MISSING_IMAGE: 'platform-release-web:v2' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /platform-release-web:v2 not found/);
    assert.match(r.err, /docker tag platform-release-web:local platform-release-web:v2/);
    assert.equal(
      r.calls.findIndex((c) => /^compose |^tag |^run /.test(c)),
      -1,
      `no compose, tag or run call:\n${r.log}`,
    );
  });

  test('<tag>: web gets a :pre tag from the running edge container and moves to :local with the others', () => {
    const r = upgradeRun('v2');
    assert.equal(r.code, 0, r.err);
    const preWeb = r.calls.findIndex((c) => /^tag sha256:cedge platform-release-web:pre-/.test(c));
    const dump = r.calls.findIndex((c) => /pg_dump /.test(c));
    const toLocal = r.calls.findIndex(
      (c) => c === 'tag platform-release-web:v2 platform-release-web:local',
    );
    const migrate = r.calls.findIndex((c) => /run --rm --no-deps migrate/.test(c));
    assert.ok(preWeb >= 0 && preWeb < dump, r.log);
    assert.ok(dump < toLocal && toLocal < migrate, r.log);
    assert.ok(r.calls.includes('tag platform-release-backend:v2 platform-release-backend:local'));
    assert.ok(r.calls.includes('tag platform-release-migrate:v2 platform-release-migrate:local'));
  });

  test('a failed migration prints the web image in the rollback command', () => {
    const r = upgradeRun('v2', { STUB_MIGRATE_RC: '1' });
    assert.equal(r.code, 1);
    assert.match(
      r.err,
      /image rollback: docker tag platform-release-backend:pre-\S+ platform-release-backend:local/,
    );
    assert.match(r.err, /docker tag platform-release-web:pre-\S+ platform-release-web:local/);
  });

  test('local warns when the web image is older than the backend image, and stays quiet otherwise', () => {
    const old = upgradeRun('local', { STUB_WEB_CREATED: '2025-12-31T00:00:00Z' });
    assert.equal(old.code, 0, old.err);
    assert.match(
      old.err,
      /platform-release-web:local .* is older than platform-release-backend:local/,
    );
    const fresh = upgradeRun('local');
    assert.doesNotMatch(fresh.err, /is older than/);
  });
});

describe('OPS-04 restore: journal check always, images pinned (stub docker)', () => {
  // Reuses the restore stub and runner of the "restore.sh image pair" suite through a local copy of its helpers.
  function writeStubAndGo(extraEnv = {}, backupOpts = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const dir = makeBackup(tmp(), undefined, backupOpts);
    const composeDir = tmp();
    const compose = join(composeDir, 'docker-compose.production.yml');
    copyFileSync(COMPOSE, compose);
    const capture = tmp();
    writeRestoreStubFile(bin, log);
    const r = run(
      'bash',
      [RESTORE, dir, '--project', 'restored', '--env-file', envFile, '--compose-file', compose],
      {
        PATH: `${bin}:${process.env.PATH}`,
        STUB_BACKUP_DIR: dir,
        STUB_CAPTURE_DIR: capture,
        ...extraEnv,
      },
    );
    const calls = readCalls(log);
    const pinsPath = join(composeDir, 'docker-compose.restore-restored.yml');
    const captured = join(capture, 'pins.yml');
    return {
      ...r,
      calls,
      log: calls.join('\n'),
      compose,
      pinsPath,
      pinsKept: existsSync(pinsPath),
      pins: existsSync(captured) ? readFileSync(captured, 'utf8') : '',
    };
  }
  const startsBackend = (c) => / up -d/.test(c) && /(^| )backend( |$)/.test(c);
  const pinned = (pins, service, id) =>
    new RegExp(`^  ${service}:\\n    image: ${id}\\n    pull_policy: never$`, 'm').test(pins);

  test('matching ids: the journal comparison runs before any backend start and all three images are pinned', () => {
    const r = writeStubAndGo();
    assert.equal(r.code, 0, r.err + r.log);
    const journal = r.calls.findIndex((c) => /run --rm --entrypoint cat sha256:m /.test(c));
    assert.ok(journal >= 0, `the journal check ran against the pinned migrate id:\n${r.log}`);
    assert.ok(journal < r.calls.findIndex(startsBackend), r.log);
    for (const svc of ['backend', 'minio-bootstrap'])
      assert.ok(pinned(r.pins, svc, 'sha256:b'), r.pins);
    for (const svc of ['migrate', 'cutover', 'set-role-passwords', 'bootstrap', 'set-actor-role'])
      assert.ok(pinned(r.pins, svc, 'sha256:m'), r.pins);
    assert.ok(pinned(r.pins, 'edge', 'sha256:w'), r.pins);
    // The target is started through the pin file (every start), and the switch-over command uses it too.
    assert.ok(
      r.calls.filter(startsBackend).every((c) => c.includes(`-f ${r.pinsPath}`)),
      r.log,
    );
    assert.ok(r.pinsKept, 'the pin file is kept for later starts');
    assert.match(
      r.err,
      new RegExp(
        `-f ${r.compose.replace(/[.]/g, '\\.')} -f ${r.pinsPath.replace(/[.]/g, '\\.')} up -d`,
      ),
    );
  });

  test('matching ids but a pending migration: refused, no backend start, no pin file left', () => {
    const r = writeStubAndGo({ STUB_EXTRA_TAG: ',{"tag":"0002_c"}' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /1 pending migration/);
    assert.equal(r.calls.findIndex(startsBackend), -1, r.log);
    assert.equal(r.pinsKept, false);
  });

  test('explicit BACKUP_*_IMAGE refs are checked and pinned by their ids', () => {
    const r = writeStubAndGo({
      BACKUP_BACKEND_IMAGE: 'registry.local/be:9',
      BACKUP_MIGRATE_IMAGE: 'registry.local/mig:9',
      BACKUP_WEB_IMAGE: 'registry.local/web:9',
    });
    assert.equal(r.code, 0, r.err + r.log);
    assert.ok(r.calls.includes('image inspect --format {{.Id}} registry.local/be:9'), r.log);
    assert.ok(
      pinned(r.pins, 'backend', 'sha256:b') && pinned(r.pins, 'migrate', 'sha256:m'),
      r.pins,
    );
    assert.ok(pinned(r.pins, 'edge', 'sha256:w'), r.pins);
    assert.doesNotMatch(r.pins, /:local/);
  });

  test('a changed web image is a mismatch like the others', () => {
    const r = writeStubAndGo({ STUB_WEB_ID: 'sha256:newweb' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /not the pair this backup was taken with/);
    assert.equal(
      r.calls.findIndex((c) => / up -d/.test(c)),
      -1,
      r.log,
    );
    const ok = writeStubAndGo({ STUB_WEB_ID: 'sha256:newweb', RESTORE_IMAGE_MISMATCH_OK: '1' });
    assert.equal(ok.code, 0, ok.err + ok.log);
    assert.ok(pinned(ok.pins, 'edge', 'sha256:newweb'), ok.pins);
  });

  test('images.verified false (backend not identified) is a mismatch: refused without the acknowledgement', () => {
    const refused = writeStubAndGo({}, { images: 'unverified' });
    assert.notEqual(refused.code, 0);
    assert.match(refused.err, /images\.verified false/);
    assert.equal(
      refused.calls.findIndex((c) => / up -d/.test(c)),
      -1,
      refused.log,
    );
    const ok = writeStubAndGo({ RESTORE_IMAGE_MISMATCH_OK: '1' }, { images: 'unverified' });
    assert.equal(ok.code, 0, ok.err + ok.log);
    assert.ok(
      ok.calls.some((c) => /--entrypoint cat sha256:m /.test(c)),
      'journal check still ran',
    );
  });

  test('"unknown" ids of an old backup are never accepted as a match', () => {
    const r = writeStubAndGo({}, { images: 'unknown' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /not the pair this backup was taken with/);
  });

  test('an old two-field manifest still restores; the local web image is pinned', () => {
    const r = writeStubAndGo({}, { images: 'legacy' });
    assert.equal(r.code, 0, r.err + r.log);
    assert.match(r.err, /records no web image/);
    assert.ok(pinned(r.pins, 'edge', 'sha256:w'), r.pins);
  });
});

describe('b10b F1 the lock token is bound to the owning upgrade (stub docker)', () => {
  function heldLock(owner) {
    const maint = tmp();
    const lock = join(maint, 'platform-api.lock');
    mkdirSync(lock);
    writeFileSync(
      join(lock, 'owner'),
      `pid=${owner.pid}\ntoken=COPIED\noperation=${owner.operation}\nsince=2026-01-01T03:15:00Z\n`,
    );
    return maint;
  }
  const sleeper = () => spawn('sleep', ['60'], { stdio: 'ignore' });

  test('a token copied into an unrelated process is refused: the owner pid is not its ancestor', () => {
    const other = sleeper();
    try {
      const maint = heldLock({ pid: other.pid, operation: 'upgrade' });
      const r = backupRun({ BACKUP_MAINTENANCE_DIR: maint, BK_LOCK_TOKEN: 'COPIED' });
      assert.equal(r.code, 3, r.err);
      assert.match(r.err, /another maintenance operation holds/);
      assert.deepEqual(r.calls, [], 'no docker call');
      assert.ok(existsSync(join(maint, 'platform-api.lock', 'owner')), 'the lock was not touched');
    } finally {
      other.kill();
    }
  });
  test('a token is accepted only for an upgrade owner: a standalone backup owner cannot be borrowed', () => {
    // process.pid IS an ancestor of the script the test starts, so only the operation check can refuse here.
    const refused = backupRun({
      BACKUP_MAINTENANCE_DIR: heldLock({ pid: process.pid, operation: 'backup' }),
      BK_LOCK_TOKEN: 'COPIED',
    });
    assert.equal(refused.code, 3, refused.err);
    assert.deepEqual(refused.calls, []);
  });
  test('the right token + an upgrade owner that is an ancestor continues under the lock and leaves it in place', () => {
    const maint = heldLock({ pid: process.pid, operation: 'upgrade' });
    const r = backupRun({ BACKUP_MAINTENANCE_DIR: maint, BK_LOCK_TOKEN: 'COPIED' });
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /owned by the calling upgrade/);
    assert.ok(
      existsSync(join(maint, 'platform-api.lock', 'owner')),
      'the nested run never releases',
    );
  });
  test('the owner keeps the token out of the environment; the lock files are private', () => {
    const maint = tmp();
    const r = lib(
      `PROJECT=platform-api OPS_ROOT=/nonexistent; bk_lock_acquire upgrade; env | grep -c '^BK_LOCK_TOKEN=' || true; test -n "$BK_LOCK_OWN_TOKEN"`,
      { BACKUP_MAINTENANCE_DIR: maint },
    );
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out.trim(), '0', 'BK_LOCK_TOKEN is not exported');
    const lock = join(maint, 'platform-api.lock');
    assert.equal(statSync(lock).mode & 0o077, 0, 'lock dir is private');
    assert.equal(statSync(join(lock, 'owner')).mode & 0o077, 0, 'owner file is private');
  });
});

describe('b10b F2 interruption does not release a lock while work may still run (stub docker)', () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(path, ms = 20000) {
    const end = Date.now() + ms;
    while (!existsSync(path)) {
      if (Date.now() > end) throw new Error(`timed out waiting for ${path}`);
      await sleep(25);
    }
  }
  function start(script, args, extraEnv = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeStub(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(envFile, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
    const maint = tmp();
    const child = spawn(
      'bash',
      [script, ...args, '--env-file', envFile, '--compose-file', COMPOSE],
      {
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          HOME: process.env.HOME,
          BACKUP_ROOT: tmp(),
          BACKUP_MAINTENANCE_DIR: maint,
          BK_SETTLE_SECONDS: '3',
          ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const state = { stderr: '' };
    child.stderr.on('data', (d) => {
      state.stderr += d;
    });
    // 'exit', not 'close': a child that must outlive the signal still holds the pipes.
    const exited = new Promise((resolve) =>
      child.on('exit', async (code) => {
        await sleep(150);
        resolve(code);
      }),
    );
    return { child, exited, maint, log, state, lock: join(maint, 'platform-api.lock') };
  }
  const calls = (r) => readCalls(r.log);

  test('upgrade: SIGTERM during the nested backup waits for it, then releases', async () => {
    const dump = tmp();
    const r = start(UPGRADE, ['local'], { STUB_BLOCK_DUMP_DIR: dump });
    await waitFor(join(dump, 'reached'));
    r.child.kill('SIGTERM');
    // The nested backup is told to stop but is inside a docker call (the stub): the lock must still be there.
    await sleep(800);
    assert.ok(existsSync(join(r.lock, 'owner')), 'lock held while the nested backup still runs');
    writeFileSync(join(dump, 'release'), '');
    const code = await r.exited;
    assert.equal(code, 143, r.state.stderr);
    assert.match(r.state.stderr, /interrupted: stopping the active backup/);
    assert.deepEqual(readdirSync(r.maint), [], 'released once the child was gone');
    assert.equal(
      calls(r).findIndex((c) => /run --rm --no-deps migrate/.test(c)),
      -1,
      'no migration after the interruption',
    );
  });

  test('upgrade: a nested backup that does not stop keeps the lock and says how to check and clear it', async () => {
    const dump = tmp();
    const r = start(UPGRADE, ['local'], { STUB_BLOCK_DUMP_DIR: dump });
    await waitFor(join(dump, 'reached'));
    r.child.kill('SIGINT');
    const code = await r.exited; // settle window is 3 s; the child stays busy for longer
    try {
      assert.notEqual(code, 0);
      assert.ok(existsSync(join(r.lock, 'owner')), 'lock KEPT: the child may still run');
      assert.match(r.state.stderr, /lock is KEPT/);
      assert.match(r.state.stderr, /Check: ps -p \d+/);
      assert.match(r.state.stderr, /Only when nothing is running any more, clear the lock: rm -rf/);
      const otherEnv = join(tmp(), 'env');
      writeFileSync(otherEnv, 'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=mock\n');
      const second = run('bash', [BACKUP, '--env-file', otherEnv, '--compose-file', COMPOSE], {
        BACKUP_ROOT: tmp(),
        BACKUP_MAINTENANCE_DIR: r.maint,
      });
      assert.equal(second.code, 3, 'another operation is still refused');
    } finally {
      writeFileSync(join(dump, 'release'), ''); // let the stub finish so no process outlives the test
    }
  });

  test('upgrade: SIGHUP during the migrate job stops the job container before the lock is released', async () => {
    const block = tmp();
    const running = join(tmp(), 'migrate-running');
    const r = start(UPGRADE, ['local'], {
      STUB_BLOCK_MIGRATE_DIR: block,
      STUB_MIGRATE_RUNNING: running,
    });
    await waitFor(join(block, 'reached'));
    assert.ok(existsSync(running));
    r.child.kill('SIGHUP');
    const code = await r.exited;
    assert.equal(code, 129, r.state.stderr);
    assert.ok(
      calls(r).some((c) => c === 'stop cid-migrate-run'),
      'the migrate container was stopped',
    );
    assert.equal(existsSync(running), false);
    assert.deepEqual(
      readdirSync(r.maint),
      [],
      'released after the container was confirmed stopped',
    );
    assert.equal(
      calls(r).findIndex((c) => /up -d$/.test(c) && !/--no-deps/.test(c)),
      -1,
      'the stack was not started after an interrupted migration',
    );
  });

  test('upgrade: a migrate container that cannot be stopped keeps the lock', async () => {
    const block = tmp();
    const running = join(tmp(), 'migrate-running');
    const r = start(UPGRADE, ['local'], {
      STUB_BLOCK_MIGRATE_DIR: block,
      STUB_MIGRATE_RUNNING: running,
      STUB_MIGRATE_STUCK: '1',
    });
    await waitFor(join(block, 'reached'));
    r.child.kill('SIGTERM');
    const code = await r.exited;
    assert.notEqual(code, 0);
    assert.ok(existsSync(join(r.lock, 'owner')), 'lock KEPT');
    assert.match(r.state.stderr, /the migrate container is still running/);
    assert.match(r.state.stderr, /lock is KEPT/);
    assert.match(
      r.state.stderr,
      /docker ps --filter label=com\.docker\.compose\.project=platform-api/,
    );
  });

  test('backup.sh: SIGTERM during the capture waits for it, restarts the backend, then releases (standalone)', async () => {
    const dump = tmp();
    const maint = tmp();
    const probe = join(tmp(), 'lock-at-start.log');
    const r = start(BACKUP, [], {
      STUB_BLOCK_DUMP_DIR: dump,
      STUB_LOCK_OWNER: join(maint, 'platform-api.lock', 'owner'),
      STUB_LOCK_LOG: probe,
      BACKUP_MAINTENANCE_DIR: maint,
    });
    await waitFor(join(dump, 'reached'));
    r.child.kill('SIGTERM');
    await sleep(500);
    assert.ok(
      existsSync(join(maint, 'platform-api.lock', 'owner')),
      'lock held during the capture',
    );
    writeFileSync(join(dump, 'release'), '');
    const code = await r.exited;
    assert.equal(code, 143, r.state.stderr);
    assert.ok(
      calls(r).some((c) => / start backend$/.test(c)),
      'the backend was started again',
    );
    assert.equal(readFileSync(probe, 'utf8').trim(), 'held', 'restart ran while the lock was held');
    assert.deepEqual(readdirSync(maint), []);
  });
});

describe('b10b restore: web image, verification isolation, --replace-live lock (stub docker)', () => {
  function restoreRun(extraEnv = {}, { backupOpts = {}, args = [], project = 'restored' } = {}) {
    const bin = tmp();
    const log = join(tmp(), 'calls.log');
    writeRestoreStubFile(bin, log);
    const envFile = join(tmp(), 'env');
    writeFileSync(
      envFile,
      'POSTGRES_PASSWORD=x\nNOTIFICATION_EMAIL_CHANNEL=smtp\nSMTP_HOST=relay.example\n',
    );
    const dir = makeBackup(tmp(), undefined, backupOpts);
    const composeDir = tmp();
    const compose = join(composeDir, 'docker-compose.production.yml');
    copyFileSync(COMPOSE, compose);
    const capture = tmp();
    const r = run(
      'bash',
      [
        RESTORE,
        dir,
        '--project',
        project,
        '--env-file',
        envFile,
        '--compose-file',
        compose,
        ...args,
      ],
      {
        PATH: `${bin}:${process.env.PATH}`,
        STUB_BACKUP_DIR: dir,
        STUB_CAPTURE_DIR: capture,
        ...extraEnv,
      },
    );
    const read = (f) =>
      existsSync(join(capture, f)) ? readFileSync(join(capture, f), 'utf8') : '';
    return {
      ...r,
      calls: readCalls(log),
      pinsKept: existsSync(join(composeDir, `docker-compose.restore-${project}.yml`)),
      pins: read('pins.yml'),
      verify: read('verify.yml'),
    };
  }
  const anyStart = (c) => / up -d/.test(c) || / run --rm/.test(c) || /(^| )start( |$)/.test(c);

  test('F3: a missing web image is a refusal for a legacy manifest, before anything starts or is written', () => {
    const r = restoreRun({ STUB_WEB_ID: 'missing' }, { backupOpts: { images: 'legacy' } });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /web image platform-release-web:local is not on this host/);
    assert.equal(r.calls.findIndex(anyStart), -1);
    assert.equal(r.pinsKept, false);
    assert.doesNotMatch(r.err, /RESTORE VERIFIED/);
  });
  test('F3: a missing web image is a refusal even with RESTORE_IMAGE_MISMATCH_OK=1', () => {
    const r = restoreRun({ STUB_WEB_ID: 'missing', RESTORE_IMAGE_MISMATCH_OK: '1' });
    assert.notEqual(r.code, 0);
    assert.match(r.err, /web image platform-release-web:local is not on this host/);
    assert.equal(r.calls.findIndex(anyStart), -1);
    assert.equal(r.pinsKept, false);
  });

  test('b10c F1: verification starts the backend with the mock channel and no relay; the kept switch-over file has neither', () => {
    const r = restoreRun({ SMTP_HOST: 'relay.example', SMTP_PASSWORD: 'relaypass' });
    assert.equal(r.code, 0, r.err);
    assert.match(r.verify, /NOTIFICATION_EMAIL_CHANNEL: mock/);
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])
      assert.match(r.verify, new RegExp(`${k}: ""`), k);
    assert.ok(r.pinsKept);
    assert.doesNotMatch(
      r.pins,
      /NOTIFICATION_EMAIL_CHANNEL|SMTP_/,
      'switch-over file has the real settings',
    );
    assert.match(
      r.err,
      /docker compose -p restored --env-file \.env\.production -f \S+ -f \S+ up -d/,
    );
    assert.doesNotMatch(
      r.err,
      /no-init|override/,
      'the switch-over command does not use the verification file',
    );
    assert.doesNotMatch(r.err, /relaypass/);
  });

  test('--replace-live holds the maintenance lock while the live stack is stopped, to the end', () => {
    const maint = tmp();
    const probe = join(tmp(), 'lock.log');
    const r = restoreRun(
      {
        RESTORE_CONFIRM: 'platform-api',
        BACKUP_MAINTENANCE_DIR: maint,
        STUB_LOCK_OWNER: join(maint, 'platform-api.lock', 'owner'),
        STUB_LOCK_LOG: probe,
      },
      { args: ['--replace-live'], project: 'platform-api' },
    );
    assert.equal(r.code, 0, r.err);
    assert.ok(
      readFileSync(probe, 'utf8').split('\n').includes('stop held'),
      'the first stop (live stack) ran under the lock',
    );
    assert.doesNotMatch(readFileSync(probe, 'utf8'), /stop free/);
    assert.deepEqual(readdirSync(maint), [], 'released at the end');
  });
  test('--replace-live is refused (exit 3, live stack untouched) while a backup or upgrade holds the lock', () => {
    const maint = tmp();
    mkdirSync(join(maint, 'platform-api.lock'));
    writeFileSync(
      join(maint, 'platform-api.lock', 'owner'),
      `pid=${process.pid}\ntoken=x\noperation=upgrade\nsince=2026-01-01T03:15:00Z\n`,
    );
    const r = restoreRun(
      { RESTORE_CONFIRM: 'platform-api', BACKUP_MAINTENANCE_DIR: maint },
      { args: ['--replace-live'], project: 'platform-api' },
    );
    assert.equal(r.code, 3, r.err);
    assert.match(r.err, /another maintenance operation holds/);
    assert.equal(
      r.calls.findIndex((c) => /(^| )stop$/.test(c) || anyStart(c)),
      -1,
      'nothing was stopped or started',
    );
    assert.ok(existsSync(join(maint, 'platform-api.lock', 'owner')), 'the foreign lock stays');
  });
  test('a failed --replace-live restore releases the lock it took', () => {
    const maint = tmp();
    const r = restoreRun(
      { RESTORE_CONFIRM: 'platform-api', BACKUP_MAINTENANCE_DIR: maint, STUB_PGRESTORE_RC: '1' },
      { args: ['--replace-live'], project: 'platform-api' },
    );
    assert.notEqual(r.code, 0);
    assert.deepEqual(readdirSync(maint), []);
  });
});

// Every test above writes under a temp directory. The repository directory must look exactly as it did when the suite
// started (no pin files, no .maintenance lock directory, no stray backup).
test('the suite left the repository directory unchanged', () => {
  assert.deepEqual(repoSnapshot(), REPO_BEFORE);
});
