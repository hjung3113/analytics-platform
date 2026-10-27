#!/usr/bin/env bash
# Verdict of an aggregate required check (#1019): passes only when every named upstream job result is exactly `success`.
# A job that is skipped, cancelled or failed fails the check, so a required check can never report Success for work that did not run.
# (A docs-only run is `success` too: the sub-jobs always run and only skip their steps.)
#
#   .github/scripts/require-success.sh <name>=<result> [<name>=<result> ...]
#   .github/scripts/require-success.sh --self-test
set -u

if [ "${1:-}" = "--self-test" ]; then
  bad=0
  expect() { # <want exit> <args...>
    want="$1"; shift
    out="$("$0" "$@" 2>&1)"; got=$?
    if [ "$got" -eq "$want" ]; then echo "ok   $*"; else echo "FAIL $* → exit $got, want $want: $out"; bad=1; fi
  }
  for s in success failure cancelled skipped ''; do
    for t in success failure cancelled skipped ''; do
      if [ "$s" = success ] && [ "$t" = success ]; then want=0; else want=1; fi
      expect "$want" "static=$s" "test=$t"
    done
  done
  expect 1
  [ "$bad" -eq 0 ] && echo "require-success self-test passed"
  exit "$bad"
fi

[ "$#" -gt 0 ] || { echo "require-success: no results given" >&2; exit 1; }
status=0
for pair in "$@"; do
  name="${pair%%=*}"; result="${pair#*=}"
  echo "$name: ${result:-<empty>}"
  [ "$result" = success ] || status=1
done
exit "$status"
