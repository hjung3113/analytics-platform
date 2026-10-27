#!/usr/bin/env bash
# Prints the review, local-verify and merge mode for a committed diff. Same diff, same answer (#1040).
# usage: tier.sh [<base>] [<head>]   (default origin/main HEAD)
# output (one line): tier=<full|light> verify=<full|light> merge=<locked|short> [dirty=yes] why=<…>
#   tier=full  : implementer + one review-final (+ review-ux when ux=required) + at most one fix round
#   tier=light : lane edits directly, no worker; the host reads the diff; CI decides
# full when any of: non-test, non-doc source under the full paths (old or new side of a rename);
#   review-plan.py flags.permission; review-plan.py ux=required.
# verify=full when any file (tests included, docs excluded) under the full paths, or a shared path, changes.
# Only committed changes count; uncommitted ones are reported as dirty=yes.
set -u
base=${1:-origin/main}
head=${2:-HEAD}
mb=$(git merge-base "$base" "$head") || { echo "tier: no merge-base" >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
. "$(dirname "$0")/shared-paths.sh"

full_re='^(packages/sdk/(kernel|components|shell|ui|contracts)/|packages/adapters/(mock-server|http-adapter|server-conformance|fo-bridge)/|apps/platform-web/|apps/fo-backend/|apps/fo-frontend/|packages/fo-shared/)'
test_re='(/__tests__/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$)'
doc_re='\.md$'

tier=light verify=light merge=short why=""
while IFS=$'\t' read -r status a b; do
  [ -n "${status:-}" ] || continue
  for path in "$a" ${b:+"$b"}; do
    if printf '%s' "$path" | grep -qE "$shared_re"; then merge=locked verify=full; why="$why shared:$path"; fi
    printf '%s' "$path" | grep -qE "$doc_re" && continue
    printf '%s' "$path" | grep -qE "$full_re" || continue
    verify=full
    case "$status" in R100) continue ;; esac
    printf '%s' "$path" | grep -qE "$test_re" && continue
    tier=full; why="$why full:$path"
  done
done < <(git diff --name-status -M "$mb" "$head")

plan=$(python3 "$HOME/.agents/skills/issue-wave-conductor/scripts/review-plan.py" "$root" --base "$mb" --head "$head" 2>/dev/null | tail -1)
case "$plan" in *'"permission": true'*) tier=full; why="$why flag:permission" ;; esac
case "$plan" in *'"ux": "required"'*) tier=full; why="$why ux:required" ;; esac

dirty=""
[ -n "$(git status --porcelain --untracked-files=no)" ] && dirty=" dirty=yes"
echo "tier=$tier verify=$verify merge=$merge$dirty why=$(printf '%s' "${why# }" | cut -c1-300)"
