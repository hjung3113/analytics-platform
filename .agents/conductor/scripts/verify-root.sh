#!/usr/bin/env bash
# Run the root checks in order and log each step (PROFILE §Verify, stage 2).
#   verify-root.sh [--light] <log-dir>
# Steps: lint → typecheck (without a lock) → test → build. Run test and build together under heavy.lock (with-lock.sh, purpose `verify-root foreground`; an owner is required, so set WITH_LOCK_OWNER outside Orca).
# --light: run lint and typecheck only; do not acquire heavy.lock (when tier.sh prints verify=light; PROFILE §Verify).
# Logs: <log-dir>/<step>.log — full output and final line `exit=<code>`. Stop at the first failure and return that step's code.
# At the end, print `step=<name> exit=<n> seconds=<s>` to stdout for each step.
# Exit codes: 0 success / that step's code / 3 if capacity.sh returns start=no (no lock is acquired; one-line reason) / 75 if heavy.lock is already held (the same value is returned if child test or build returns 75) / 2 if owner (ORCA_TERMINAL_HANDLE or WITH_LOCK_OWNER) is missing / 64 for invalid arguments.
# Do not pass a worker count or --concurrency: turbo.json concurrency and the ~/.zshenv Vitest cap define them. The root package.json scripts already apply --filter='!@fops/*'.
set -u

light=0
if [ "${1:-}" = "--light" ]; then light=1; shift; fi
[ $# -eq 1 ] || { echo "usage: verify-root.sh [--light] <log-dir>" >&2; exit 64; }
logdir=$1
mkdir -p "$logdir" || exit 64
here=$(cd "$(dirname "$0")" && pwd)
logdir=$(cd "$logdir" && pwd) || exit 64  # Convert to an absolute path before changing to the repository root.
cd "$(git rev-parse --show-toplevel)" || exit 64  # Run root checks even when invoked from a subdirectory.

summary=""
run_step() { # run_step <name> <command...> — return the exit code and record the log and summary.
  name=$1; shift
  start=$(date +%s)
  "$@" >"$logdir/$name.log" 2>&1
  rc=$?
  echo "exit=$rc" >>"$logdir/$name.log"
  summary="${summary}step=$name exit=$rc seconds=$(( $(date +%s) - start ))
"
  return $rc
}
finish() { printf '%s' "$summary"; exit "$1"; }

run_step lint pnpm lint || finish $?
run_step typecheck pnpm typecheck || finish $?
[ "$light" = 1 ] && finish 0

cap=$(bash "$here/capacity.sh" 2>/dev/null)
case "$cap" in
  *"start=no"*) echo "verify-root: capacity start=no — ${cap}" ; printf '%s' "$summary"; exit 3 ;;
esac

test_build() { # Run test → build under one lock. The subshell summary is passed through a file.
  for s in test build; do
    st=$(date +%s)
    pnpm "$s" >"$logdir/$s.log" 2>&1
    rc=$?
    echo "exit=$rc" >>"$logdir/$s.log"
    echo "step=$s exit=$rc seconds=$(( $(date +%s) - st ))" >>"$logdir/.tb-summary"
    [ "$rc" -eq 0 ] || return $rc
  done
}
: >"$logdir/.tb-summary"
export logdir
bash "$here/with-lock.sh" heavy.lock "verify-root foreground" -- bash -c "$(declare -f test_build); test_build"
rc=$?
[ -s "$logdir/.tb-summary" ] && summary="${summary}$(cat "$logdir/.tb-summary")
"
[ "$rc" -eq 75 ] && echo "verify-root: heavy.lock is already held" >&2
finish $rc
