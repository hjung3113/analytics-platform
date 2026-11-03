# Backup, isolated restore and upgrade (production stack)

Single owner of the backup, restore and upgrade procedure of `ops/platform-api/docker-compose.production.yml` (project
`platform-api`). Scripts live in `ops/platform-api/scripts/backup/` (`backup.sh`, `restore.sh`, `verify-backup.sh`,
`lib.sh`) and `ops/platform-api/scripts/release/upgrade.sh`; all run from `ops/platform-api` on the docker host, with
the same `.env.production` as the stack. DB tools run inside the `postgres` container, so the host needs no `psql`.

## Targets

- **RPO 24 hours:** one backup per day. Data created after the last backup is lost on a restore.
- **RTO 4 hours:** from the decision to restore until the restored stack answers `/health/ready` (for the ~100-user data
  size). The restore is a copy, not a rebuild: verified restore time is the number below.
- Rehearsal (conductor, 2026-11-03, #1266 b6): disposable source and target projects with real images on one host,
  small data set (12 VOCs, 3 attachments / 1.2 MB, 85 migrations). `backup.sh` 3 s (backend stopped 1 s); `restore.sh`
  into an isolated project 18 s, all checks passed, an attachment downloaded from the restored stack was byte-identical;
  `upgrade.sh` with one pending migration 11 s (backup first, journal 85 → 86, data and attachments preserved); a failing
  migration left the backend stopped with the journal unchanged and printed the restore and image-rollback commands; a
  divergent image history was refused before anything was stopped. Durations scale with data size; the 4-hour RTO was
  not measured on production-size data — rehearse once on a copy of the real installation before relying on it.
- Not covered: point-in-time recovery, online backup, HA, and shipping backups off the host (the operator's job).

## Supported installs

Backup, restore and `upgrade.sh` support installs on the **platform identity**: database `platform`, roles `platform_*`
(v0.24.0 and later). `backup.sh` records the identity in the manifest and refuses `feedbackops`/`fops_*` or mixed states.
A pre-0076 install finishes the identity cutover first (`scripts/db/cutover-0076-platform-identity.sh`, resumable;
procedure in [04-database-and-migrations.md](../04-database-and-migrations.md) and [oidc-and-images.md](oidc-and-images.md)),
which has its own backup and resume steps.

## Backup

    export BACKUP_ROOT=/srv/platform-backups        # absolute, operator-owned, not world-writable; created 0700
    bash scripts/backup/backup.sh                   # prints the new directory on stdout

One run writes `<BACKUP_ROOT>/<UTC timestamp>/` (directory 0700, files 0600):

| File | Content |
| --- | --- |
| `platform.dump` | `pg_dump -Fc` of database `platform`: all schemas including `pgboss` and `drizzle`. Rows of `core.sessions` are excluded (the table definition stays). |
| `globals.sql` | `pg_dumpall --globals-only --no-role-passwords`: roles, attributes, memberships. No password. |
| `objects/`, `objects.sha256` | Mirror of the attachment bucket (`STORAGE_S3_BUCKET`, default `platform-attachments`) and its sha256 inventory. |
| `manifest.json` | Timestamp, identity, project, backend downtime, backend/migrate image ids, journal (count, last hash, digest), row counts of a fixed table list, object count and bytes, sha256 of `platform.dump`, `globals.sql` and `objects.sha256`. The manifest does not checksum itself. |

How it stays consistent: the script stops `backend` (the HTTP writers and the pg-boss jobs are one process), dumps the
database, mirrors the bucket, then starts `backend` again; downtime is printed and recorded as `backendDowntimeSeconds`.
`edge` and the data services stay up and the edge answers 502 meanwhile. The bucket mirror uses the pinned
MinIO server image the stack already uses (`minio/minio`, run with entrypoint `mc`; `BACKUP_MC_IMAGE` overrides it); the MinIO key reaches `mc` as an exported
`MC_HOST_bk` variable, never as an argument. After the capture the script verifies the new directory
(`verify-backup.sh`: checksums, inventory, counts; no database) and removes everything but the newest `BACKUP_KEEP`
(default 7) timestamp directories; it never deletes the directory it just wrote or anything outside `BACKUP_ROOT`.

No credential is in a backup file, the manifest, a log or a process argument. The backup does hold business data
(attachments, audit log, VOCs): protect `BACKUP_ROOT` like the live database and encrypt any off-host copy.

Schedule (host crontab, quiet hour; the log takes all output; the `||` echo is the only output cron mails, so a failed run mails the owner):

    15 3 * * * cd /opt/platform/ops/platform-api && BACKUP_ROOT=/srv/platform-backups bash scripts/backup/backup.sh >>/var/log/platform-backup.log 2>&1 || echo "platform backup FAILED, see /var/log/platform-backup.log"

Copying `BACKUP_ROOT` off the host after each run is the operator's responsibility; without it a host loss loses the backups.
Check a copy with `bash scripts/backup/verify-backup.sh <dir>` (works anywhere with bash; no Docker, no database).

## Restore into an isolated project

    BACKUP_ROOT=/srv/platform-backups bash scripts/backup/restore.sh /srv/platform-backups/<timestamp> --project platform-restore

The target gets fresh volumes `platform-restore_postgres` and `platform-restore_minio`. A different compose project name
alone does not isolate data (the compose file pins volume names through `RELEASE_POSTGRES_VOLUME` / `RELEASE_MINIO_VOLUME`),
so the script sets both for every target call and refuses before any start or write if either name equals a source or
live volume or already exists. The live volumes are never touched.

**Images.** Before anything starts, the local `platform-release-backend:local` and `platform-release-migrate:local` image ids
must equal `images.backend` / `images.migrate` of the manifest; otherwise the restore is refused. Load or retag the matching
pair first (the `:pre-<timestamp>` tags of an upgrade). `RESTORE_IMAGE_MISMATCH_OK=1` accepts a different build only if the
restored journal equals the local migrate image exactly (read-only compare, as `upgrade.sh` does); a pending or divergent
migration still refuses, before any backend start.

What it does, in order: verify the backup files; start an empty Postgres (no `init.sql`; docker compose 2.24+ for the
override); apply `globals.sql` and stop on the first error (only the `postgres` role lines are skipped); create database
`platform` owned by `platform_migrate`; create extension `vector`; `pg_restore --exit-on-error` with owners and ACLs;
re-grant `CONNECT`; run `set-role-passwords` (passwords from `.env.production`); delete all rows of `core.sessions`
(everyone logs in again). Then it checks, before any mutable service starts: row counts equal the manifest, sessions empty,
login roles and attributes, no `fops_*` role, owner roles `NOLOGIN` with the seven memberships, database owner, extension,
no product table owned by the superuser, runtime grants of `platform_app`, journal digest equals the manifest. Then it
creates the bucket, mirrors the objects back and compares object count, bytes and the sha256 inventory (through a second
export), starts `backend` alone under `platform_app` on a free port and waits for `/health/ready` 200. It never runs
`migrate` or `bootstrap`. On success the restored stack is left stopped with its data.

**Switch traffic.** Put the two printed lines `RELEASE_POSTGRES_VOLUME=…` and `RELEASE_MINIO_VOLUME=…` into
`.env.production`. Stop the old stack's `edge` (and `backend`), then start the restored stack on the published port:
`docker compose --env-file .env.production -f docker-compose.production.yml -p platform-restore up -d`. To keep the
project name `platform-api` instead, run the restore with `--project platform-api --replace-live` and
`RESTORE_CONFIRM=platform-api`: the live containers are stopped first, the live volumes stay untouched, and the old
values of the two `RELEASE_*` variables are the rollback.

**Failed restore.** The script stops at the first failing step, prints the reason, stops the target's containers (nothing
keeps running on unverified data) and keeps the half-built target volumes for inspection. The source backup and the live volumes are unchanged, so the live stack keeps running (or, after
`--replace-live`, start it again with the original env). Fix the cause (damaged file → use the previous backup; password or
env problem → fix `.env.production`) and restore into a new `--project` name. Remove a failed target only after inspecting it:
`docker compose -p <target> down; docker volume rm <target>_postgres <target>_minio`.

## Upgrade

Build or load the new images on the host first, under the tags `platform-release-backend:<tag>` and
`platform-release-migrate:<tag>` (or directly as `:local`), then:

    export BACKUP_ROOT=/srv/platform-backups
    bash scripts/release/upgrade.sh <tag>        # or: upgrade.sh local

1. Compares the applied migrations of the database (`drizzle.__drizzle_migrations`, count and hashes) with the migrations of the
   new migrate image (read-only). Refuses if the database holds a migration the image does not know or if they diverge.
2. Tags the running images `:pre-<UTC timestamp>` (the rollback pair).
3. Stops `backend`, runs `backup.sh --keep-stopped` and `verify-backup.sh`. If either fails the script stops: nothing is
   migrated and the backend stays stopped.
4. Moves the new images onto the `:local` tags and runs the `migrate` job. On a non-zero exit the backend **stays stopped**
   and the script prints the journal inspection command, the `restore.sh` command for the matching backup and the image rollback tags.
5. `up -d`, then waits for `/health/ready` 200.

No down migrations exist. The script never runs a fixture seed or `bootstrap`.

**Migration failure: decide.** First inspect what was committed: `select id, hash, created_at from drizzle.__drizzle_migrations
order by id desc limit 5` (inside the postgres container). Migrations are applied in order; a failed one is not recorded. Then:

- *Forward-fix:* correct the cause (a data problem, a fixed image) and run `upgrade.sh` again; it takes a new backup first.
- *Restore the matched pair:* retag the `:pre-<ts>` images to `:local` and `restore.sh` the backup the upgrade printed, as above.
- The identity cutover is resumable only for its own case (pre-0076 → platform identity) and not part of this script.

Do not start the backend by hand on a partially migrated database.

## Open items

- Off-host copy, encryption of the copy and alerting on a failed cron run are the operator's.
- Backup while the backend runs (online) is not supported; the stop window is the price of a consistent pair.
