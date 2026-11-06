#!/usr/bin/env bash
# Pre-merge check, run on every merge path (addenda/merge.md): is main green, and did main change a shared path
# since this PR branched?
# usage: merge-precheck.sh [--main-fix] <pr> <branch> <head-sha> | --help | --self-test
#   Run inside the merge.lock, before `gh pr merge`.
# Gates, in order:
#   main CI    the latest completed ci.yml push run on main (`gh run list --branch main --workflow ci.yml
#              --event push`) must not be failure/timed_out/startup_failure, and $AP_MAIN/.review/lanes/main-red
#              (written by main-ci-watch.sh) must not exist. Either one is exit 4. `--main-fix` skips both: the PR
#              is the fix for the red main.
#   shared     main changed a shared path (shared-paths.sh) since the branch point: exit 3.
# Exit: 0 safe to merge / 3 rebase needed (prints REBASE-NEEDED and the files) / 4 main CI is red (names the run)
#   / 64 bad arguments / 2 git or gh failed.
# Env: AP_MAIN (default: the git common dir's parent),
#   MERGE_PRECHECK_RUNS_CMD (self-test only: a command that prints the `gh run list` JSON).
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
usage() { awk '/^set -u/{exit} NR > 1 && /^#/ {sub(/^# ?/, ""); print}' "$0"; }

# stdin: gh run list JSON (newest first). Prints "ok" or "red <run url or id> <sha>" for the latest completed run.
latest_main_ci() {
  python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin)
except ValueError:
    print("unreadable"); sys.exit(0)
for r in runs if isinstance(runs, list) else []:
    if r.get("status") != "completed":
        continue
    if r.get("conclusion") in ("failure", "timed_out", "startup_failure"):
        print("red %s %s" % (r.get("url") or r.get("databaseId") or "?", (r.get("headSha") or "?")[:10]))
    else:
        print("ok")
    sys.exit(0)
print("ok")
'
}

main_ci_gate() { # <ap_main>; returns 0 green / 4 red / 2 gh failed
  local main=$1 runs verdict
  if [ -n "$main" ] && [ -f "$main/.review/lanes/main-red" ]; then
    echo "MAIN-RED: $main/.review/lanes/main-red exists ($(tr '\n' ' ' <"$main/.review/lanes/main-red")); merge only the fix with --main-fix" >&2
    return 4
  fi
  if [ -n "${MERGE_PRECHECK_RUNS_CMD:-}" ]; then
    runs=$(eval "$MERGE_PRECHECK_RUNS_CMD") || { echo "merge-precheck: run-list command failed" >&2; return 2; }
  else
    runs=$(gh run list --branch main --workflow ci.yml --event push --limit 5 \
      --json status,conclusion,headSha,databaseId,url) || { echo "merge-precheck: gh run list failed" >&2; return 2; }
  fi
  verdict=$(printf '%s' "$runs" | latest_main_ci)
  case "$verdict" in
    ok) return 0 ;;
    red\ *) echo "MAIN-RED: the latest main push CI failed: ${verdict#red } — merge only the fix with --main-fix" >&2; return 4 ;;
    *) echo "merge-precheck: main CI run list unreadable: $runs" >&2; return 2 ;;
  esac
}

