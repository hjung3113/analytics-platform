#!/usr/bin/env bash
# Find locks that remain after work is done ("30-minute lock audit", LANES §Stale lock check). This script does not release locks —
# the release order is LANES ② (notify the owner → lead after 10 minutes). macOS only (`date -j`).
#
# This script does not read the token file in a lock directory (the value with-lock.sh checks with owner when releasing).
# Targets: $AP_MAIN/.review/{heavy.lock,browser.lock,merge.lock,worker-slot-*}. One line per lock:
#   <lock> owner=<handle> since=<ISO> age=<minutes> verdict=<...> why=<evidence>
# verdict:
#   held                   the owner is alive and there is no evidence the work finished (or minimum age has not passed)
#   owner-gone             the owner file has been absent for more than 5 minutes or the handle is not in orca terminal list (LANES ①)
#   done-pr-merged/closed  the PR in purpose (#n or PR n) was merged/closed
#   done-pid-dead          the purpose PID (with-lock.sh appends `, pid <wrapper PID>, pgid <child group>`; if any process remains in the pgid group, the result is held even if the wrapper is dead; otherwise this checks the worker-state JSON PID for worker-slot-* and heavy.lock, except for foreground and terminal purposes, and returns this result only when all candidates are dead) is absent or belongs to another process (PID reuse)
#   done-ship-not-running  purpose includes ship and no ship-pr process exists
#   unknown                since or purpose is missing, so there is no evidence to decide
# Emit done-* only when age is at least LOCK_AUDIT_MIN_AGE_MIN (default 30) minutes. Exit code: 10 if any result is done-* or owner-gone; otherwise 0.
# Optional environment variables: AP_MAIN (default: shared repository root for the worktree containing this script), LOCK_AUDIT_MIN_AGE_MIN, LOCK_AUDIT_OWNERLESS_MIN (5).
set -u

min_age=${LOCK_AUDIT_MIN_AGE_MIN:-30}
ownerless_min=${LOCK_AUDIT_OWNERLESS_MIN:-5}
if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
[ -d "${AP_MAIN:-}/.review" ] || { echo "lock-audit: AP_MAIN/.review missing (AP_MAIN=${AP_MAIN:-})" >&2; exit 2; }
now=$(date +%s)

handles=$(orca terminal list --json 2>/dev/null | grep -o '"handle": *"[^"]*"' | sed 's/.*"\(term_[^"]*\)"/\1/')
have_handles=0; [ -n "$handles" ] && have_handles=1

to_epoch() { # ISO (UTC) or epoch number -> epoch; empty if unreadable
  case "$1" in
    ''|*[!0-9]*) date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s 2>/dev/null ;;
    *) echo "$1" ;;
  esac
}

