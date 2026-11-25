#!/usr/bin/env bash
# Verify a pack-images.sh release unit on a disposable production Compose stack.
# Usage: offline-start-check.sh --unit <dir> --tag <tag>
# Needs Docker 28+, Compose with !reset and --wait, and OpenSSL.
# The three release tags are removed without force, then restored from the archives.
set -Eeuo pipefail

die() { echo "offline-start-check: $1" >&2; exit "${2:-1}"; }
unit=''
tag=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --unit|--tag)
      [[ -n "${2:-}" && "$2" != --* ]] || die "$1 requires a value" 2
      if [ "$1" = --unit ]; then unit="$2"; else tag="$2"; fi
      shift 2
      ;;
    -h|--help) sed -n '2,5s/^# //p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" 2 ;;
  esac
done
[ -n "$unit" ] || die '--unit is required' 2
[ -n "$tag" ] || die '--tag is required' 2
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] && [ "$tag" != local ] || die "invalid release tag '$tag'" 2
unit="$(cd -- "$unit" && pwd)" || die 'cannot open the release unit'
[ -f "$unit/SHA256SUMS" ] || die 'missing SHA256SUMS'

prefix=platform-release
names=(backend migrate web)
archives=()
for name in "${names[@]}"; do archives+=("$prefix-$name-$tag.tar.gz"); done
# sha256sum alone succeeds on a manifest with a missing row. Require exactly the three files we will load.
awk -v backend="${archives[0]}" -v migrate="${archives[1]}" -v web="${archives[2]}" '
  { if (NF != 2 || $1 !~ /^[0-9a-fA-F]+$/ || length($1) != 64 || $0 != $1 "  " $2) exit 1
    seen[$2]++ }
  END { if (NR != 3 || seen[backend] != 1 || seen[migrate] != 1 || seen[web] != 1) exit 1 }
' "$unit/SHA256SUMS" || die 'SHA256SUMS must list exactly the three archives for the requested tag'
if command -v sha256sum >/dev/null 2>&1; then sum=(sha256sum); else sum=(shasum -a 256); fi
(cd -- "$unit" && "${sum[@]}" -c SHA256SUMS) || die "SHA256SUMS check failed in $unit"

command -v docker >/dev/null 2>&1 || die 'docker is required' 2
ops="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$ops/scripts/release/lib-disposable-stack.sh"
disposable_stack_init offline-start

cleanup() {
  local status=$?
  disposable_stack_down "$status" || { if [ "$status" = 0 ]; then status=1; fi; }
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

disposable_stack_configure "$tag"
disposable_stack_pull

for name in "${names[@]}"; do
  image="$prefix-$name:$tag"
  existing="$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image")"
  if [ -n "$existing" ]; then docker image rm --no-prune "$image"; fi
done
for archive in "${archives[@]}"; do
  docker load --platform linux/amd64 --input "$unit/$archive"
done
for name in "${names[@]}"; do
  image="$prefix-$name:$tag"
  arch="$(docker image inspect --platform linux/amd64 --format '{{.Os}}/{{.Architecture}}' "$image")" \
    && [ "$arch" = linux/amd64 ] || die "the unit did not restore $image for linux/amd64"
done

disposable_stack_install
disposable_stack_ready
echo 'offline-start-check: GET /health/ready returned 200'