self_test() {
  local T rc pass out
  T=$(mktemp -d "${TMPDIR:-/tmp}/ap-merge-precheck-self-test.XXXXXX") || return 1
  cleanup() { rm -rf "$T"; }
  pass=0
  fail() { echo "self-test failed: $1"; cleanup; exit 1; }
  expect() { [ "$1" -eq "$rc" ] && { pass=$((pass + 1)); return 0; }; fail "$2: exit $rc, expected $1"; }
  mkdir -p "$T/main/.review/lanes"
  export AP_MAIN="$T/main"
  fixture() { printf '%s\n' "$1" >"$T/runs.json"; MERGE_PRECHECK_RUNS_CMD="cat '$T/runs.json'"; export MERGE_PRECHECK_RUNS_CMD; }

  bash "$0" >/dev/null 2>&1; rc=$?; expect 64 "usage"
  bash "$0" 1 b >/dev/null 2>&1; rc=$?; expect 64 "two arguments"

  # The gate alone (main_ci_gate): green, red, in-progress newest run skipped, cancelled is not red, marker.
  fixture '[{"status":"completed","conclusion":"success","headSha":"aaaaaaaaaaaa","databaseId":1,"url":"u1"}]'
  main_ci_gate "$AP_MAIN" 2>/dev/null; rc=$?; expect 0 "green main"
  fixture '[{"status":"completed","conclusion":"failure","headSha":"bbbbbbbbbbbb","databaseId":2,"url":"https://example.test/run/2"}]'
  out=$(main_ci_gate "$AP_MAIN" 2>&1); rc=$?; expect 4 "red main"
  case "$out" in *https://example.test/run/2*) pass=$((pass + 1)) ;; *) fail "red main: run url missing in: $out" ;; esac
  fixture '[{"status":"in_progress","conclusion":null,"headSha":"cccccccccccc","databaseId":3,"url":"u3"},{"status":"completed","conclusion":"failure","headSha":"bbbbbbbbbbbb","databaseId":2,"url":"u2"}]'
  main_ci_gate "$AP_MAIN" 2>/dev/null; rc=$?; expect 4 "in-progress run skipped, older completed run is red"
  fixture '[{"status":"completed","conclusion":"cancelled","headSha":"dddddddddddd","databaseId":4,"url":"u4"}]'
  main_ci_gate "$AP_MAIN" 2>/dev/null; rc=$?; expect 0 "cancelled is not red"
  fixture 'not json'
  main_ci_gate "$AP_MAIN" 2>/dev/null; rc=$?; expect 2 "unreadable run list"
  fixture '[{"status":"completed","conclusion":"success","headSha":"aaaaaaaaaaaa","databaseId":1,"url":"u1"}]'
  printf 'sha=bbbb\nrun=2\n' >"$AP_MAIN/.review/lanes/main-red"
  out=$(main_ci_gate "$AP_MAIN" 2>&1); rc=$?; expect 4 "main-red marker blocks even when the last run is green"
  case "$out" in *MAIN-RED*) pass=$((pass + 1)) ;; *) fail "marker: no MAIN-RED message" ;; esac

  # Full script with a fake git (no network): --main-fix skips both gates and reaches the git step (exit 2);
  # without it the marker stops the script first (exit 4).
  mkdir -p "$T/bin"
  printf '#!/bin/sh\nexit 1\n' >"$T/bin/git"; chmod +x "$T/bin/git"
  PATH="$T/bin:$PATH" bash "$0" --main-fix 1 b 0000000000000000000000000000000000000000 >"$T/out" 2>&1; rc=$?
  expect 2 "--main-fix skips the main CI gate"
  PATH="$T/bin:$PATH" bash "$0" 1 b 0000000000000000000000000000000000000000 >"$T/out" 2>&1; rc=$?
  expect 4 "marker blocks the full script"

  cleanup
  echo "merge-precheck.sh self-test passed: $pass checks (usage, green, red names run, in-progress skipped, cancelled, unreadable, main-red marker, --main-fix skips gate)"
}

fix=0
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
  --main-fix) fix=1; shift ;;
esac
[ $# -eq 3 ] || { echo "usage: merge-precheck.sh [--main-fix] <pr> <branch> <head-sha>" >&2; exit 64; }
pr=$1 branch=$2 sha=$3

if [ "$fix" -eq 0 ]; then
  main=${AP_MAIN:-}
  if [ -z "$main" ]; then
    common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && main=$(dirname "$common")
  fi
  main_ci_gate "$main"; rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
fi

. "$SCRIPT_DIR/shared-paths.sh"
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