rc=0
shopt -s nullglob
for lock in "$AP_MAIN"/.review/heavy.lock "$AP_MAIN"/.review/browser.lock "$AP_MAIN"/.review/merge.lock "$AP_MAIN"/.review/worker-slot-*; do
  [ -d "$lock" ] || continue
  name=$(basename "$lock")
  owner=$(cat "$lock/owner" 2>/dev/null | tr -d '\n')
  since_raw=$(cat "$lock/since" 2>/dev/null | tr -d '\n')
  purpose=$(cat "$lock/purpose" 2>/dev/null | tr '\n' ' ')
  since_ep=$(to_epoch "$since_raw")
  if [ -n "$since_ep" ]; then
    age=$(( (now - since_ep) / 60 ))
  else
    since_ep=$(stat -f %m "$lock" 2>/dev/null || echo "$now")  # If since is missing, use directory mtime only to calculate age.
    age=$(( (now - since_ep) / 60 ))
  fi
  verdict=unknown; why="since/purpose missing"

  if [ -z "$owner" ]; then
    if [ "$age" -ge "$ownerless_min" ]; then verdict=owner-gone; why="no owner file for ${age} min"; else verdict=held; why="no owner file (${age} min; threshold ${ownerless_min} min)"; fi
  elif [ "$have_handles" = 1 ] && ! printf '%s\n' "$handles" | grep -qxF "$owner"; then
    verdict=owner-gone; why="owner handle is not in orca terminal list"
  elif [ -z "$purpose" ]; then
    verdict=unknown; why="purpose missing"
  else
    verdict=held; why="no evidence work finished"
    pr=$(printf '%s' "$purpose" | sed -nE 's/.*(#|PR[ #]*)([0-9]+).*/\2/p' | head -1)
    pid=$(printf '%s' "$purpose" | sed -nE 's/.*[Pp][Ii][Dd][ =:]*([0-9]+).*/\1/p' | head -1)
    pgid=$(printf '%s' "$purpose" | sed -nE 's/.*pgid[ =:]*([0-9]+).*/\1/p' | head -1)
    done_v=""; done_w=""; pid_src=""; pg_alive=0
    # Even without a PID or PR in purpose, worker-slot-* and heavy.lock use its first token (issue or node name, e.g. `1011b FIX2`, `961a impl`)
    # to find worker-state JSON ($AP_MAIN/.review/wave/state-*/W-<name>.json or W-<name>-*.json). Decide conservatively; use held when uncertain:
    #  - If purpose contains foreground or terminal (a host-run check or Orca terminal worker whose owner has no PID), do not use a fallback decision.
    #  - Exclude JSON whose started_at is more than 120 seconds before the lock's since value (a different worker from before this lock).
    #  - If the first and second tokens (alphanumeric or `-`) narrow W-<name>-<second>*.json to exactly one candidate, use its pid.
    #    If not narrowed to one, return done-pid-dead only when every candidate PID is dead; if any is alive or there are no candidates, return held.
    #  - If a second token exists but matches no candidate name, return held. Exception: if the second token is `impl` and W-<first token>.json is a candidate, use that candidate.
    #  Prefix-only matching such as `W-1011b*` can include 1011b2, so restrict the suffix to `.json` or `-`.
    case "$name" in worker-slot-*|heavy.lock)
      if [ -z "$pr" ] && [ -z "$pid" ] && ! printf '%s' "$purpose" | grep -qiE 'foreground|terminal'; then
        tok1=$(printf '%s' "$purpose" | awk '{print $1}'); tok2=$(printf '%s' "$purpose" | awk '{print $2}')
        printf '%s' "$tok1" | grep -qE '^[0-9][A-Za-z0-9]*$' || tok1=""
        printf '%s' "$tok2" | grep -qE '^[A-Za-z0-9-]+$' || tok2=""
        if [ -n "$tok1" ]; then
          cand=""; narrowed=""
          # Do not use ls while nullglob is enabled (with no matches, ls would have no arguments).
          for f in "$AP_MAIN"/.review/wave/state-*/W-"$tok1".json "$AP_MAIN"/.review/wave/state-*/W-"$tok1"-*.json; do
            t=$(sed -nE 's/.*"started_at": *([0-9]+).*/\1/p' "$f" | head -1)
            [ -n "$t" ] && [ "$t" -ge $(( since_ep - 120 )) ] && cand="$cand $f"
          done
          if [ -n "$tok2" ]; then
            for f in "$AP_MAIN"/.review/wave/state-*/W-"$tok1"-"$tok2"*.json; do
              case " $cand " in *" $f "*) narrowed="$narrowed $f" ;; esac
            done
          fi
          if [ -n "$tok2" ] && [ -z "$narrowed" ]; then # If the second token (role) matches no candidate, do not decide from another role's JSON.
            keep=0
            [ "$tok2" = impl ] && case " $cand " in *"/W-$tok1.json "*) keep=1 ;; esac
            [ "$keep" = 1 ] || { cand=""; why="no state JSON matches second token ${tok2}"; }
          fi
          set -- $narrowed
          [ $# -eq 1 ] || { set -- $cand; }
          if [ $# -gt 0 ]; then
            all_dead=1; alive_f=""
            for f in "$@"; do
              jpid=$(sed -nE 's/.*"pid": *([0-9]+).*/\1/p' "$f" | head -1)
              [ -n "$jpid" ] || { all_dead=0; continue; }
              jcmd=$(ps -o command= -p "$jpid" 2>/dev/null)
              if [ -n "$jcmd" ] && printf '%s' "$jcmd" | grep -qE 'claude|codex|node|vite|pnpm|turbo|playwright|vitest|omp|grok|agy|ship-pr|python|bash'; then all_dead=0; alive_f=$f; fi
            done
            if [ "$all_dead" = 1 ]; then
              pid=$(sed -nE 's/.*"pid": *([0-9]+).*/\1/p' "$1" | head -1)
              pid_src="state JSON $(basename "$(dirname "$1")")/$(basename "$1") "
              [ $# -gt 1 ] && pid_src="state JSON candidates ($# all dead, e.g. $(basename "$1")) "
            elif [ -n "$alive_f" ]; then
              why="worker in state JSON $(basename "$alive_f") is alive"
            fi
          fi
        fi
      fi ;;
    esac
    if [ -n "$pr" ]; then
      st=$(gh pr view "$pr" --json state -q .state 2>/dev/null)
      case "$st" in
        MERGED) done_v=done-pr-merged; done_w="PR #$pr merged" ;;
        CLOSED) done_v=done-pr-closed; done_w="PR #$pr closed" ;;
      esac
    fi
    if [ -n "$pgid" ] && pgrep -g "$pgid" >/dev/null 2>&1; then
      pg_alive=1; why="process group is alive (pgid $pgid)"  # Do not decide if only the wrapper is dead and the child group is still running.
    fi
    if [ "$pg_alive" = 0 ] && [ -z "$done_v" ] && [ -n "$pid" ]; then
      cmd=$(ps -o command= -p "$pid" 2>/dev/null)
      if [ -z "$cmd" ]; then done_v=done-pid-dead; done_w="${pid_src}pid $pid missing"
      elif ! printf '%s' "$cmd" | grep -qE 'claude|codex|node|vite|pnpm|turbo|playwright|vitest|omp|grok|agy|ship-pr|python|bash'; then
        done_v=done-pid-dead; done_w="${pid_src}pid ${pid} belongs to another process (${cmd%% *})"
      else why="${pid_src}pid $pid is alive (${cmd%% *})"; fi
    fi
    if [ "$pg_alive" = 0 ] && [ -z "$done_v" ] && [ -z "$pid" ] && printf '%s' "$purpose" | grep -qi 'ship'; then
      if ! pgrep -f ship-pr >/dev/null 2>&1; then done_v=done-ship-not-running; done_w="no ship-pr process"; else why="ship-pr is running"; fi
    fi
    if [ -n "$done_v" ]; then
      if [ "$age" -ge "$min_age" ]; then verdict=$done_v; why=$done_w; else why="$done_w, but ${age} min < ${min_age} min"; fi
    fi
  fi

  case "$verdict" in done-*|owner-gone) rc=10 ;; esac
  printf '%s owner=%s since=%s age=%s verdict=%s why=%s\n' "$name" "${owner:-none}" "${since_raw:-none}" "$age" "$verdict" "$why"
done
exit $rc
