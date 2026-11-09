#!/usr/bin/env bash
#
# Paired PostgreSQL + MinIO backup of the production stack (#1266 b6, OPS-04).
#
#   BACKUP_ROOT=/srv/platform-backups bash scripts/backup/backup.sh [--project NAME] [--env-file FILE]
#                                                                  [--compose-file FILE] [--keep-stopped]
#
# One run = one directory <BACKUP_ROOT>/<UTC timestamp>/ (mode 0700, files 0600):
#   platform.dump    pg_dump -Fc of database `platform`, every schema incl. pgboss and drizzle; the rows of
#                    core.sessions are NOT in it (the table definition is), restore needs no live session
#   globals.sql      pg_dumpall --globals-only --no-role-passwords (roles and memberships, no password)
#   objects/         mirror of the attachment bucket;  objects.sha256  sha256 inventory of it
#   manifest.json    timestamp, identity, image ids (backend, migrate, web) with images.verified, journal state, row counts,
#                    object count/bytes, file checksums
#
# Quiesce: the backend (HTTP writers AND the pg-boss jobs, one process) is stopped while the database and the bucket
# are captured, so the pair is consistent; downtime = capture time (printed). `edge` and the data services stay up;
# the edge answers 502 meanwhile. Standalone runs start the backend again; --keep-stopped (used by upgrade.sh) does not.
# Online backup is not supported.
#
# One maintenance lock per installation (ops/platform-api/.maintenance/<project>.lock) is held from before the backend is
# looked at until the final restart or failure exit; upgrade.sh holds it and its nested backup runs under it. A second
# backup/upgrade exits 3 at once, touching nothing. A stale lock is reported with its holder pid, never taken over.
#
# Images: the manifest records the image ids of the containers that produced the data (backend, the last successful
# migrate run, the edge), not the mutable :local tags. If the backend container's image cannot be identified the backup
# still runs, images.backend is empty and images.verified is false (restore then treats it as a mismatch).
#
# Runs on the docker host against the compose project; psql/pg_dump run inside the postgres container, the bucket is
# mirrored with mc from the pinned MinIO server image on the project network. No credential is written to a file, log or argument:
# the MinIO key reaches mc through an exported MC_HOST_bk variable that docker passes by name.
#
# Supported identity: database `platform` with roles platform_* (v0.24.0 and later). A pre-0076 `feedbackops`/fops_* or
# mixed install is refused: run the identity cutover first (ops/platform-api/docs/release/backup-restore-upgrade.md).
#
# Environment: BACKUP_ROOT (required), BACKUP_KEEP (default 7), STORAGE_S3_BUCKET (else read from the env file, default
# platform-attachments), BACKUP_MC_IMAGE (default: the stack's pinned minio/minio image, entrypoint mc), BACKUP_MIGRATE_IMAGE
# (default platform-release-migrate:local; recorded only when its migrations equal the database journal and no migrate
# container is left), BACKUP_MAINTENANCE_DIR (default <ops>/.maintenance).
# stdout: only the final backup directory path. Everything else goes to stderr.

set -Eeuo pipefail
set +x

BK_TAG=backup
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck disable=SC1091
. "$HERE/lib.sh"

PROJECT="${BACKUP_PROJECT:-platform-api}"
ENV_FILE="${BACKUP_ENV_FILE:-$OPS_ROOT/.env.production}"
COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-$OPS_ROOT/docker-compose.production.yml}"
KEEP_STOPPED=0

usage() { sed -n '3,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --project) PROJECT="${2:-}"; shift 2 || bk_die '--project needs a value' 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 || bk_die '--env-file needs a value' 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 || bk_die '--compose-file needs a value' 2 ;;
    --keep-stopped) KEEP_STOPPED=1; shift ;;
    *) bk_die "unknown argument: $1 (see --help)" 2 ;;
  esac
done

