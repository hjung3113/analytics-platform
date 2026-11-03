#!/usr/bin/env bash
#
# Upgrade entry point of the production stack (#1266 b6, OPS-05).
#
#   BACKUP_ROOT=/srv/platform-backups bash scripts/release/upgrade.sh <local | new-image-tag> [--project NAME]
#                                                                    [--env-file FILE] [--compose-file FILE]
#
# The new images must already exist on this host (build or `docker load` them first; the web image comes from
# scripts/release/build-web-image.sh run at the same commit, then `docker tag platform-release-web:local platform-release-web:<tag>`):
#   local        they are already tagged platform-release-{backend,migrate,web}:local (warns when the web image is older
#                than the backend image)
#   <tag>        platform-release-{backend,migrate,web}:<tag> exist (all three, or nothing is stopped); they are retagged
#                to :local together
#
# Steps (stops at the first failure; the backend is NOT started again until the migration succeeded):
#   1. data services up, supported identity (platform, v0.24.0 or later), current journal vs the target migrate image's
#      journal (read-only compare of applied migration hashes with the hashes of the image's migrations; refuses on divergence)
#   2. current images (backend, migrate, and the running edge's web image) tagged :pre-<UTC timestamp> (the rollback set)
#   3. stop the backend (writers and jobs), backup.sh --keep-stopped (under this script's maintenance lock), verify-backup.sh; either failing = stop here
#   4. only now the new images take the :local tags, then the migrate job runs (drizzle-kit migrate); a non-zero exit leaves
#      the backend stopped and prints the restore command for the matching backup and the image rollback command
#   5. docker compose up -d, then /health/ready must return 200
# A restored installation has docker-compose.restore-<project>.yml (restore.sh) pinning the three images by immutable id.
# Then steps 4-5 run with a pin file naming the TARGET image ids (never the old pins); on success it replaces the restore
# pin file atomically and the previous one is kept as docker-compose.restore-<project>.yml.pre-<UTC timestamp>; on failure
# the original pin file is left untouched. Without that file nothing changes.
# The whole run holds the per-installation maintenance lock (ops/platform-api/.maintenance/<project>.lock); a second
# backup/upgrade exits 3 at once. No down migrations. No fixture seed or bootstrap is ever run. A pre-0076 (feedbackops/fops_*) install is refused by the
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

