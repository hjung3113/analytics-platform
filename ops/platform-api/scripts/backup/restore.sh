#!/usr/bin/env bash
#
# Restore a backup into an ISOLATED compose project and verify it (#1266 b6, OPS-04).
#
#   bash scripts/backup/restore.sh <backup-dir> --project <new-project> [--env-file FILE] [--compose-file FILE]
#   RESTORE_CONFIRM=<project> bash scripts/backup/restore.sh <backup-dir> --project <live-project> --replace-live
#
# The target gets NEW volumes `<project>_postgres` and `<project>_minio` (the compose file pins volume names through
# RELEASE_POSTGRES_VOLUME / RELEASE_MINIO_VOLUME, so a different project name alone would not isolate them). The script
# refuses before any start or write if either name equals a source/live volume or already exists. It never touches the
# live volumes: --replace-live (only for the live/source project name, with RESTORE_CONFIRM=<project>) just stops the live
# containers first, because the target uses the same project name; the live volumes stay as the rollback.
#
# Order (the target cluster is created WITHOUT init.sql; compose override needs docker compose >= 2.24):
#   verify-backup -> empty postgres -> globals.sql (fail on error; only the bootstrap `postgres` role lines skipped)
#   -> CREATE DATABASE platform OWNER platform_migrate -> CREATE EXTENSION vector -> pg_restore --exit-on-error
#   (owners and ACLs; the extension entries are skipped, it exists) -> CONNECT grants -> set-role-passwords (passwords
#   from the env file) -> DELETE FROM core.sessions -> checks (row counts == manifest, sessions empty, roles, ownership,
#   extension, grants) -> minio + bucket, mirror back, object count/bytes/sha256 == manifest -> backend /health/ready
#   under platform_app -> journal digest == manifest. Verification never runs migrate or bootstrap. The restored stack
#   is left STOPPED with its data; the switch-over commands are printed. On any failure the script stops and prints the
#   failed-restore branch; the source is untouched and the half-built target is kept for inspection.
#
# Images: the local backend/migrate/web images must be the ones recorded in the manifest; otherwise (or when the manifest
# has images.verified false) the restore is refused unless RESTORE_IMAGE_MISMATCH_OK=1. Either way the read-only journal
# comparison (restored ledger vs the migrate image) ALWAYS runs before any backend starts, and zero pending/divergent
# migrations is required. The checked images are pinned by id in docker-compose.restore-<project>.yml next to the compose
# file (kept; the switch-over command uses it with -f), so the launched images are the checked ones.
#
# Verification starts the backend with NOTIFICATION_EMAIL_CHANNEL=mock and blank SMTP_* (temporary override, not the kept
# pin file); the switch-over start uses the operator's real settings. A missing backend/migrate/web image is always refused.
# Every restore holds the target project's maintenance lock from before the first file is written to the end.
#
# Environment: RESTORE_CONFIRM, RESTORE_LIVE_PROJECT (default platform-api), RESTORE_IMAGE_MISMATCH_OK, BACKUP_MC_IMAGE,
# BACKUP_BACKEND_IMAGE / BACKUP_MIGRATE_IMAGE / BACKUP_WEB_IMAGE (default platform-release-{backend,migrate,web}:local),
# STORAGE_S3_BUCKET.

set -Eeuo pipefail
set +x

BK_TAG=restore
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck disable=SC1091
. "$HERE/lib.sh"

BACKUP_DIR=''
PROJECT=''
REPLACE_LIVE=0
ENV_FILE="${BACKUP_ENV_FILE:-$OPS_ROOT/.env.production}"
COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-$OPS_ROOT/docker-compose.production.yml}"

usage() { sed -n '3,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --project) PROJECT="${2:-}"; shift 2 || bk_die '--project needs a value' 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 || bk_die '--env-file needs a value' 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 || bk_die '--compose-file needs a value' 2 ;;
    --replace-live) REPLACE_LIVE=1; shift ;;
    -*) bk_die "unknown argument: $1 (see --help)" 2 ;;
    *) [ -z "$BACKUP_DIR" ] || bk_die 'only one backup directory may be given' 2; BACKUP_DIR="$1"; shift ;;
  esac
