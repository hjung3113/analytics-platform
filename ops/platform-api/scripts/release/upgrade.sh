#!/usr/bin/env bash
#
# Upgrade entry point of the production stack (#1266 b6, OPS-05).
#
#   BACKUP_ROOT=/srv/platform-backups bash scripts/release/upgrade.sh <local | new-image-tag> [--project NAME]
#                                                                    [--env-file FILE] [--compose-file FILE]
#
# The new images must already exist on this host (build or `docker load` them first):
#   local        they are already tagged platform-release-backend:local and platform-release-migrate:local
#   <tag>        platform-release-backend:<tag> and platform-release-migrate:<tag> exist; they are retagged to :local
#
# Steps (stops at the first failure; the backend is NOT started again until the migration succeeded):
#   1. data services up, supported identity (platform, v0.24.0 or later), current journal vs the target migrate image's
#      journal (read-only compare of applied migration hashes with the hashes of the image's migrations; refuses on divergence)
#   2. current images tagged :pre-<UTC timestamp> (the rollback pair)
#   3. stop the backend (writers and jobs), backup.sh --keep-stopped, verify-backup.sh; either failing = stop here
#   4. only now the new images take the :local tags, then the migrate job runs (drizzle-kit migrate); a non-zero exit leaves
#      the backend stopped and prints the restore command for the matching backup and the image rollback command
#   5. docker compose up -d, then /health/ready must return 200
# No down migrations. No fixture seed or bootstrap is ever run. A pre-0076 (feedbackops/fops_*) install is refused by the
# backup step: finish the identity cutover first (docs/architecture/platform-api/release/backup-restore-upgrade.md).

set -Eeuo pipefail
set +x

BK_TAG=upgrade
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$HERE/../.." && pwd)"
BACKUP_SCRIPTS="$OPS_ROOT/scripts/backup"
# shellcheck disable=SC1091
. "$BACKUP_SCRIPTS/lib.sh"

PROJECT="${BACKUP_PROJECT:-platform-api}"
ENV_FILE="${BACKUP_ENV_FILE:-$OPS_ROOT/.env.production}"
COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-$OPS_ROOT/docker-compose.production.yml}"
TARGET=''

usage() { sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --project) PROJECT="${2:-}"; shift 2 || bk_die '--project needs a value' 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 || bk_die '--env-file needs a value' 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 || bk_die '--compose-file needs a value' 2 ;;
    -*) bk_die "unknown argument: $1 (see --help)" 2 ;;
    *) [ -z "$TARGET" ] || bk_die 'only one target (local or an image tag) may be given' 2; TARGET="$1"; shift ;;
  esac
done

