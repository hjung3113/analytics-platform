#!/usr/bin/env bash
# Acquire a machine-resource lock and release it when the child command ends (success, failure, or signal) (LANES §Machine resources).
# The lock protocol is unchanged: acquire $AP_MAIN/.review/<lock> with mkdir and write owner, since, and purpose.
# On release, use mv + trash only if owner is ours (never use rm). This script implements that protocol; direct mkdir acquisition remains valid.
# Also writes a `token` file ($$-<epoch>-$RANDOM). Release requires both owner and token to match — processes with the same handle (subagents or background commands in one terminal) cannot release a lock acquired by someone else.
# The purpose ends with `, pid <wrapper PID>, pgid <child group>`, so lock-audit.sh detects a lock left by SIGKILL using the PID; if the child group is alive, the lock is held.
#
# Usage: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>
# Exit code: the child's exit code. If already held (including nested acquisition of the same lock, which fails immediately without deadlock), do not run the command and return 75 (one line: with-lock: <lock> held by …).
#   If the child itself returns 75, it cannot be distinguished from "already held" (only the already-held case skips the command and writes `with-lock: … held by` to stdout). Argument errors (including empty purpose): 64. Missing AP_MAIN/.review or owner: 2.
# Environment variables: AP_MAIN (default: the shared repository root of the worktree containing the current working directory (cwd)),
#   ORCA_TERMINAL_HANDLE (owner; if absent, use WITH_LOCK_OWNER; if both are absent, exit 2 — do not rename it to `foreground`).
# Signals: the child runs in a new process group (set -m). On TERM, HUP, or INT, forward TERM to the entire group (including grandchildren), wait for it to exit, then release the lock.
#   SIGKILL cannot be caught — the lock remains, and lock-audit.sh finds it using the PID in purpose. Do not use commands that need to read tty from stdin; they stop in the background group.
# Compatible with macOS (bash 3.2, BSD date).
set -u

usage() { echo "usage: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>" >&2; exit 64; }

[ $# -ge 4 ] || usage
lock_name=$1
purpose=$2
[ "$3" = "--" ] || usage
shift 3
[ -n "$(printf '%s' "$purpose" | tr -d '[:space:]')" ] || { echo "with-lock: purpose is empty" >&2; usage; }

case "$lock_name" in
  heavy.lock|browser.lock|merge.lock) ;;
  worker-slot-[0-9]*) case "${lock_name#worker-slot-}" in *[!0-9]*) usage ;; esac ;;
  *) echo "with-lock: unknown lock name '$lock_name'" >&2; usage ;;
esac

if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
[ -d "${AP_MAIN:-}/.review" ] || { echo "with-lock: AP_MAIN/.review not found (AP_MAIN=${AP_MAIN:-})" >&2; exit 2; }

me=${ORCA_TERMINAL_HANDLE:-${WITH_LOCK_OWNER:-}}
[ -n "$me" ] || { echo "with-lock: neither ORCA_TERMINAL_HANDLE nor WITH_LOCK_OWNER is set — refusing to acquire without an owner" >&2; exit 2; }

lock="$AP_MAIN/.review/$lock_name"

if ! mkdir "$lock" 2>/dev/null; then
  o=$(cat "$lock/owner" 2>/dev/null | tr -d '\n')
  s=$(cat "$lock/since" 2>/dev/null | tr -d '\n')
  p=$(cat "$lock/purpose" 2>/dev/null | tr '\n' ' ')
  echo "with-lock: $lock_name held by ${o:-none} since ${s:-none} purpose ${p:-none}"
  exit 75
fi
token="$$-$(date +%s)-$RANDOM"
printf '%s\n' "$me" >"$lock/owner"
printf '%s\n' "$token" >"$lock/token"
date -u +%FT%TZ >"$lock/since"
printf '%s, pid %s\n' "$purpose" "$$" >"$lock/purpose"

released=0
release() {
  [ "$released" = 1 ] && return 0
  released=1
  # Release only if both owner and token are ours. If someone else released and reacquired it, do not touch it.
  [ "$(cat "$lock/owner" 2>/dev/null | tr -d '\n')" = "$me" ] || return 0
  [ "$(cat "$lock/token" 2>/dev/null | tr -d '\n')" = "$token" ] || return 0
  if mv "$lock" "$lock.released-$$" 2>/dev/null; then
    if command -v trash >/dev/null 2>&1; then
      trash "$lock.released-$$" || echo "with-lock: trash failed; $lock.released-$$ remains" >&2
    else
      echo "with-lock: trash is unavailable; leaving $lock.released-$$ (manual cleanup required)" >&2
    fi
  fi
}

child=0
exit_code=143
on_signal() { # Forward TERM to the entire child group, wait for it to exit, then release the lock.
  exit_code=$1
  if [ "$child" -gt 0 ]; then
    kill -TERM -- "-$child" 2>/dev/null
    wait "$child" 2>/dev/null
  fi
  release
  exit "$exit_code"
}
trap 'release' EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM
trap 'on_signal 129' HUP

set -m # Start the child in a new process group (pgid = child PID).
"$@" <&0 &  # Run in the background while preserving stdin.
child=$!
set +m
printf '%s, pid %s, pgid %s\n' "$purpose" "$$" "$child" >"$lock/purpose"  # lock-audit.sh can detect a surviving child group even if only the wrapper receives SIGKILL.
wait "$child"
rc=$?
child=0
release
exit $rc
