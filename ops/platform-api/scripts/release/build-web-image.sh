#!/usr/bin/env bash
# Build the production edge image (#1266 b1d): the real web bundle packaged with nginx as platform-release-web:local.
# Run before `docker compose ... up -d` (docker-compose.production.yml has no build: key for the edge service).
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$repo_root"

pnpm --filter @ap/platform-web build:real-prod
test -s apps/platform-web/dist/index.html || { echo "build-web-image: apps/platform-web/dist/index.html is missing after the build" >&2; exit 1; }

# BuildKit reads apps/platform-web/Dockerfile.dockerignore (per-Dockerfile ignore) instead of the root .dockerignore.
DOCKER_BUILDKIT=1 docker build \
  -f apps/platform-web/Dockerfile \
  -t platform-release-web:local \
  "$repo_root"