[ -n "$TARGET" ] || bk_die 'usage: upgrade.sh <local | new-image-tag> (see --help)' 2
[[ "$TARGET" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || bk_die "invalid image tag '$TARGET'" 2
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || bk_die "invalid compose project name '$PROJECT'" 2
bk_check_root
[ -f "$ENV_FILE" ] || bk_die "env file not found: $ENV_FILE (--env-file)" 2
[ -f "$COMPOSE_FILE" ] || bk_die "compose file not found: $COMPOSE_FILE" 2
command -v docker >/dev/null 2>&1 || bk_die 'docker is required' 2

BACKEND_REPO="${BACKUP_BACKEND_IMAGE_REPO:-platform-release-backend}"
MIGRATE_REPO="${BACKUP_MIGRATE_IMAGE_REPO:-platform-release-migrate}"
NEW_MIGRATE="$MIGRATE_REPO:$TARGET"
NEW_BACKEND="$BACKEND_REPO:$TARGET"
docker image inspect "$NEW_MIGRATE" >/dev/null 2>&1 || bk_die "image $NEW_MIGRATE not found on this host; build or load it first"
docker image inspect "$NEW_BACKEND" >/dev/null 2>&1 || bk_die "image $NEW_BACKEND not found on this host; build or load it first"

tmp="$(mktemp -d)"
trap 'rc=$?; trap - EXIT; rm -rf -- "${tmp:?}"; [ "$rc" -eq 0 ] || bk_log "UPGRADE STOPPED (exit $rc). The backend was not started again by this script."; exit "$rc"' EXIT

# 1. Compare journals without changing anything.
bk_log "project $PROJECT: data services up"
bk_dc up -d --no-deps --wait postgres minio >/dev/null
bk_db_hashes >"$tmp/db" || bk_die 'could not read the migration journal of database platform (a pre-0076 feedbackops install must finish the identity cutover first)'
bk_image_hashes "$NEW_MIGRATE" >"$tmp/img"
pending="$(bk_journal_pending "$tmp/db" "$tmp/img")" || bk_die 'the database journal and the target migrate image diverge; do not upgrade. Use an image built from a descendant of the installed version, or restore a matching backup.'
bk_log "migrations applied: $(grep -c . "$tmp/db"); pending in the target image: $pending"

# 2. Rollback pair: tag what runs now.
TS="$(date -u +%Y%m%dT%H%M%SZ)"
PRE_BACKEND=''
PRE_MIGRATE=''
cid="$(bk_dc ps -a -q backend | head -n 1 || true)"
if [ -n "$cid" ]; then
  id="$(docker inspect --format '{{.Image}}' "$cid")"
  docker tag "$id" "$BACKEND_REPO:pre-$TS" && PRE_BACKEND="$BACKEND_REPO:pre-$TS"
fi
cid="$(bk_dc ps -a -q migrate | head -n 1 || true)"
if [ -n "$cid" ]; then
  id="$(docker inspect --format '{{.Image}}' "$cid")"
  docker tag "$id" "$MIGRATE_REPO:pre-$TS" && PRE_MIGRATE="$MIGRATE_REPO:pre-$TS"
fi
[ -n "$PRE_BACKEND" ] || bk_log "WARNING: no backend container found; no :pre-$TS rollback tag for the backend image"
[ -z "$PRE_BACKEND" ] || bk_log "rollback images: $PRE_BACKEND ${PRE_MIGRATE:-(no migrate container)}"

# 3. Quiesce, back up, verify. A failure here leaves the backend stopped.
bk_log 'stopping backend (writers and jobs)'
bk_dc stop backend >/dev/null
BACKUP_DIR="$(BACKUP_PROJECT="$PROJECT" BACKUP_ENV_FILE="$ENV_FILE" BACKUP_COMPOSE_FILE="$COMPOSE_FILE" \
  BACKUP_BACKEND_IMAGE="${BACKUP_BACKEND_IMAGE:-${PRE_BACKEND:-$BACKEND_REPO:local}}" \
  BACKUP_MIGRATE_IMAGE="${BACKUP_MIGRATE_IMAGE:-${PRE_MIGRATE:-$MIGRATE_REPO:local}}" \
  bash "$BACKUP_SCRIPTS/backup.sh" --keep-stopped)" || bk_die 'backup failed; nothing was migrated and the backend stays stopped'
[ -d "$BACKUP_DIR" ] || bk_die 'backup.sh did not report a backup directory'
bash "$BACKUP_SCRIPTS/verify-backup.sh" "$BACKUP_DIR" || bk_die "verification of $BACKUP_DIR failed; nothing was migrated and the backend stays stopped"
RESTORE_CMD="BACKUP_ROOT=\"$BACKUP_ROOT\" bash $BACKUP_SCRIPTS/restore.sh \"$BACKUP_DIR\" --project <new-project>"

# 4. Migrate with the new images.
if [ "$TARGET" != local ]; then
  docker tag "$NEW_BACKEND" "$BACKEND_REPO:local"
  docker tag "$NEW_MIGRATE" "$MIGRATE_REPO:local"
fi
bk_log 'running the migrate job'
if ! bk_dc run --rm --no-deps migrate >&2; then
  bk_log 'MIGRATION FAILED. The backend stays stopped.'
  bk_log "1. Inspect what was applied: docker compose -p $PROJECT --env-file <env> -f <compose> exec -T postgres psql -U postgres -d platform -c 'select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 5'"
  bk_log "2. Forward-fix (new image, rerun this script) or restore the matching data and image pair:"
  bk_log "   $RESTORE_CMD"
  [ -z "$PRE_BACKEND" ] || bk_log "   image rollback: docker tag $PRE_BACKEND $BACKEND_REPO:local${PRE_MIGRATE:+; docker tag $PRE_MIGRATE $MIGRATE_REPO:local}"
  exit 1
fi

# 5. Start and check readiness.
bk_log 'starting the stack'
bk_dc up -d >/dev/null
ready=0
i=0
while [ "$i" -lt 60 ]; do
  if bk_dc exec -T backend node -e "fetch('http://127.0.0.1:3001/health/ready').then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))" >/dev/null 2>&1; then ready=1; break; fi
  i=$((i + 1)); sleep 2
done
if [ "$ready" -ne 1 ]; then
  bk_log 'backend not ready (200 /health/ready) within 120 s after the upgrade. Read: docker compose ... logs backend'
  bk_log "   restore the pre-upgrade pair if needed: $RESTORE_CMD"
  exit 1
fi
bk_log "UPGRADE OK. Backup taken first: $BACKUP_DIR"
