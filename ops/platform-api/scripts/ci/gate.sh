#!/usr/bin/env bash
#
# The CI gate (#794): root AGENTS.md → Verification, split into three stages any
# CI can call. `.github/workflows/ci.yml` (repo root) runs them on GitHub Actions; another CI
# runs the same three commands after `pnpm install --frozen-lockfile` at the repo root (Node 26.7, root .nvmrc).
# Run it from anywhere; it works from the repository root. Paths come from ops/platform-api/paths.sh.
#
#   bash ops/platform-api/scripts/ci/gate.sh static [--base <ref>]
#       root typecheck, boundaries (+ its fixture test), the
#       integration runner's dev-database guard test, migration drift, FE
#       typecheck, design lint, and — with --base — the FE Biome gate on the
#       files changed since merge-base(HEAD, <ref>). The Biome gate diffs
#       committed history, so the checkout needs full history and <ref>.
#   bash ops/platform-api/scripts/ci/gate.sh unit
#       vitest for apps/frontend, packages/ui and packages/shared. The backend
#       suite runs in `integration`, where its DB-backed suites are live.
#   bash ops/platform-api/scripts/ci/gate.sh integration
#       bootstraps a throwaway Postgres from ops/platform-api/scripts/db/init.sql, migrates it, and
#       runs `pnpm --filter @ap/platform-api test:integration`, which truncates and re-seeds.
#       Needs CI_PG_ADMIN_URL: a superuser URL for an EMPTY, disposable Postgres 16
#       server with pgvector, e.g. postgres://postgres:postgres@localhost:5432/postgres.

set -euo pipefail

ops_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
. "$ops_root/paths.sh"
cd "$FO_REPO_ROOT"

# Root scripts of the @ap/platform-api-ops package (ops/platform-api/package.json); pnpm runs them from that directory.
fo() { pnpm -s --filter @ap/platform-api-ops run "$@"; }

step() {
  printf '\n==> %s\n' "$*"
  "$@"
}

stage_static() {
  local base=""
  if [ "${1:-}" = "--base" ]; then
    base="${2:?--base needs a ref}"
  elif [ -n "${1:-}" ]; then
    echo "gate.sh static: unknown argument $1" >&2
    exit 2
  fi
  step fo feature:typecheck
  step stage_static_extra
  step env FEATURE_LINT_BASE="${base:-${FEATURE_LINT_BASE:-origin/main}}" pnpm --filter @ap/platform-api-ops lint
}

# Unified root typecheck/lint/test already cover package suites and production boundaries.
# This stage contains only additional gates required by CI.
stage_static_extra() {
  step node "$FO_OPS/scripts/check-boundaries.test.mjs"
  step node "$FO_OPS/scripts/test-integration.test.mjs"
  step node "$FO_OPS/scripts/db/cutover-0076.test.mjs"
  step node apps/platform-e2e/tests-real/database-safety.test.ts
  step fo gate:db-migration-drift
  step fo gate:fe-typecheck
}

stage_unit() {
  step pnpm --filter @ap/feature-screens exec vitest run
  step pnpm --filter @ap/feature-ui exec vitest run
  step pnpm --filter @ap/feature-shared exec vitest run
}

stage_integration() {
  local admin_url="${CI_PG_ADMIN_URL:?set CI_PG_ADMIN_URL to a disposable Postgres superuser URL}"
  local host port
  read -r host port < <(node -e 'const u = new URL(process.argv[1]); console.log(u.hostname, u.port || "5432")' "$admin_url")
  # 5434 is the development database (docker-compose.dev.yml); this stage truncates.
  if [ "$port" = "5434" ]; then
    echo "gate.sh integration: refusing port 5434 (the development database)" >&2
    exit 2
  fi

  step psql "$admin_url" -X -q -v ON_ERROR_STOP=1 -f "$FO_OPS/scripts/db/init.sql"

  local env_file
  env_file="$(mktemp)"
  # Expanded now: the EXIT trap runs after this function's locals are gone.
  trap "rm -f '$env_file'" EXIT
  grep -Ev '^DATABASE_URL(_MIGRATE)?=' "$FO_OPS/.env.example" > "$env_file"
  {
    echo "DATABASE_URL=postgres://platform_app:platform_app@$host:$port/platform"
    echo "DATABASE_URL_MIGRATE=postgres://platform_migrate:platform_migrate@$host:$port/platform"
  } >> "$env_file"

  # Fresh provisioning: init.sql created the replay roles and database `platform`; the cutover replays
  # history through 0075, renames the roles to the final identity, then runs db:migrate as platform_migrate.
  (
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
    step env CUTOVER_ADMIN_URL="$admin_url" bash "$FO_OPS/scripts/db/cutover-0076-platform-identity.sh" all
  )
  step env FEEDBACKOPS_ENV_FILE="$env_file" pnpm --filter @ap/platform-api test:integration
}

case "${1:-}" in
  static) shift; stage_static "$@" ;;
  static-extra) stage_static_extra ;;
  unit) stage_unit ;;
  integration) stage_integration ;;
  *)
    echo "usage: ops/platform-api/scripts/ci/gate.sh static [--base <ref>] | unit | integration" >&2
    exit 2
    ;;
esac
