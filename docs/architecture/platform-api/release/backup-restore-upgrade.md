# Backup, isolated restore and upgrade (production stack)

Single owner of the backup, restore and upgrade procedure of `ops/platform-api/docker-compose.production.yml` (project
`platform-api`). Scripts live in `ops/platform-api/scripts/backup/` (`backup.sh`, `restore.sh`, `verify-backup.sh`,
`lib.sh`) and `ops/platform-api/scripts/release/upgrade.sh`; all run from `ops/platform-api` on the docker host, with
the same `.env.production` as the stack. DB tools run inside the `postgres` container, so the host needs no `psql`.

## Targets

- **RPO 24 hours:** one backup per day. Data created after the last backup is lost on a restore.
- **RTO 4 hours:** from the decision to restore until the restored stack answers `/health/ready` (for the ~100-user data
  size). The restore is a copy, not a rebuild: verified restore time is the number below.
- The 4-hour RTO has not been measured on production-size data. Rehearse on a copy of the real installation before
  relying on it. Small-data timings and failure-path observations are kept in the
  [backup/restore rehearsal record](../../../research/2026-11-03-backup-restore-rehearsal.md).
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
| `manifest.json` | Timestamp, identity, project, backend downtime, image ids (`images.backend`, `images.migrate`, `images.web`, `images.verified`), journal (count, last hash, digest), row counts of a fixed table list, object count and bytes, sha256 of `platform.dump`, `globals.sql` and `objects.sha256`. The manifest does not checksum itself. |

**Image pairing.** The ids come from the containers that produced the data, never from the mutable `:local` tags: the
`backend` container's image, the `edge` container's image, and the image of the last successful `migrate` container. A
`migrate` run started with `run --rm` leaves no container; then `platform-release-migrate:local` (or `BACKUP_MIGRATE_IMAGE`)
is recorded only if its migrations are exactly the applied ones, else `images.migrate` is empty. If the backend container's
image cannot be identified the backup still runs, `images.backend` is empty and `images.verified` is `false`; restore
treats that as an image mismatch. `unknown` is never written as an id. Preloading the next release as `:local` does not change
the deployed image ids recorded by a daily backup.

**One maintenance lock.** `backup.sh` and `upgrade.sh` share `ops/platform-api/.maintenance/<compose project>.lock`
(a directory with an owner file; git-ignored; independent of `BACKUP_ROOT`). It is taken before the backend state is read
and held until the final restart or the failure exit. `upgrade.sh` holds it for the whole run and its nested
`backup.sh --keep-stopped` continues under it: the owner passes a token to that one child only (never exported), and the
child accepts it only if the owner file names an `upgrade` whose pid is the child's ancestor, so a copied token admits no
other run. `restore.sh` takes the lock of its target project before it writes any file (the pin file is shared with `upgrade.sh`) and holds it to the end; with `--replace-live` this is also before the live stack is stopped. A second backup or upgrade exits **3** at once, without stopping or starting
anything, and prints the holder (operation, since, pid and whether that pid is running). A stale lock (holder pid not running,
for example after a host crash) is never removed automatically: after checking that no backup or upgrade is running, remove
the directory the message names. On INT/TERM/HUP `upgrade.sh` stops or waits for its active child (nested backup, migrate
container) before it releases; if it cannot confirm the child stopped, it keeps the lock and prints how to check
(`ps`, `docker ps` on the migrate service) and how to clear it. `backup.sh` handles the same signals after the running
docker call and then restarts the backend and releases. SIGKILL leaves the lock: use the stale-lock procedure. Because the refusal is a non-zero exit, the cron line below mails it.

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

**Images.** Before anything starts, the ids of `platform-release-backend:local`, `platform-release-migrate:local` and
`platform-release-web:local` (or `BACKUP_BACKEND_IMAGE` / `BACKUP_MIGRATE_IMAGE` / `BACKUP_WEB_IMAGE`) must equal
`images.backend` / `images.migrate` / `images.web` of the manifest; otherwise (also when `images.verified` is `false`, or an
old backup holds no or `unknown` ids) the restore is refused. Load or retag the matching set first (the `:pre-<timestamp>`
tags of an upgrade). `RESTORE_IMAGE_MISMATCH_OK=1` accepts different images. In every case, matching or not, the restore
compares the restored migration ledger with the migrate image (read-only, as `upgrade.sh` does) **before any backend
starts** and refuses on a pending or divergent migration: an id match is not a compatibility proof by itself. An old backup
without `images.web` restores with the local web image. A missing backend, migrate or **web** image is always a refusal, even
with `RESTORE_IMAGE_MISMATCH_OK=1`: the edge is pinned too, and an unpinned edge would start whatever `:local` holds later.