done

[ -n "$BACKUP_DIR" ] || bk_die 'usage: restore.sh <backup-dir> --project <new-project> (see --help)' 2
[ -n "$PROJECT" ] || bk_die '--project <new compose project name> is required' 2
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || bk_die "invalid compose project name '$PROJECT'" 2
[ -d "$BACKUP_DIR" ] || bk_die "backup directory not found: $BACKUP_DIR" 2
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

# 1. Files first: nothing else runs on a damaged backup.
bk_log "verifying backup files in $BACKUP_DIR"
bk_verify_dir "$BACKUP_DIR" || bk_die "backup $BACKUP_DIR failed verification (see above); restore stopped"
M="$BACKUP_DIR/manifest.json"
[ "$(bk_m_scalar "$M" identity)" = platform ] || bk_die 'this backup is not on the platform identity'
SRC_PROJECT="$(bk_m_scalar "$M" project)"
DB="$(bk_m_scalar "$M" database)"
[[ "$DB" =~ ^[a-z_]+$ ]] || bk_die "invalid database name in the manifest: '$DB'"
BUCKET="$(bk_m_scalar "$M" bucket)"
LIVE_PROJECT="${RESTORE_LIVE_PROJECT:-platform-api}"

# 2. Live-project guard: same name as the running/source stack needs --replace-live AND RESTORE_CONFIRM=<project>.
IS_LIVE=0
if [ "$PROJECT" = "$LIVE_PROJECT" ] || [ "$PROJECT" = "$SRC_PROJECT" ]; then IS_LIVE=1; fi
if [ "$IS_LIVE" -eq 1 ]; then
  [ "$REPLACE_LIVE" -eq 1 ] || bk_die "project '$PROJECT' is the running/source project. Restore into a NEW project name first, or pass --replace-live together with RESTORE_CONFIRM=$PROJECT."
  [ "${RESTORE_CONFIRM:-}" = "$PROJECT" ] || bk_die "--replace-live needs RESTORE_CONFIRM=$PROJECT in the environment (typed deliberately, not defaulted)"
elif [ "$REPLACE_LIVE" -eq 1 ]; then
  bk_die "--replace-live applies only to the live/source project name ('$LIVE_PROJECT'), not '$PROJECT'"
fi

[ -f "$ENV_FILE" ] || bk_die "env file not found: $ENV_FILE (--env-file)" 2
[ -f "$COMPOSE_FILE" ] || bk_die "compose file not found: $COMPOSE_FILE" 2
command -v docker >/dev/null 2>&1 || bk_die 'docker is required' 2

# 3. Volume isolation (F1): unique new names, none of them a source volume, none existing.
PG_VOL="${PROJECT}_postgres"
MINIO_VOL="${PROJECT}_minio"
[ "$PG_VOL" != "$MINIO_VOL" ] || bk_die 'target volume names are identical'
src_pg="${RELEASE_POSTGRES_VOLUME:-$(bk_env_value "$ENV_FILE" RELEASE_POSTGRES_VOLUME)}"
src_minio="${RELEASE_MINIO_VOLUME:-$(bk_env_value "$ENV_FILE" RELEASE_MINIO_VOLUME)}"
for src in "$src_pg" "$src_minio" feedbackops-release-1060_release-postgres-data feedbackops-release-1060_release-minio-data; do
  [ -n "$src" ] || continue
  [ "$src" != "$PG_VOL" ] && [ "$src" != "$MINIO_VOL" ] || bk_die "target volume '$src' is a source/live volume; choose another --project"
done
for v in "$PG_VOL" "$MINIO_VOL"; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    bk_die "volume '$v' already exists; restore needs fresh volumes (pick a new --project, or remove the old target yourself after checking it)"
  fi
done
cv="$(docker compose version --short 2>/dev/null || echo 0)"
cv="${cv#v}"
IFS=. read -r cv_major cv_minor _ <<<"$cv"
{ [ "${cv_major:-0}" -gt 2 ] || { [ "${cv_major:-0}" -eq 2 ] && [ "${cv_minor:-0}" -ge 24 ]; }; } || bk_die "docker compose >= 2.24 is required (found '$cv')"

