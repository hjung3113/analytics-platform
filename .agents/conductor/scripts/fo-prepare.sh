#!/usr/bin/env bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# fo-prepare.sh <issue> <worktree> — launch-mode `fo` hook (conductor.json launch.modes.fo).
#
# FeedbackOps apps and packages live in products/feedbackops/ and its tools in ops/feedbackops/ (@fops/ops); both are
# part of the root pnpm workspace (ADR-0066, #642, ADR-0090), so the launcher's root install already covers them. This hook seeds .env, then creates the issue's throwaway database
# through FeedbackOps' own verify-db.sh (port 5439, never the 5434 dev DB). verify-db.sh writes $WAVE_STATE/env.verify.<issue>; the launcher copies it into the worktree.
# Prerequisite: the verify container is up (see PROFILE.md §Launch, mode fo).
set -euo pipefail

issue=${1:?usage: fo-prepare.sh <issue> <worktree>}
worktree=${2:?usage: fo-prepare.sh <issue> <worktree>}
fo="$worktree/ops/feedbackops"

[ -f "$fo/package.json" ] || { echo "fo-prepare: $fo is not the FeedbackOps directory" >&2; exit 1; }

# verify-db.sh templates the issue env file from $fo/.env, replacing only the DATABASE_URL lines. A fresh worktree has
# no .env (gitignored), so seed it from the committed .env.example (development defaults, no secrets).
if [ ! -f "$fo/.env" ]; then
  echo "== seed $fo/.env from .env.example"
  cp "$fo/.env.example" "$fo/.env"
fi

echo "== issue database $issue"
exec bash "$fo/conductor/scripts/verify-db.sh" create "$issue" --migrate-from "$worktree"
