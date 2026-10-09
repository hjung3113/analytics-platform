#!/bin/bash
# worker-hygiene.sh <worktree> — the two worker violations this repo's rules forbid (root AGENTS.md):
#   1. A new `eslint-disable` without a reason fails: `pnpm lint` errors name the token/variant/component to use
#      instead, so suppressions should never be needed.
#   2. eslint-suppressions.json growing fails: fix the code and prune; never add new violations. Shrinking is fine.
# Whitespace-only churn is reported, not failed: re-indentation can be legitimate, so the conductor reads the diff
# of each listed file before committing. Only product sources count: apps/ packages/ menus/.
# Compares the working tree (commits + uncommitted + untracked) with the merge-base of HYGIENE_BASE (default origin/main).
wt=${1:?usage: worker-hygiene.sh <worktree>}; cd "$wt" || exit 2
base=${HYGIENE_BASE:-origin/main}; limit=${HYGIENE_WS_LINES:-6}
mb=$(git merge-base "$base" HEAD) || exit 2
found=0

disables=$(git diff -U0 "$mb" -- apps packages menus | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+/ && /eslint-disable/ && !/--/ { print file ": " substr($0, 2) }')
untracked_disables=$(git ls-files --others --exclude-standard -z -- apps packages menus | xargs -0 grep -Hn 'eslint-disable' 2>/dev/null | grep -v -- '--')
if [ -n "$disables$untracked_disables" ]; then
  found=1
  echo "NEW eslint-disable without a reason (forbidden; fix the code or use the token the lint error suggests):"
  printf '%s\n' "$disables" "$untracked_disables" | sed '/^$/d; s/^/  /'
fi

count_sum() { awk 'match($0, /"count"[[:space:]]*:[[:space:]]*[0-9]+/) { n = substr($0, RSTART, RLENGTH); sub(/.*:[[:space:]]*/, "", n); s += n } END { print s + 0 }' "${1:--}" 2>/dev/null; }
for f in $(git diff --name-only "$mb" -- '*eslint-suppressions.json'); do
  before=$(git show "$mb:$f" 2>/dev/null | count_sum)
  after=$(count_sum "$f")
  if [ "$after" -gt "$before" ]; then
    found=1
    echo "eslint-suppressions.json grew (forbidden; fix the code and prune instead): $f ($before -> $after)"
  fi
done
for f in $(git ls-files --others --exclude-standard -- '*eslint-suppressions.json'); do
  after=$(count_sum "$f")
  if [ "$after" -gt 0 ]; then
    found=1
    echo "new eslint-suppressions.json (forbidden; fix the code instead): $f ($after)"
  fi
done

churn=$(awk -F'\t' -v limit="$limit" '
  FILENAME == ARGV[1] { if ($1 != "-") ws[$3] = $1 + $2; next }
  $1 != "-" { d = $1 + $2 - ws[$3]; if (d > limit) print "  " $3 ": " d " changed lines differ only in whitespace" }' \
  <(git diff -w --numstat "$mb" -- apps packages menus) <(git diff --numstat "$mb" -- apps packages menus))
if [ -n "$churn" ]; then
  echo "Review (not a failure): whitespace-only lines; confirm each is re-indentation the change needed:"
  echo "$churn"
fi

[ "$found" -eq 0 ] && echo "worker-hygiene: no new eslint-disable, suppressions did not grow"
exit "$found"
