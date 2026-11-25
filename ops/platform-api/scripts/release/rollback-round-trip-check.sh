#!/usr/bin/env bash
# Rehearse an image-only rollback on a disposable Docker host.
# Usage: rollback-round-trip-check.sh --prev-tag <N image tag> --tag <N+1 image tag>
# Both linux/amd64 image sets must already exist. The host's :local tags must be free.
set -Eeuo pipefail
set +x

die() { echo "rollback-round-trip-check: $1" >&2; exit "${2:-1}"; }
prev_tag=''
tag=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prev-tag|--tag)
      [[ "${2:-}" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ && "$2" != local && "$2" != pre-* ]] \
        || die "$1 requires a release tag other than local or pre-*" 2
      if [ "$1" = --prev-tag ]; then
        [ -z "$prev_tag" ] || die 'duplicate --prev-tag' 2
        prev_tag="$2"
      else
        [ -z "$tag" ] || die 'duplicate --tag' 2
        tag="$2"
      fi
      shift 2
      ;;
    -h|--help) sed -n '2,4s/^# //p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" 2 ;;
  esac
done
[ -n "$prev_tag" ] || die '--prev-tag is required' 2
[ -n "$tag" ] || die '--tag is required' 2
[ "$prev_tag" != "$tag" ] || die 'the two release tags must differ' 2

step=preflight
trap 'echo "rollback-round-trip-check: $step failed (exit $?)" >&2' ERR
command -v docker >/dev/null 2>&1 || die 'preflight: docker is required' 2
repos=(platform-release-backend platform-release-migrate platform-release-web)
for repo in "${repos[@]}"; do
  for release in "$prev_tag" "$tag"; do
    image="$repo:$release"
    arch="$(docker image inspect --platform linux/amd64 --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null)" \
      && [ "$arch" = linux/amd64 ] || die "preflight: missing $image for linux/amd64"
  done
  existing="$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$repo:local")"
  [ -z "$existing" ] || die "preflight: $repo:local already exists; use a disposable host with free :local tags"
done

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ops="$(cd -- "$here/../.." && pwd)"
. "$here/lib-disposable-stack.sh"
disposable_stack_init rollback-round-trip
local_tags=()
pre_before=''
upgrade_started=0
pre_tags() { # every :pre-* tag of the three repositories, sorted (upgrade.sh names its rollback set :pre-<UTC ts>)
  local repo
  for repo in "${repos[@]}"; do docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$repo:pre-*"; done | sort
}
new_pre_tags() { # the :pre-* tags that appeared after pre_before was taken
  comm -13 <(printf '%s' "$pre_before") <(pre_tags)
}

cleanup() {
  local status=$? image cleaned=0
  disposable_stack_down "$status" || cleaned=1
  if [ "$step" != preflight ] && [ -n "${pre_before+x}" ] && [ "$upgrade_started" = 1 ]; then
    while IFS= read -r image; do
      [ -z "$image" ] || docker image rm --no-prune "$image" || cleaned=1
    done < <(new_pre_tags)
  fi
  for image in "${local_tags[@]+"${local_tags[@]}"}"; do
    docker image rm --no-prune "$image" || cleaned=1
  done
  rm -rf -- "$scratch" || cleaned=1
  if [ "$cleaned" = 1 ]; then
    echo 'rollback-round-trip-check: cleanup failed' >&2
    [ "$status" != 0 ] || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

journal() {
  "${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d platform -At \
    -c 'select id, hash, created_at from drizzle.__drizzle_migrations order by id'
}

step='first install'
disposable_stack_configure local
disposable_stack_pull
for repo in "${repos[@]}"; do
  docker tag "$repo:$prev_tag" "$repo:local"
  local_tags+=("$repo:local")
done
disposable_stack_install
step='first install readiness'
disposable_stack_ready
echo "rollback-round-trip-check: first install ($prev_tag) returned 200"

step=upgrade
pre_before="$(pre_tags)"
[ -z "$pre_before" ] || pre_before="$pre_before"$'\n'
upgrade_started=1
unset BK_COMPOSE_PINS BK_LOCK_TOKEN BACKUP_MC_IMAGE
BACKUP_ROOT="$scratch/backups" BACKUP_MAINTENANCE_DIR="$scratch/maintenance" BACKUP_KEEP=1 \
  BACKUP_BACKEND_IMAGE_REPO="${repos[0]}" BACKUP_MIGRATE_IMAGE_REPO="${repos[1]}" \
  BACKUP_WEB_IMAGE_REPO="${repos[2]}" BACKUP_MIGRATE_IMAGE="${repos[1]}:local" \
  BK_COMPOSE_OVERRIDE="$ops/docker-compose.offline-start.yml" \
  bash "$here/upgrade.sh" "$tag" --project "$project" --env-file "$scratch/env" \
    --compose-file "$ops/docker-compose.production.yml"
step='upgrade readiness'
disposable_stack_ready
journal >"$scratch/upgraded-journal"
[ -s "$scratch/upgraded-journal" ] || die 'upgrade readiness: the migration journal is empty'
echo "rollback-round-trip-check: upgrade ($tag) returned 200"

step='image-only rollback'
rollback_set="$(new_pre_tags)"
for repo in "${repos[@]}"; do
  [ "$(grep -c "^$repo:pre-" <<<"$rollback_set")" = 1 ] \
    || die "image-only rollback: upgrade.sh did not leave exactly one $repo:pre-* tag"
done
while IFS= read -r image; do
  docker tag "$image" "${image%:*}:local"
done <<<"$rollback_set"
# Keep both data services and the completed N+1 migration job in place.
"${compose[@]}" up -d --pull never --no-build --no-deps --force-recreate --wait --wait-timeout 240 backend edge
step='rollback readiness'
disposable_stack_ready
journal >"$scratch/rolled-back-journal"
cmp -s "$scratch/upgraded-journal" "$scratch/rolled-back-journal" \
  || die 'rollback readiness: the upgraded migration journal changed'
echo "rollback-round-trip-check: rolled back to $prev_tag on the $tag schema (GET /health/ready returned 200)"
