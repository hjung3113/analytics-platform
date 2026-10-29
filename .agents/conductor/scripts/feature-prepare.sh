#!/usr/bin/env bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# feature-prepare.sh <issue> <worktree> — launch-mode `feature` hook (conductor.json launch.modes.feature).
#
# The feature apps and packages live in apps/platform-api, apps/feature-screens, packages/feature-shared and packages/feature-ui and its tools in ops/platform-api/ (@ap/platform-api-ops); both are
# part of the root pnpm workspace (ADR-0066, #642, ADR-0090), so the launcher's root install already covers them. This hook seeds .env, then creates the issue's throwaway database
# through the ops verify-db.sh (port 5439, never the 5434 dev DB). verify-db.sh writes $WAVE_STATE/env.verify.<issue>; the launcher copies it into the worktree.
# Prerequisite: the verify container is up (see PROFILE.md §Launch, mode feature).
set -euo pipefail

issue=${1:?usage: feature-prepare.sh <issue> <worktree>}
worktree=${2:?usage: feature-prepare.sh <issue> <worktree>}
feature_ops="$worktree/ops/platform-api"

[ -f "$feature_ops/package.json" ] || { echo "feature-prepare: $feature_ops is not the platform-api ops directory" >&2; exit 1; }

# verify-db.sh templates the issue env file from $feature_ops/.env, replacing only the DATABASE_URL lines. A fresh worktree has
# no .env (gitignored), so seed it from the committed .env.example (development defaults, no secrets).
if [ ! -f "$feature_ops/.env" ]; then
  echo "== seed $feature_ops/.env from .env.example"
  cp "$feature_ops/.env.example" "$feature_ops/.env"
fi

echo "== issue database $issue"
exec bash "$feature_ops/conductor/scripts/verify-db.sh" create "$issue" --migrate-from "$worktree"
