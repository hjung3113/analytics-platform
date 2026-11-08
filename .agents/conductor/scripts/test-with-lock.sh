#!/usr/bin/env bash
# Smallest test of with-lock.sh's shared merge lock, using a stub shared-lock.py (no network). Prints PASS; exit 1 on failure.
set -u
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/main/.review"
cat >"$tmp/stub.py" <<'PY'
import os, sys
log = os.environ["STUB_LOG"]
open(log, "a").write(sys.argv[1] + "\n")
if sys.argv[1] == "acquire":
    sys.exit(int(os.environ.get("STUB_ACQUIRE_RC", "0")))
PY
export AP_MAIN="$tmp/main" WITH_LOCK_OWNER=t SHARED_LOCK_PY="$tmp/stub.py" SHARED_LOCK_REPO=o/r STUB_LOG="$tmp/log"
fail=0
expect() { [ "$2" = "$3" ] || { echo "FAIL $1: got '$2' want '$3'"; fail=1; }; }
run() { bash "$here/with-lock.sh" "$@" >/dev/null 2>&1; echo $?; }

expect "merge ok" "$(STUB_ACQUIRE_RC=0 run merge.lock p -- true)" 0
expect "merge ok calls" "$(tr '\n' ' ' <"$tmp/log")" "acquire release "
: >"$tmp/log"
expect "child rc passes" "$(STUB_ACQUIRE_RC=0 run merge.lock p -- bash -c 'exit 7')" 7
expect "held -> 75" "$(STUB_ACQUIRE_RC=75 run merge.lock p -- true)" 75
expect "api failure -> 2" "$(STUB_ACQUIRE_RC=2 run merge.lock p -- true)" 2
expect "local lock freed after shared failure" "$(ls "$tmp/main/.review" | grep -c '^merge.lock$')" 0
: >"$tmp/log"
expect "heavy.lock stays local" "$(run heavy.lock p -- true)" 0
expect "heavy.lock never calls shared" "$(wc -c <"$tmp/log" | tr -d ' ')" 0
[ "$fail" = 0 ] && echo PASS
exit "$fail"
