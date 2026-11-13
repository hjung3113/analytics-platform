#!/usr/bin/env bash
# Build the production edge image (#1266 b1d): the real web bundle packaged with nginx as platform-release-web:<tag>.
# Run before `docker compose ... up -d` (docker-compose.production.yml has no build: key for the edge service).
#
#   build-web-image.sh                          build this repo's web (build:real-prod), tag :local
#   build-web-image.sh --dist <dir> [--tag T]   package an already-built dist (#1881: an assembly built outside this
#                                               repo, e.g. with `vite build --mode real`); no pnpm run. Tag default :local;
#                                               for upgrade.sh <tag> pass the release tag so platform-release-web:<tag> exists.
# Both forms use the same apps/platform-web/Dockerfile and ops/platform-api/edge/nginx.conf. The dist must hold index.html.
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$repo_root"

dist=''
tag='local'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dist) dist="${2:-}"; [ -n "$dist" ] || { echo "build-web-image: --dist needs a directory" >&2; exit 2; }; shift 2 ;;
    --tag) tag="${2:-}"; shift 2 || exit 2 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build-web-image: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { echo "build-web-image: invalid image tag '$tag'" >&2; exit 2; }

if [ -z "$dist" ]; then
  pnpm --filter @ap/platform-web build:real-prod
  test -s apps/platform-web/dist/index.html || { echo "build-web-image: apps/platform-web/dist/index.html is missing after the build" >&2; exit 1; }
  # BuildKit reads apps/platform-web/Dockerfile.dockerignore (per-Dockerfile ignore) instead of the root .dockerignore.
  DOCKER_BUILDKIT=1 docker build \
    -f apps/platform-web/Dockerfile \
    -t "platform-release-web:$tag" \
    "$repo_root"
  exit 0
fi

[ -d "$dist" ] || { echo "build-web-image: --dist $dist is not a directory" >&2; exit 1; }
test -s "$dist/index.html" || { echo "build-web-image: $dist/index.html is missing or empty" >&2; exit 1; }
# A temporary build context holds only what the Dockerfile copies, so the prebuilt dist never has to sit inside this checkout.
ctx="$(mktemp -d)"
trap 'rm -rf -- "${ctx:?}"' EXIT
mkdir -p "$ctx/apps/platform-web" "$ctx/ops/platform-api/edge"
cp -R "$dist" "$ctx/apps/platform-web/dist"
cp ops/platform-api/edge/nginx.conf "$ctx/ops/platform-api/edge/nginx.conf"
DOCKER_BUILDKIT=1 docker build \
  -f "$repo_root/apps/platform-web/Dockerfile" \
  -t "platform-release-web:$tag" \
  "$ctx"
