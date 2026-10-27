#!/usr/bin/env bash
# List open PRs that touch the same files as this branch, so the lead can set the merge order (LANES §Shared paths).
# usage: shared-overlap.sh [<base> [<head>]]   committed diff, default origin/main HEAD
#        shared-overlap.sh --paths <path>[,<path>…]   planned paths before a commit (a trailing / matches a prefix)
# output: one line per overlapping PR — `overlap pr=#<n> branch=<b> files=<a,b,…>` — then
#         `shared=<yes|no> order=<hint>` where yes means a shared path is among the overlaps (tier.sh's merge=locked list).
#         No overlap: `overlap=none`.
# order hint: the lower PR number is the earlier one; this branch's own PR is excluded. The lead decides, this is the input.
# Exit: 0 / 64 bad arguments / 2 gh failed.
set -u
. "$(dirname "$0")/shared-paths.sh"
if [ "${1:-}" = "--paths" ]; then
  [ -n "${2:-}" ] || { echo "usage: shared-overlap.sh --paths <path>[,<path>…]" >&2; exit 64; }
  mine=$(printf '%s' "$2" | tr ',' '\n')
else
  base=${1:-origin/main} head=${2:-HEAD}
  mb=$(git merge-base "$base" "$head") || { echo "shared-overlap: no merge-base" >&2; exit 64; }
  mine=$(git diff --name-only -M "$mb" "$head")
fi
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
prs=$(gh pr list --state open --limit 100 --json number,headRefName,files 2>/dev/null) || { echo "shared-overlap: gh pr list failed" >&2; exit 2; }
out=$(MINE="$mine" BRANCH="$branch" python3 -c '
import json, os, re, sys
mine = [p for p in os.environ["MINE"].split("\n") if p]
shared = re.compile(sys.argv[1])
rows, any_shared = [], False
for pr in sorted(json.load(sys.stdin), key=lambda p: p["number"]):
    if pr["headRefName"] == os.environ["BRANCH"]:
        continue
    theirs = [f["path"] for f in pr.get("files", [])]
    hit = sorted({t for t in theirs for m in mine if t == m or (m.endswith("/") and t.startswith(m))})
    if hit:
        rows.append(pr["number"])
        any_shared = any_shared or any(shared.search(h) for h in hit)
        print("overlap pr=#%d branch=%s files=%s" % (pr["number"], pr["headRefName"], ",".join(hit)))
if not rows:
    print("overlap=none")
else:
    print("shared=%s order=%s" % ("yes" if any_shared else "no", ">".join("#%d" % n for n in rows) + ">this"))
' "$shared_re" <<<"$prs") || exit 2
printf '%s\n' "$out"