# 3b. Image pair: the images started below must be the build this backup was taken with, or provably
# schema-compatible (journal check below, always). Checked before anything starts; the checked image ids are pinned.
IMG_MISMATCH=0
IMAGES_VERIFIED="$(bk_m_section_value "$M" images verified)"
PIN_BACKEND=''; PIN_MIGRATE=''; PIN_WEB=''
for kind in backend migrate web; do
  want_id="$(bk_m_section_value "$M" images "$kind")"
  case "$kind" in
    backend) ref="${BACKUP_BACKEND_IMAGE:-$BK_IMAGE_BACKEND_DEFAULT}" ;;
    migrate) ref="${BACKUP_MIGRATE_IMAGE:-$BK_IMAGE_MIGRATE_DEFAULT}" ;;
    *) ref="${BACKUP_WEB_IMAGE:-$BK_IMAGE_WEB_DEFAULT}" ;;
  esac
  have_id="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null || echo missing)"
  if [ "$kind" = web ] && { [ -z "$want_id" ] || [ "$want_id" = unknown ]; }; then
    bk_log "the backup records no web image (older backup or edge not running); the local web image $ref is used"
  elif [ -z "$want_id" ] || [ "$want_id" = unknown ] || [ "$have_id" != "$want_id" ] || { [ "$kind" = backend ] && [ "$IMAGES_VERIFIED" = false ]; }; then
    bk_log "$kind image $ref is '$have_id'; the backup was taken with '${want_id:-none}'${IMAGES_VERIFIED:+ (images.verified $IMAGES_VERIFIED)}"
    IMG_MISMATCH=1
  fi
  case "$kind" in
    backend) PIN_BACKEND="$have_id" ;;
    migrate) PIN_MIGRATE="$have_id" ;;
    *) PIN_WEB="$have_id" ;;
  esac
done
# A missing image is never acknowledged away: without all three there is nothing to pin, and an unpinned edge would start
# whatever :local holds later. Load the image or retag the :pre-<timestamp> one.
[ "$PIN_BACKEND" != missing ] || bk_die "backend image ${BACKUP_BACKEND_IMAGE:-$BK_IMAGE_BACKEND_DEFAULT} is not on this host; load it first (docker load / retag :pre-<timestamp>). Nothing was started."
[ "$PIN_MIGRATE" != missing ] || bk_die "migrate image ${BACKUP_MIGRATE_IMAGE:-$BK_IMAGE_MIGRATE_DEFAULT} is not on this host; load it first (docker load / retag :pre-<timestamp>). Nothing was started."
[ "$PIN_WEB" != missing ] || bk_die "web image ${BACKUP_WEB_IMAGE:-$BK_IMAGE_WEB_DEFAULT} is not on this host; load it first (docker load / retag :pre-<timestamp>): the restored edge is pinned to it and cannot be verified without it. Nothing was started."
if [ "$IMG_MISMATCH" -eq 1 ]; then
  [ "${RESTORE_IMAGE_MISMATCH_OK:-}" = 1 ] || bk_die "the local backend/migrate/web images are not the pair this backup was taken with (or the backup could not identify them). Load the matching images (docker load / retag :pre-<timestamp>), or set RESTORE_IMAGE_MISMATCH_OK=1 to accept a different build: the restored journal is then compared with the local migrate image and any pending or divergent migration still refuses the restore."
  bk_log 'RESTORE_IMAGE_MISMATCH_OK=1: different images accepted only if the restored journal matches the migrate image exactly'
fi

