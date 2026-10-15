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

# A reasoned disable carries `--` and a non-blank reason after the eslint directive, judged only
# inside the content of the comment holding the directive: a line comment runs to end of line, a
# block comment (JSX `{/* ... */}` alike) ends before its `*/` — the closer is not reason text —
# and `--` in code outside that comment is not a reason. One python3 function judges both paths.
judge_disables() { python3 -c '
import re, sys

def reasoned(line):
    # True when the eslint directive on this line sits in a comment whose own content,
    # after the directive, carries `--` and a non-blank reason.
    i = line.find("eslint-disable")
    if i < 0:
        return True
    spans, j, n = [], 0, len(line)  # comment spans; the end excludes //, /* and */
    while j < n:
        if line.startswith("//", j):
            spans.append((j + 2, n))
            break
        if line.startswith("/*", j):
            k = line.find("*/", j + 2)
            spans.append((j + 2, n if k < 0 else k))
            j = n if k < 0 else k + 2
            continue
        j += 1
    for a, b in spans:
        if a <= i < b:
            return re.search(r"--\s*\S", line[i:b]) is not None
    return False

for entry in sys.stdin:
    prefix, _, line = entry.rstrip("\n").partition("\t")
    if not reasoned(line):
        print(prefix + line)
'; }
disables=$(git diff -U0 "$mb" -- apps packages menus | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+/ && /eslint-disable/ { print file ": \t" substr($0, 2) }' | judge_disables)
untracked_disables=$(git ls-files --others --exclude-standard -z -- apps packages menus \
  | xargs -0 grep -Hn 'eslint-disable' 2>/dev/null \
  | awk '{ line = $0; sub(/^[^:]*:[0-9]+:/, "", line)
           print substr($0, 1, length($0) - length(line)) "\t" line }' | judge_disables)
if [ -n "$disables$untracked_disables" ]; then
  found=1
  echo "NEW eslint-disable without a reason (forbidden; fix the code or use the token the lint error suggests):"
  printf '%s\n' "$disables" "$untracked_disables" | sed '/^$/d; s/^/  /'
fi

# Sum every rule's count with the stdlib JSON parser (ESLint bulk suppressions: file -> rule -> {count}):
# line-oriented matching under-counted multi-rule files and read compact single-line JSON as
# one count. A read or parse failure fails the check instead of guessing a total.
count_sum() { python3 -c '
import json, sys
try:
    if sys.argv[1] == "-":
        data = json.load(sys.stdin)
    else:
        with open(sys.argv[1], encoding="utf-8") as src:
            data = json.load(src)
    total = sum(int(rule["count"]) for rules in data.values() for rule in rules.values())
except Exception as err:
    sys.exit(f"worker-hygiene: cannot parse eslint-suppressions.json ({sys.argv[1]}): {err}")
print(total)' "$1"; }
for f in $(git diff --name-only "$mb" -- '*eslint-suppressions.json'); do
  if [ ! -e "$f" ]; then continue; fi  # deleted against the base: after is 0, a decrease passes
  if git cat-file -e "$mb:$f" 2>/dev/null; then
    before=$(git show "$mb:$f" 2>/dev/null | count_sum -) || { found=1; echo "unreadable eslint-suppressions.json at $base: $f"; continue; }
  else
    before=0
  fi
  if ! after=$(count_sum "$f"); then found=1; echo "unreadable eslint-suppressions.json: $f"; continue; fi
  if [ "$after" -gt "$before" ]; then
    found=1
    echo "eslint-suppressions.json grew (forbidden; fix the code and prune instead): $f ($before -> $after)"
  fi
done
for f in $(git ls-files --others --exclude-standard -- '*eslint-suppressions.json'); do
  if ! after=$(count_sum "$f"); then found=1; echo "unreadable eslint-suppressions.json: $f"; continue; fi
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