usage() { sed -n '3,36p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
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
WEB_REPO="${BACKUP_WEB_IMAGE_REPO:-platform-release-web}"
NEW_WEB="$WEB_REPO:$TARGET"
docker image inspect "$NEW_MIGRATE" >/dev/null 2>&1 || bk_die "image $NEW_MIGRATE not found on this host; build or load it first"
docker image inspect "$NEW_BACKEND" >/dev/null 2>&1 || bk_die "image $NEW_BACKEND not found on this host; build or load it first"
if [ "$TARGET" != local ]; then
  docker image inspect "$NEW_WEB" >/dev/null 2>&1 || bk_die "image $NEW_WEB not found on this host; nothing was stopped. Build it at the same commit (scripts/release/build-web-image.sh) and tag it: docker tag $WEB_REPO:local $NEW_WEB"
else
  web_created="$(docker image inspect --format '{{.Created}}' "$WEB_REPO:local" 2>/dev/null)" || web_created=''
  backend_created="$(docker image inspect --format '{{.Created}}' "$BACKEND_REPO:local" 2>/dev/null)" || backend_created=''
  if [ -z "$web_created" ]; then
    bk_log "WARNING: $WEB_REPO:local not found; the edge would keep running (or fail to start) with another web build"
  elif [ -n "$backend_created" ] && [[ "${web_created:0:19}" < "${backend_created:0:19}" ]]; then
    bk_log "WARNING: $WEB_REPO:local ($web_created) is older than $BACKEND_REPO:local ($backend_created): the web bundle may not match the new API. Rebuild it with scripts/release/build-web-image.sh from the same commit unless that is intended."
  fi
fi

# Restored installation: the pin file must follow the upgrade (otherwise the next documented start returns the old images).
PINS_FILE="$(dirname "$COMPOSE_FILE")/docker-compose.restore-$PROJECT.yml"
PINS_NEW=''
if [ -f "$PINS_FILE" ]; then
  PIN_IDS=()
  for img in "$NEW_BACKEND" "$NEW_MIGRATE" "$NEW_WEB"; do
    pin_id="$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null)" && [[ "$pin_id" =~ ^sha256:[A-Za-z0-9]+$ ]] \
      || bk_die "cannot read the immutable id of $img for the restore pin file $PINS_FILE; nothing was stopped"
    PIN_IDS+=("$pin_id")
  done
fi

tmp="$(mktemp -d)"

# Interruption (INT/TERM/HUP) and every other exit: the lock is released only when nothing of this run can still be
# working. The nested backup (a background child that is waited for) and the migrate job (a background docker client
# plus its container) are told to stop and checked; if one cannot be confirmed stopped the lock stays, with the way to
# check and clear it. SIGKILL cannot be handled: it leaves the lock for the documented stale-lock procedure.
CHILD_PID=''
CHILD_KIND=''
MIGRATE_MAY_RUN=0
SETTLE_SECONDS="${BK_SETTLE_SECONDS:-60}"
run_child() { # run_child <backup|migrate> <command...>; the command's stdout is this function's stdout
  CHILD_KIND="$1"; shift
  "$@" &
  CHILD_PID=$!
  local rc=0
  wait "$CHILD_PID" || rc=$?
  CHILD_PID=''
  return "$rc"
}
migrate_containers() { # ids of running migrate containers of this project (one-off runs included); fails when docker cannot answer
  docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter 'label=com.docker.compose.service=migrate'
}
settle_children() { # 0 = nothing started by this run can still be working
  local waited=0 ids
  if [ -n "$CHILD_PID" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    bk_log "interrupted: stopping the active $CHILD_KIND (waiting up to ${SETTLE_SECONDS}s)"
    while kill -0 "$CHILD_PID" 2>/dev/null; do
      # Repeated: a child that is busy in a foreground command acts on the signal only after that command.
      [ "$CHILD_KIND" != migrate ] || pkill -TERM -P "$CHILD_PID" 2>/dev/null || true
      kill -TERM "$CHILD_PID" 2>/dev/null || true
      [ "$waited" -lt "$SETTLE_SECONDS" ] || { bk_log "the $CHILD_KIND (pid $CHILD_PID) is still running"; return 1; }
      sleep 1
      waited=$((waited + 1))
    done
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  CHILD_PID=''
  if [ "$MIGRATE_MAY_RUN" -eq 1 ]; then
    ids="$(migrate_containers 2>/dev/null)" || { bk_log 'could not ask docker whether the migrate job is still running'; return 1; }
    if [ -n "$ids" ]; then
      bk_log 'stopping the migrate container'
      # shellcheck disable=SC2086
      docker stop $ids >/dev/null 2>&1 || true
      ids="$(migrate_containers 2>/dev/null)" || ids='unknown'
      [ -z "$ids" ] || { bk_log 'the migrate container is still running'; return 1; }
    fi
  fi
  return 0
}
on_exit() {
  local rc=$?
  trap '' INT TERM HUP
  trap - EXIT
  [ -z "$PINS_NEW" ] || rm -f -- "$PINS_NEW"
  if settle_children; then
    rm -rf -- "${tmp:?}"
    if [ "$BK_LOCK_HELD" -eq 1 ]; then
      bk_lock_release
      [ "$rc" -eq 0 ] || bk_log "UPGRADE STOPPED (exit $rc). The backend was not started again by this script."
    fi
  else
    rm -rf -- "${tmp:?}"
    bk_log "UPGRADE STOPPED (exit $rc) but maintenance work of this run may still be running. The maintenance lock is KEPT: $(bk_lock_path)"
    bk_log "Check: ps -p ${CHILD_PID:-<pid above>}; docker ps --filter label=com.docker.compose.project=$PROJECT --filter label=com.docker.compose.service=migrate"
    bk_log "Only when nothing is running any more, clear the lock: rm -rf '$(bk_lock_path)'"
    [ "$rc" -ne 0 ] || rc=1
  fi
  exit "$rc"
}
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
trap on_exit EXIT
bk_lock_acquire upgrade

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
PRE_WEB=''
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
# The web rollback image is the one the running edge container uses, not the mutable :local tag.
if id="$(bk_container_image edge)"; then
  docker tag "$id" "$WEB_REPO:pre-$TS" && PRE_WEB="$WEB_REPO:pre-$TS"
fi
[ -n "$PRE_WEB" ] || bk_log "WARNING: no edge container found; no :pre-$TS rollback tag for the web image"
[ -n "$PRE_BACKEND" ] || bk_log "WARNING: no backend container found; no :pre-$TS rollback tag for the backend image"
[ -z "$PRE_BACKEND" ] || bk_log "rollback images: $PRE_BACKEND ${PRE_MIGRATE:-(no migrate container)} ${PRE_WEB:-(no web image)}"

# 3. Quiesce, back up, verify. A failure here leaves the backend stopped.
bk_log 'stopping backend (writers and jobs)'
bk_dc stop backend >/dev/null
run_child backup env BK_LOCK_TOKEN="$BK_LOCK_OWN_TOKEN" BACKUP_PROJECT="$PROJECT" BACKUP_ENV_FILE="$ENV_FILE" BACKUP_COMPOSE_FILE="$COMPOSE_FILE" \
  BACKUP_MIGRATE_IMAGE="${BACKUP_MIGRATE_IMAGE:-${PRE_MIGRATE:-$MIGRATE_REPO:local}}" \
  bash "$BACKUP_SCRIPTS/backup.sh" --keep-stopped >"$tmp/backup.out" || bk_die 'backup failed; nothing was migrated and the backend stays stopped'
BACKUP_DIR="$(tail -n 1 "$tmp/backup.out")"
[ -d "$BACKUP_DIR" ] || bk_die 'backup.sh did not report a backup directory'
bash "$BACKUP_SCRIPTS/verify-backup.sh" "$BACKUP_DIR" || bk_die "verification of $BACKUP_DIR failed; nothing was migrated and the backend stays stopped"
RESTORE_CMD="BACKUP_ROOT=\"$BACKUP_ROOT\" bash $BACKUP_SCRIPTS/restore.sh \"$BACKUP_DIR\" --project <new-project>"

# 4. Migrate with the new images.
if [ "$TARGET" != local ]; then
  docker tag "$NEW_BACKEND" "$BACKEND_REPO:local"
  docker tag "$NEW_MIGRATE" "$MIGRATE_REPO:local"
  docker tag "$NEW_WEB" "$WEB_REPO:local"
fi
if [ -f "$PINS_FILE" ]; then
  # The target ids, for the migrate job and the final start; the restore pin file itself is replaced only after success.
  PINS_NEW="$PINS_FILE.new-$TS"
  bk_write_pins "$PINS_NEW" "${PIN_IDS[0]}" "${PIN_IDS[1]}" "${PIN_IDS[2]}" "Written by upgrade.sh for project $PROJECT (target $TARGET)."
  BK_COMPOSE_PINS="$PINS_NEW"
  bk_log "restore pin file $PINS_FILE exists: migrate and start use the target image ids"
fi
bk_log 'running the migrate job'
MIGRATE_MAY_RUN=1
if ! run_child migrate bk_dc run --rm --no-deps migrate >&2; then
  bk_log 'MIGRATION FAILED. The backend stays stopped.'
  bk_log "1. Inspect what was applied: docker compose -p $PROJECT --env-file <env> -f <compose> exec -T postgres psql -U postgres -d platform -c 'select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 5'"
  bk_log "2. Forward-fix (new image, rerun this script) or restore the matching data and image pair:"
  bk_log "   $RESTORE_CMD"
  if [ -f "$PINS_FILE" ]; then
    bk_log "   restore pin file $PINS_FILE is unchanged (it still names the previous images); start the previous release with it: docker compose -p $PROJECT --env-file <env> -f <compose> -f $PINS_FILE up -d"
  fi
  [ -z "$PRE_BACKEND" ] || bk_log "   image rollback: docker tag $PRE_BACKEND $BACKEND_REPO:local${PRE_MIGRATE:+; docker tag $PRE_MIGRATE $MIGRATE_REPO:local}${PRE_WEB:+; docker tag $PRE_WEB $WEB_REPO:local}"
  exit 1
fi
MIGRATE_MAY_RUN=0

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
  [ ! -f "$PINS_FILE" ] || bk_log "   restore pin file $PINS_FILE is unchanged (it still names the previous images)"
  exit 1
fi
if [ -f "$PINS_FILE" ]; then
  PINS_PRE="$PINS_FILE.pre-$TS"
  cp -p -- "$PINS_FILE" "$PINS_PRE"
  mv -f -- "$PINS_NEW" "$PINS_FILE"
  PINS_NEW=''
  bk_log "restore pin file updated to the new images: $PINS_FILE"
  bk_log "   to roll the pins back: mv -f '$PINS_PRE' '$PINS_FILE' (together with the image rollback)"
fi
bk_log "UPGRADE OK. Backup taken first: $BACKUP_DIR"
