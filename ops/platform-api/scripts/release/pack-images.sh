#!/usr/bin/env bash
# Pack the core server release unit (ADR-0177, #2913): the three images upgrade.sh <tag> needs, saved as tar files with
# a SHA256SUMS, for a host that reaches no registry (`sha256sum -c SHA256SUMS`, `docker load -i <tar>`, upgrade.sh <tag>).
#
#   pack-images.sh --tag <tag> --out <dir>            build platform-release-{backend,migrate,web}:<tag> for linux/amd64
#                                                     from this checkout, then save them into <dir>
#   pack-images.sh --tag <tag> --out <dir> --no-build save images already tagged <tag> (e.g. built by CI); each must be
#                                                     linux/amd64
#
# Needs Docker 28 or later (`image inspect --platform`). <dir> must be empty or absent.
# Output: platform-release-{backend,migrate,web}-<tag>.tar.gz, a CycloneDX SBOM per image
# (platform-release-{backend,migrate,web}-<tag>.cdx.json, read from this checkout's pnpm-lock.yaml) and SHA256SUMS.
# Needs pnpm (the SBOM reads the lockfile only, no registry or store).
set -Eeuo pipefail

caller_dir="$PWD"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$repo_root"

die() { echo "pack-images: $1" >&2; exit "${2:-1}"; }

tag=''
out=''
build=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) tag="${2:-}"; shift 2 || exit 2 ;;
    --out) out="${2:-}"; shift 2 || exit 2 ;;
    --no-build) build=0; shift ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" 2 ;;
  esac
done
[ -n "$tag" ] || die '--tag is required' 2
[ -n "$out" ] || die '--out is required' 2
# `local` is the operator's moving tag (upgrade.sh local); a release unit names one fixed tag.
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] && [ "$tag" != local ] || die "invalid release tag '$tag'" 2
case "$out" in /*) ;; *) out="$caller_dir/$out" ;; esac
if [ -e "$out" ]; then
  [ -d "$out" ] || die "--out $out is not a directory"
  [ -z "$(ls -A "$out")" ] || die "--out $out is not empty; a release unit is written into a fresh directory"
fi

if command -v sha256sum >/dev/null 2>&1; then sum=(sha256sum); else sum=(shasum -a 256); fi
command -v docker >/dev/null 2>&1 || die 'docker is required' 2
command -v pnpm >/dev/null 2>&1 || die 'pnpm is required (SBOM)' 2

platform=linux/amd64
if [ "$build" = 1 ]; then
  DOCKER_BUILDKIT=1 docker build --platform "$platform" -f apps/platform-api/Dockerfile --target runtime \
    -t "platform-release-backend:$tag" "$repo_root"
  DOCKER_BUILDKIT=1 docker build --platform "$platform" -f apps/platform-api/Dockerfile --target migrate \
    -t "platform-release-migrate:$tag" "$repo_root"
  # build-web-image.sh has no --platform flag; docker build honours DOCKER_DEFAULT_PLATFORM.
  DOCKER_DEFAULT_PLATFORM="$platform" bash ops/platform-api/scripts/release/build-web-image.sh --tag "$tag"
fi

names=(backend migrate web)
for name in "${names[@]}"; do
  image="platform-release-$name:$tag"
  # --platform reads the linux/amd64 image of a multi-platform index (containerd image store); a missing platform
  # answers "/", so the comparison refuses it.
  arch="$(docker image inspect --platform "$platform" --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null)" \
    || die "image $image not found on this host"
  [ "$arch" = "$platform" ] || die "image $image has no $platform image (got '$arch')"
done

mkdir -p "$out"
for name in "${names[@]}"; do
  docker save --platform "$platform" "platform-release-$name:$tag" | gzip -n > "$out/platform-release-$name-$tag.tar.gz"
done
# One SBOM per image, each the lockfile slice its Dockerfile stage installs (#2963):
#   backend  the runtime image's `pnpm deploy --prod` of @ap/platform-api
#   migrate  the build stage's `pnpm install --filter @ap/platform-api...` (dev dependencies included: drizzle-kit runs)
#   web      the production dependency tree of @ap/platform-web and its workspace packages; the image holds only the
#            bundled static files, so this lists a superset of what the bundle contains
sbom() { # <name> <pnpm sbom selector args...>
  local name="$1"; shift
  pnpm sbom --sbom-format cyclonedx --sbom-type application --lockfile-only "$@" \
    > "$out/platform-release-$name-$tag.cdx.json" || die "pnpm sbom failed for $name"
}
sbom backend --prod --filter @ap/platform-api
sbom migrate --filter '@ap/platform-api...'
sbom web --prod --filter '@ap/platform-web...'
(cd "$out" && "${sum[@]}" platform-release-*-"$tag".tar.gz platform-release-*-"$tag".cdx.json > SHA256SUMS && "${sum[@]}" -c SHA256SUMS >/dev/null) \
  || die "SHA256SUMS check failed in $out"
echo "pack-images: wrote ${#names[@]} images, their SBOMs and SHA256SUMS to $out"
