#!/usr/bin/env bash
# Prints the path for one issue's diff: review, local verify and merge mode. Same diff, same answer (#1040).
# usage: tier.sh [<base>] [<head>]   (default origin/main HEAD; reads `git diff --name-status -M`)
# output (one line): tier=<full|light> verify=<full|light> merge=<locked|short> why=<…>
#   full   : implementer + one review-final + at most one fix round
#   light  : lane edits directly (no worker, no reviewer); host reads the diff; CI decides
# A diff that only renames files (R100) counts as light even under full paths.
set -u
base=${1:-origin/main}
head=${2:-HEAD}
mb=$(git merge-base "$base" "$head") || { echo "tier: no merge-base" >&2; exit 2; }

full_re='^(packages/sdk/(kernel|components|shell|ui|contracts)/|packages/adapters/(mock-server|http-adapter|server-conformance|fo-bridge)/|apps/platform-web/|apps/fo-backend/|packages/fo-shared/)'
shared_re='^(tooling/sdk/api/|package\.json$|packages/sdk/(contracts|kernel|components|shell)/package\.json$|pnpm-lock\.yaml$|turbo\.json$|\.github/workflows/|apps/platform-e2e/)'
test_re='(/__tests__/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$)'

tier=light verify=light merge=short why=""
while IFS=$'\t' read -r status a b; do
  [ -n "${status:-}" ] || continue
  path=${b:-$a}
  if printf '%s' "$path" | grep -qE "$shared_re"; then merge=locked verify=full; why="$why shared:$path"; fi
  case "$status" in R100) continue ;; esac
  if printf '%s' "$path" | grep -qE "$full_re" && ! printf '%s' "$path" | grep -qE "$test_re"; then
    tier=full verify=full; why="$why full:$path"
  fi
done < <(git diff --name-status -M "$mb" "$head")

echo "tier=$tier verify=$verify merge=$merge why=$(printf '%s' "${why# }" | cut -c1-300)"