LIVE_STOPPED=0
TARGET_STARTED=0
fail_hint() {
  local rc=$?
  trap - EXIT ERR
  if [ "$rc" -ne 0 ]; then
    if [ "$TARGET_STARTED" -eq 1 ]; then
      # Stop (never remove) the target before the override file goes away: no mutable service keeps running on
      # unverified data; the data stays in the volumes for inspection.
      if bk_dc stop >/dev/null 2>&1; then bk_log "target project '$PROJECT' stopped (data stays in its volumes)"
      else bk_log "WARNING: could not stop the target project '$PROJECT'; stop it yourself: docker compose -p $PROJECT --env-file <env> -f <compose> stop"; fi
    fi
    [ -z "${PINS_FILE:-}" ] || rm -f -- "$PINS_FILE"
    bk_log "RESTORE FAILED (exit $rc). The source backup and the live volumes were not modified."
    bk_log "Target project '$PROJECT' keeps its half-built volumes for inspection: $PG_VOL, $MINIO_VOL."
    bk_log "Failed-restore branch: read the error above, fix the cause, then restore into a NEW --project name; remove the failed target only after inspecting it:"
    bk_log "  docker compose -p $PROJECT --env-file <env> -f <compose> down; docker volume rm $PG_VOL $MINIO_VOL"
    [ "$LIVE_STOPPED" -eq 0 ] || bk_log "The live project '$PROJECT' was stopped for --replace-live; its volumes are unchanged. Start it again with the original env (unset RELEASE_*_VOLUME overrides): docker compose -p $PROJECT ... up -d"
  fi
  [ -z "${TMP:-}" ] || rm -rf -- "${TMP:?}"
  bk_lock_release
  exit "$rc"
}
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
trap fail_hint EXIT
# The maintenance lock of the TARGET project is taken for every restore (not only --replace-live): the pin file
# docker-compose.restore-<project>.yml is shared state with upgrade.sh, which decides on it under the same lock. A refused
# concurrent run exits here (3) before any file naming the project is written, so it cannot touch the holder's pin or
# override files. The cleanup trap above removes only files this invocation wrote (PINS_FILE is set after the lock).
# For --replace-live the live stack is replaced: no backup or upgrade may run (or start) on it until this restore has finished.
bk_lock_acquire restore
umask 077
TMP="$BACKUP_DIR/../.restore-tmp-$PROJECT-$$"
mkdir -p "$TMP" && chmod 700 "$TMP"
PINS_FILE="$(dirname "$COMPOSE_FILE")/docker-compose.restore-$PROJECT.yml"
bk_write_pins "$PINS_FILE" "$PIN_BACKEND" "$PIN_MIGRATE" "$PIN_WEB" "Written by restore.sh for project $PROJECT from $BACKUP_DIR."
BK_COMPOSE_PINS="$PINS_FILE"
BK_COMPOSE_OVERRIDE="$TMP/no-init.override.yml"
cat >"$BK_COMPOSE_OVERRIDE" <<'YAML'
# Restore target: the cluster is built from globals.sql + pg_restore, so init.sql must NOT be mounted.
services:
  postgres:
    volumes: !override
      - release-postgres-data:/var/lib/postgresql/data
  # Verification only (this file lives in the temp dir and is deleted; the kept switch-over file does not contain it): the
  # copied pg-boss jobs must neither run nor send mail while the restored data is checked, so the backend starts with
  # JOBS_DISABLED (no worker, no cron; pending jobs and sent timestamps stay as copied) and the mock channel, no relay.
  # The switch-over start uses the operator's real settings from .env.production.
  backend:
    environment:
      JOBS_DISABLED: "true"
      NOTIFICATION_EMAIL_CHANNEL: mock
      SMTP_HOST: ""
      SMTP_PORT: ""
      SMTP_USERNAME: ""
      SMTP_PASSWORD: ""
      SMTP_FROM: ""
YAML



if [ "$LIVE_STOPPED" -eq 0 ] && [ "$IS_LIVE" -eq 1 ]; then
  bk_log "--replace-live confirmed: stopping the running '$PROJECT' stack (volumes stay untouched)"
  bk_dc stop >/dev/null
  LIVE_STOPPED=1
fi

# Free port for the verification backend: never the live one.
free_port() {
  local p=13001
  while [ "$p" -lt 13200 ]; do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then printf '%s\n' "$p"; return 0; fi
    p=$((p + 1))
  done
  return 1
}
export RELEASE_POSTGRES_VOLUME="$PG_VOL" RELEASE_MINIO_VOLUME="$MINIO_VOL"
BACKEND_PORT="$(free_port)" || bk_die 'no free port for the verification backend'
export BACKEND_PORT BACKEND_BIND=127.0.0.1
bk_log "target project $PROJECT, volumes $PG_VOL and $MINIO_VOL, verification backend on 127.0.0.1:$BACKEND_PORT"

