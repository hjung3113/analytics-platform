#!/usr/bin/env bash
# Pre-merge check for the short-lock path (addenda/merge.md step 3): did main change a shared path since this PR branched?
# usage: merge-precheck.sh <pr> <branch> <head-sha>   run inside the merge.lock, before `gh pr merge`
# Exit: 0 safe to merge / 3 rebase needed (prints REBASE-NEEDED and the files) / 64 bad arguments / 2 git failed.
set -u
[ $# -eq 3 ] || { echo "usage: merge-precheck.sh <pr> <branch> <head-sha>" >&2; exit 64; }
pr=$1 branch=$2 sha=$3
. "$(dirname "$0")/shared-paths.sh"
git fetch -q origin main || { echo "merge-precheck: fetch failed" >&2; exit 2; }
git cat-file -e "$sha^{commit}" 2>/dev/null || { echo "merge-precheck: unknown sha $sha" >&2; exit 2; }
mb=$(git merge-base origin/main "$sha") || { echo "merge-precheck: no merge-base for #$pr ($branch)" >&2; exit 2; }
files=$(git diff --name-only "$mb" origin/main) || exit 2
hit=$(printf '%s\n' "$files" | grep -E "$shared_re")
if [ -n "$hit" ]; then
  echo "REBASE-NEEDED #$pr: main changed shared paths since the branch point:"
  printf '%s\n' "$hit"
  exit 3
fi
echo "merge-precheck ok #$pr"