The checked image ids are pinned in `docker-compose.restore-<project>.yml`, written next to the compose file
(`backend`, `minio-bootstrap`, `migrate`, `cutover`, `set-role-passwords`, `bootstrap`, `set-actor-role`, `edge`; `pull_policy: never`).
Every target call uses it, so the image that starts is the one that was checked. **Keep the file**: it is part of the restored
installation; a failed restore deletes it.

What it does, in order: verify the backup files; start an empty Postgres (no `init.sql`; docker compose 2.24+ for the
override); apply `globals.sql` and stop on the first error (only the `postgres` role lines are skipped); create database
`platform` owned by `platform_migrate`; create extension `vector`; `pg_restore --exit-on-error` with owners and ACLs;
re-grant `CONNECT`; run `set-role-passwords` (passwords from `.env.production`); delete all rows of `core.sessions`
(everyone logs in again). Then it checks, before any mutable service starts: row counts equal the manifest, sessions empty,
login roles and attributes, no `fops_*` role, owner roles `NOLOGIN` with the seven memberships, database owner, extension,
no product table owned by the superuser, runtime grants of `platform_app`, journal digest equals the manifest. Then it
creates the bucket, mirrors the objects back and compares object count, bytes and the sha256 inventory (through a second
export), starts `backend` alone under `platform_app` on a free port and waits for `/health/ready` 200. That verification start uses
`JOBS_DISABLED=true`, `NOTIFICATION_EMAIL_CHANNEL=mock` and blank `SMTP_*` (including `SMTP_USERNAME`; a temporary override file that is deleted, not the
kept pin file). With `JOBS_DISABLED` the backend still starts pg-boss (readiness needs it, enqueueing works) but without the
supervisor and cron scheduler and with no job worker registered, so the copied pending jobs are neither run nor stamped
(`email_sent_at` stays as copied) and nothing is sent outward; they run after the switch-over. `JOBS_DISABLED` is operator
maintenance only: never set it on a serving stack. The **switch-over start
uses the operator's real settings** from `.env.production`. It never runs
`migrate` or `bootstrap`. On success the restored stack is left stopped with its data.

**Switch traffic.** Put the two printed lines `RELEASE_POSTGRES_VOLUME=…` and `RELEASE_MINIO_VOLUME=…` into
`.env.production`. Stop the old stack's `edge` (and `backend`), then start the restored stack on the published port:
`docker compose --env-file .env.production -f docker-compose.production.yml -f docker-compose.restore-platform-restore.yml -p platform-restore up -d`
(the script prints the exact command). **Later-start rule: if `docker-compose.restore-<project>.yml` exists, every compose command for that project uses both `-f` files; `upgrade.sh` keeps the pin file current.** The pin file is installation state: git-ignored, and backed up together with `.env.production`. To keep the
project name `platform-api` instead, run the restore with `--project platform-api --replace-live` and
`RESTORE_CONFIRM=platform-api`: the live containers are stopped first, the live volumes stay untouched, and the old
values of the two `RELEASE_*` variables are the rollback.

**Failed restore.** The script stops at the first failing step, prints the reason, stops the target's containers (nothing
keeps running on unverified data) and keeps the half-built target volumes for inspection. The source backup and the live volumes are unchanged, so the live stack keeps running (or, after
`--replace-live`, start it again with the original env). Fix the cause (damaged file → use the previous backup; password or
env problem → fix `.env.production`) and restore into a new `--project` name. Remove a failed target only after inspecting it:
`docker compose -p <target> down; docker volume rm <target>_postgres <target>_minio`.

## Upgrade