[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || bk_die "invalid compose project name '$PROJECT'" 2
bk_check_root
bk_check_keep
[ -f "$ENV_FILE" ] || bk_die "env file not found: $ENV_FILE (--env-file)" 2
[ -f "$COMPOSE_FILE" ] || bk_die "compose file not found: $COMPOSE_FILE" 2
command -v docker >/dev/null 2>&1 || bk_die 'docker is required' 2

umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_ROOT/$STAMP"
WORK="$BACKUP_ROOT/.tmp-$STAMP-$$"
[ ! -e "$FINAL" ] || bk_die "backup directory $FINAL already exists; wait one second and rerun" 2

BACKEND_WAS_RUNNING=0
BACKEND_STOPPED=0
STOP_AT=0
RESTART_FAILED=0
restart_backend() {
  if [ "$BACKEND_STOPPED" -eq 1 ] && [ "$KEEP_STOPPED" -eq 0 ] && [ "$BACKEND_WAS_RUNNING" -eq 1 ]; then
    if bk_dc start backend >/dev/null 2>&1; then
      bk_log 'backend started again'
    else
      RESTART_FAILED=1
      bk_log 'ERROR: could not start the backend again; it is STOPPED. Start it: docker compose -p '"$PROJECT"' --env-file <env> -f <compose> start backend'
    fi
    BACKEND_STOPPED=0
  fi
}
cleanup() {
  local rc=$?
  # No second signal may cut the restart and the lock release short. No child is running here: bash runs a trap only
  # between commands, so an interrupt waits for the active docker call and this cleanup then restarts and releases.
  trap '' INT TERM HUP
  trap - EXIT
  restart_backend
  bk_lock_release
  if [ -d "$WORK" ]; then
    [ "$rc" -eq 0 ] || bk_log "failed; partial files removed: $WORK"
    rm -rf -- "${WORK:?}"
  fi
  [ "$rc" -eq 0 ] || { [ "$KEEP_STOPPED" -eq 0 ] || [ "$BACKEND_STOPPED" -eq 0 ] || bk_log 'backend left stopped (--keep-stopped)'; }
  exit "$rc"
}
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
trap cleanup EXIT
bk_lock_acquire backup
bk_require_mc_image

# 1. Data services up (no dependencies started), identity check.
bk_log "project $PROJECT: starting postgres and minio if needed"
bk_dc up -d --no-deps --wait postgres minio >/dev/null
ident="$(bk_psql -d postgres -c "select (select count(*) from pg_database where datname='platform') || ' ' || (select count(*) from pg_database where datname='feedbackops') || ' ' || (select count(*) from pg_roles where rolname in ('platform_app','platform_migrate')) || ' ' || (select count(*) from pg_roles where rolname like 'fops\\_%')")"
if [ "$ident" != '1 0 2 0' ]; then
  bk_die "unsupported identity (database platform / feedbackops / platform_* roles / fops_* roles = '$ident'). Backup supports installs on the platform identity (v0.24.0 and later). A pre-0076 or mixed install must finish the identity cutover first: ops/platform-api/docs/release/oidc-and-images.md and apps/platform-api/docs/04-database-and-migrations.md."
fi
IDENTITY=platform
BUCKET="$(bk_bucket)"
MIGRATE_IMAGE="${BACKUP_MIGRATE_IMAGE:-$BK_IMAGE_MIGRATE_DEFAULT}"
# Fail closed: an error while asking compose is not "backend stopped" (the dump would then run against live writers).
if ! RUNNING_SERVICES="$(bk_dc ps --status running --services)"; then
  bk_die 'could not read the backend state (docker compose ps failed); nothing was dumped, the backend was not touched'
fi
if printf '%s\n' "$RUNNING_SERVICES" | grep -qx backend; then BACKEND_WAS_RUNNING=1; fi

mkdir -p "$WORK/objects"
chmod 700 "$WORK" "$WORK/objects"

# 1b. Images that produced this data, read from the containers (never from the mutable :local tags). Done before the stop;
# the lock keeps them from changing meanwhile.
BACKEND_ID="$(bk_container_image backend)" || BACKEND_ID=''
WEB_ID="$(bk_container_image edge)" || WEB_ID=''
MIGRATE_ID="$(bk_container_image migrate ok)" || MIGRATE_ID=''
if [ -z "$MIGRATE_ID" ]; then
  # `run --rm` leaves no container: trust the migrate image ref only if its migrations are exactly the applied ones.
  if bk_db_hashes >"$WORK/.db-hashes" 2>/dev/null && ( bk_image_hashes "$MIGRATE_IMAGE" ) >"$WORK/.img-hashes" 2>/dev/null \
    && [ "$(bk_journal_pending "$WORK/.db-hashes" "$WORK/.img-hashes" 2>/dev/null)" = 0 ]; then
    MIGRATE_ID="$(docker image inspect --format '{{.Id}}' "$MIGRATE_IMAGE" 2>/dev/null)" || MIGRATE_ID=''
  fi
  rm -f -- "$WORK/.db-hashes" "$WORK/.img-hashes"
fi
IMAGES_VERIFIED=true
if [ -z "$BACKEND_ID" ]; then
  IMAGES_VERIFIED=false
  bk_log 'WARNING: the backend container image could not be identified; the backup runs, but images.verified is false and a restore will treat the images as a mismatch'
fi
[ -n "$MIGRATE_ID" ] || bk_log 'note: no migrate image could be identified for this data; restore decides by the journal check'

# 2. Quiesce: stop the backend (writers and pg-boss jobs).
if [ "$BACKEND_WAS_RUNNING" -eq 1 ]; then
  bk_log 'stopping backend (writers and jobs)'
  # Marked before the call: a signal that lands while docker stops it must still lead to a restart.
  BACKEND_STOPPED=1
  bk_dc stop backend >/dev/null
fi
STOP_AT="$(date +%s)"

# 3. Database: custom-format dump (no session rows), globals without passwords, journal and counts.
bk_log 'dumping database platform'
bk_dc exec -T postgres pg_dump -U postgres -d platform -Fc --exclude-table-data=core.sessions >"$WORK/platform.dump"
bk_dc exec -T postgres pg_dumpall -U postgres --globals-only --no-role-passwords >"$WORK/globals.sql"
[ -s "$WORK/platform.dump" ] && [ -s "$WORK/globals.sql" ] || bk_die 'database dump is empty'

tables="$(bk_psql -d platform -c "select t from unnest(string_to_array('$(printf '%s' "$BK_COUNT_TABLES" | tr ' ' ',')', ',')) t where to_regclass(t) is not null")"
case $'\n'"$tables"$'\n' in *$'\ncore.workspaces\n'*) ;; *) bk_die 'core.workspaces is missing: this is not a platform database' ;; esac
case $'\n'"$tables"$'\n' in *$'\ndrizzle.__drizzle_migrations\n'*) ;; *) bk_die 'the drizzle journal is missing' ;; esac
union=''
while IFS= read -r t; do
  [ -n "$t" ] || continue
  union="$union${union:+ union all }select '$t', count(*) from $t"