# 4. Empty cluster.
TARGET_STARTED=1
bk_dc up -d --no-deps --wait postgres >/dev/null
leftover="$(bk_psql -d postgres -c "select count(*) from pg_roles where rolname !~ '^pg_' and rolname <> 'postgres'")"
nodb="$(bk_psql -d postgres -c "select count(*) from pg_database where datname not in ('postgres','template0','template1')")"
{ [ "$leftover" = 0 ] && [ "$nodb" = 0 ]; } || bk_die 'the target cluster is not empty (roles or databases already exist)'

# 5. Globals (fail on error), database, extension, data.
bk_log 'applying globals.sql'
grep -vE '^(CREATE|ALTER) ROLE postgres( |;)' "$BACKUP_DIR/globals.sql" | bk_dc exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f - >/dev/null
bk_psql -d postgres -c "CREATE DATABASE $DB OWNER platform_migrate" >/dev/null
bk_psql -d "$DB" -c 'CREATE EXTENSION vector' >/dev/null
bk_log 'pg_restore (owners and ACLs, exit on first error)'
bk_dc cp "$BACKUP_DIR/platform.dump" postgres:/tmp/platform.dump
bk_dc exec -T postgres sh -c "pg_restore -l /tmp/platform.dump | grep -vE ' EXTENSION - | COMMENT - EXTENSION ' > /tmp/restore.list"
bk_dc exec -T postgres pg_restore --exit-on-error -U postgres -d "$DB" -L /tmp/restore.list /tmp/platform.dump
bk_dc exec -T postgres rm -f /tmp/platform.dump /tmp/restore.list
bk_psql -d postgres -c "GRANT CONNECT ON DATABASE $DB TO platform_app, platform_migrate" >/dev/null

# 6. Role passwords from the operator env (roles now exist under their final names).
bk_log 'set-role-passwords'
bk_dc run --rm --no-deps set-role-passwords >&2

# 7. Sessions: nobody stays logged in.
bk_psql -d "$DB" -c 'DELETE FROM core.sessions' >/dev/null

# 8. Database checks, before any mutable service starts.
check() { # check <label> <sql> <expected>
  local got
  got="$(bk_psql -d "$DB" -c "$2")"
  [ "$got" = "$3" ] || bk_die "check failed: $1 (got '$got', expected '$3')"
  bk_log "ok: $1"
}
bad_tables=0
while read -r t want; do
  [ -n "$t" ] || continue
  [[ "$t" =~ ^[a-z0-9_]+\.[a-z0-9_]+$ ]] || bk_die "invalid table name in the manifest: $t"
  got="$(bk_psql -d "$DB" -c "select count(*) from $t")"
  if [ "$got" != "$want" ]; then bk_log "row count differs: $t restored=$got manifest=$want"; bad_tables=1; fi
done <<<"$(bk_m_section "$M" rowCounts)"
[ "$bad_tables" -eq 0 ] || bk_die 'row counts differ from the manifest'
bk_log 'ok: row counts equal the manifest'
check 'core.sessions is empty' 'select count(*) from core.sessions' 0
check 'login roles and attributes' "select string_agg(rolname || ':' || rolcanlogin::text || ':' || (rolpassword is not null)::text, ',' order by rolname) from pg_authid where rolname in ('platform_app','platform_migrate')" 'platform_app:true:true,platform_migrate:true:true'
check 'no fops_ roles' "select count(*) from pg_roles where rolname like 'fops\\_%'" 0
check 'owner roles are NOLOGIN' "select count(*) from pg_roles where rolname like 'platform\\_%\\_owner' and rolcanlogin" 0
check 'owner role memberships' "select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles g on g.oid = m.member where g.rolname = 'platform_migrate' and r.rolname like 'platform\\_%\\_owner'" 7
check 'database owner' "select pg_catalog.pg_get_userbyid(datdba) from pg_database where datname = '$DB'" platform_migrate
check 'extension vector' "select count(*) from pg_extension where extname = 'vector'" 1
check 'no product table owned by the superuser' "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core','permission','voc','voc_cluster','finding','task','task_request','survey','knowledge','pgboss','drizzle') and c.relkind in ('r','p') and c.relowner = (select oid from pg_roles where rolname = 'postgres')" 0
check 'runtime grants (platform_app)' "select has_database_privilege('platform_app','$DB','CONNECT') and has_schema_privilege('platform_app','core','USAGE') and has_table_privilege('platform_app','core.actors','SELECT')" t
check 'journal digest' "select encode(sha256(convert_to(string_agg(hash, E'\\n' order by id) || E'\\n', 'UTF8')), 'hex') from drizzle.__drizzle_migrations" "$(bk_m_section_value "$M" journal digest)"

