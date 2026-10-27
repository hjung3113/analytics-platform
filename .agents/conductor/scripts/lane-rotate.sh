#!/usr/bin/env bash
# Decide whether this lane session rotates (LANES §Lane session, Rotation). Same ctx, same answer.
# usage: lane-rotate.sh [--ctx <percent>]
#   no flag: reads `ctx:NN%` from this terminal's screen ($ORCA_TERMINAL_HANDLE)
# output (one line): rotate=<no|after-issue|now> ctx=<NN|unknown>
#   after-issue: ctx above 60% — finish the current issue, then write HANDOFF.md and send 교대
#   now:         ctx above 75% — write HANDOFF.md and send 교대 now
# Exit: 0 decided / 2 ctx could not be read (prints rotate=no ctx=unknown) / 64 bad arguments.
set -u
ctx=""
case "${1:-}" in
  --ctx) ctx=${2:-}; case "$ctx" in ''|*[!0-9]*) echo "usage: lane-rotate.sh [--ctx <percent>]" >&2; exit 64 ;; esac ;;
  "") ;;
  *) echo "usage: lane-rotate.sh [--ctx <percent>]" >&2; exit 64 ;;
esac
if [ -z "$ctx" ]; then
  [ -n "${ORCA_TERMINAL_HANDLE:-}" ] || { echo "rotate=no ctx=unknown"; exit 2; }
  ctx=$(orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen 2>/dev/null | grep -oE 'ctx:[0-9]+%' | tail -1 | tr -dc '0-9')
  [ -n "$ctx" ] || { echo "rotate=no ctx=unknown"; exit 2; }
fi
if [ "$ctx" -gt 75 ]; then r=now; elif [ "$ctx" -gt 60 ]; then r=after-issue; else r=no; fi
echo "rotate=$r ctx=$ctx"