done <<<"$tables"
COUNTS="$(bk_psql -d platform -c "$union")"
bk_db_hashes >"$WORK/.journal"
[ -s "$WORK/.journal" ] || bk_die 'the drizzle journal is empty'
JOURNAL_COUNT="$(grep -c . "$WORK/.journal")"
JOURNAL_LAST="$(tail -n 1 "$WORK/.journal")"
JOURNAL_DIGEST="$(bk_sha256_text <"$WORK/.journal")"
rm -f -- "$WORK/.journal"

# 4. Objects: mirror, then compare with an independent listing of the bucket.
bk_log "mirroring bucket $BUCKET"
bk_mc_env
bk_mc "$WORK/objects" mirror "bk/$BUCKET" /data >&2 || bk_die "mirror of bucket $BUCKET failed"
src_stats="$(bk_bucket_stats "$BUCKET")"
bk_inventory "$WORK/objects" >"$WORK/objects.sha256"
loc_stats="$(bk_tree_stats "$WORK/objects")"
unset MC_HOST_bk
[ "$src_stats" = "$loc_stats" ] || bk_die "bucket listing ($src_stats) and mirrored files ($loc_stats) disagree (count bytes)"
OBJ_COUNT="${loc_stats% *}"
OBJ_BYTES="${loc_stats#* }"

# 5. Capture finished: the pair is consistent. Record the downtime.
DOWN="$(( $(date +%s) - STOP_AT ))"
bk_log "capture finished; backend was stopped for ${DOWN}s"

# 6. Manifest (checksums of the payload files and the inventory; the manifest does not checksum itself).
{
  printf '{\n'
  printf '  "format": 1,\n'
  printf '  "createdAt": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "identity": "%s",\n' "$IDENTITY"
  printf '  "database": "platform",\n'
  printf '  "project": "%s",\n' "$PROJECT"
  printf '  "bucket": "%s",\n' "$BUCKET"
  printf '  "backendDowntimeSeconds": %s,\n' "$DOWN"
  printf '  "images": {\n    "backend": "%s",\n    "migrate": "%s",\n    "web": "%s",\n    "verified": %s\n  },\n' "$BACKEND_ID" "$MIGRATE_ID" "$WEB_ID" "$IMAGES_VERIFIED"
  printf '  "journal": {\n    "count": %s,\n    "lastHash": "%s",\n    "digest": "%s"\n  },\n' "$JOURNAL_COUNT" "$JOURNAL_LAST" "$JOURNAL_DIGEST"
  printf '  "rowCounts": {\n'
  printf '%s\n' "$COUNTS" | awk -F'|' 'NF == 2 { lines[++n] = sprintf("    \"%s\": %s", $1, $2) } END { for (i = 1; i <= n; i++) printf "%s%s\n", lines[i], (i < n ? "," : "") }'
  printf '  },\n'
  printf '  "objects": {\n    "count": %s,\n    "bytes": %s\n  },\n' "$OBJ_COUNT" "$OBJ_BYTES"
  printf '  "files": {\n    "globals.sql": "%s",\n    "objects.sha256": "%s",\n    "platform.dump": "%s"\n  }\n' \
    "$(bk_sha256 "$WORK/globals.sql")" "$(bk_sha256 "$WORK/objects.sha256")" "$(bk_sha256 "$WORK/platform.dump")"
  printf '}\n'
} >"$WORK/manifest.json"

find "$WORK" -type d -exec chmod 700 {} +
find "$WORK" -type f -exec chmod 600 {} +
mv -- "$WORK" "$FINAL"

# 7. Backend back (standalone), then verify what was written and apply retention.
restart_backend
bk_log "verifying $FINAL"
bash "$HERE/verify-backup.sh" "$FINAL" >&2
removed="$(bk_retention "$BACKUP_ROOT" "$BACKUP_KEEP" "$STAMP")"
[ -z "$removed" ] || bk_log "retention (keep $BACKUP_KEEP) removed: $(printf '%s' "$removed" | tr '\n' ' ')"
bk_log "backup complete: $FINAL (database + $OBJ_COUNT objects / $OBJ_BYTES bytes)"
printf '%s\n' "$FINAL"
if [ "$RESTART_FAILED" -eq 1 ]; then
  bk_log "BACKUP IS VALID ($FINAL) but the backend could NOT be started again and is stopped; start it, then check /health/ready."
  exit 1
fi