# 8b. Journal check, ALWAYS (an image id match is not enough): the restored ledger must equal what the migrate image
# expects. Read-only, never migrate; no backend has started yet.
bk_db_hashes >"$TMP/db-hashes" || bk_die 'could not read the restored migration journal'
bk_image_hashes "$PIN_MIGRATE" >"$TMP/img-hashes"
pend="$(bk_journal_pending "$TMP/db-hashes" "$TMP/img-hashes")" || bk_die 'the restored journal and the migrate image diverge; no backend was started'
[ "$pend" = 0 ] || bk_die "the migrate image would apply $pend pending migration(s) to the restored data; restore refuses (a backend on an older schema is not verified). Use the matching images; no backend was started."
bk_log 'ok: restored journal equals the migrate image (0 pending)'

# 9. Objects: bucket first, mirror back, compare keys/bytes/sha256 through a second export.
bk_log "restoring bucket $BUCKET"
bk_dc up -d --no-deps --wait minio >/dev/null
bk_mc_env
bk_mc '' mb --ignore-existing "bk/$BUCKET" >&2 || bk_die "could not create bucket $BUCKET"
bk_mc "$BACKUP_DIR/objects" mirror /data "bk/$BUCKET" >&2 || bk_die 'mirror into the target bucket failed'
want_stats="$(bk_m_section_value "$M" objects count) $(bk_m_section_value "$M" objects bytes)"
got_stats="$(bk_bucket_stats "$BUCKET")"
[ "$got_stats" = "$want_stats" ] || bk_die "restored bucket has '$got_stats' (count bytes), manifest has '$want_stats'"
mkdir -p "$TMP/export" && chmod 700 "$TMP/export"
bk_mc "$TMP/export" mirror "bk/$BUCKET" /data >&2 || bk_die 'could not export the restored bucket for checking'
bk_inventory "$TMP/export" | cmp -s - "$BACKUP_DIR/objects.sha256" || bk_die 'restored object checksums differ from objects.sha256'
unset MC_HOST_bk
bk_log "ok: $want_stats objects (count bytes) and sha256 inventory equal the backup"

# 10. Backend under the runtime role, no migrate, no bootstrap, no dependencies started.
bk_log 'starting backend (platform_app) and waiting for /health/ready'
bk_dc up -d --no-deps backend >/dev/null
ready=0
i=0
while [ "$i" -lt 60 ]; do
  if bk_dc exec -T backend node -e "fetch('http://127.0.0.1:3001/health/ready').then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then ready=1; break; fi
  i=$((i + 1)); sleep 2
done
[ "$ready" -eq 1 ] || bk_die 'backend did not become ready (200 /health/ready) within 120 s on the restored data'
bk_log 'ok: /health/ready 200'

# 11. Leave the restored stack stopped, with its data.
bk_dc stop >/dev/null
bk_log "RESTORE VERIFIED into project '$PROJECT' (volumes $PG_VOL, $MINIO_VOL). Stack is stopped."
bk_log "Switch traffic: stop the old stack's edge/backend, then start this one with the SAME env plus"
bk_log "  RELEASE_POSTGRES_VOLUME=$PG_VOL RELEASE_MINIO_VOLUME=$MINIO_VOL (put both lines in .env.production),"
bk_log "  and run (keep $PINS_FILE: it pins the verified images; use it on every start of this project; upgrade.sh keeps it current):"
bk_log "  docker compose -p $PROJECT --env-file .env.production -f $COMPOSE_FILE -f $PINS_FILE up -d"
trap - EXIT
rm -rf -- "${TMP:?}"
bk_lock_release