Step 1 is the web image: build it from the same commit as the backend and migrate images with
`bash scripts/release/build-web-image.sh` (it writes only `platform-release-web:local`), then tag it with the release tag:
`docker tag platform-release-web:local platform-release-web:<tag>`. Load the other two images under
`platform-release-backend:<tag>` and `platform-release-migrate:<tag>`, then:

    export BACKUP_ROOT=/srv/platform-backups
    bash scripts/release/upgrade.sh <tag>

`upgrade.sh <tag>` needs all three `:<tag>` images and refuses before stopping anything when one is missing. Do not run
`build-web-image.sh` again between tagging and the upgrade (it moves `:local`).

`upgrade.sh local` (images already tagged `:local`) does not need `:<tag>` images. It warns when `platform-release-web:local`
is older than `platform-release-backend:local` or missing: rebuild the web image first unless a stale bundle is intended.
The nested backup still records the containers' images, so preloaded `:local` tags do not mislabel the data.

1. Compares the applied migrations of the database (`drizzle.__drizzle_migrations`, count and hashes) with the migrations of the
   new migrate image (read-only). Refuses if the database holds a migration the image does not know or if they diverge.
2. Tags the running images `:pre-<UTC timestamp>` (the rollback set): backend, migrate and the web image of the **running
   `edge` container** (not the mutable `:local` tag).
3. Stops `backend`, runs `backup.sh --keep-stopped` and `verify-backup.sh`, all under the maintenance lock. If either fails the script stops: nothing is
   migrated and the backend stays stopped.
4. Moves the new backend, migrate and web images onto the `:local` tags together and runs the `migrate` job. On a non-zero exit
   the backend **stays stopped** and the script prints the journal inspection command, the `restore.sh` command for the
   matching backup and the image rollback tags (backend, migrate and web).
5. `up -d`, then waits for `/health/ready` 200.

**Restored installation (pin file present).** When `docker-compose.restore-<project>.yml` exists next to the compose file,
steps 4 and 5 never use the old pins: the script writes a temporary pin file with the immutable ids of the target backend,
migrate and web images (the pin file's existence and these ids are read once, under the maintenance lock, before anything is stopped) and passes it to the `migrate` job and the final `up -d`. After
`/health/ready` is 200 it replaces the restore pin file atomically with those ids and keeps the previous one as
`docker-compose.restore-<project>.yml.pre-<UTC timestamp>` (printed; to roll the pins back, move it over the pin file together
with the image rollback). The rename is the commit point. On any failure before it the original pin file is left untouched; on any failure after it (error or signal) the output says the pin file already names the new images and prints `mv -f '<pre>' '<pin>'` for the rollback, to run together with the image rollback. Every failure after the backup prints the same rollback block once (restore command, pin-file state, image rollback tags). Without a
pin file nothing of this applies.

No down migrations exist. The script never runs a fixture seed or `bootstrap`.

**Migration failure: decide.** First inspect what was committed: `select id, hash, created_at from drizzle.__drizzle_migrations
order by id desc limit 5` (inside the postgres container). Migrations are applied in order; a failed one is not recorded. Then:

- *Forward-fix:* correct the cause (a data problem, a fixed image) and run `upgrade.sh` again; it takes a new backup first.
- *Restore the matched set:* retag the `:pre-<ts>` images (backend, migrate, web) to `:local` (a restored installation must not start the previous images from its unchanged pin file once any pending migration was applied: restore the backup into a new project, which writes that project's own pin file; the script prints which case applies) and `restore.sh` the backup the upgrade printed, as above.
- The identity cutover is resumable only for its own case (pre-0076 → platform identity) and not part of this script.

Do not start the backend by hand on a partially migrated database.

**Version-specific step (#1323, the 개선 실행 space was retired).** On any database that ran an older version, the startup sync
only marks the space undeclared; the registry-owned Managed System 「개선 실행」 (`space:improvement`) stays active and still
appears in the feature pickers (system scope selector, survey and cluster creation). After the upgrade, archive it under 업무 흐름
설정 › 시스템 (archiving an undeclared system is allowed). No migration does this. A database that never ran 「개선 실행」 needs nothing.

## Open items

- Off-host copy, encryption of the copy and alerting on a failed cron run are the operator's. A cron run refused by the
  maintenance lock exits 3 and mails like any failure; the log holds the holder's pid and the lock path.
- Backup while the backend runs (online) is not supported; the stop window is the price of a consistent pair.
