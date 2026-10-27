#!/usr/bin/env bash
# Send one fixed-format lane → lead message (LANES §Lane session). Same input, same message.
# usage: lane-send.sh [--dry-run] <kind> <#n|-> <body>
#   kind: 병합|막힘|풀음|유지|질문|착수|대기|교대|main 깨짐|E2E   (anything else is refused)
#   #n:   issue number like 1040 or #1040; `-` when the message has none (대기, 교대, main 깨짐, E2E)
#   body: at most 3 sentences
# Lane name: $LANE_NAME, else the worktree directory `lane-<lane>[-<n>]`.
# Run id:    $LANE_RUN, else the first run_… id in $AP_MAIN/.review/lanes/<lane>.md.
# Sends only; never run-use, check --wait or --ack (those belong to the lead).
# Exit: 0 sent / 64 bad arguments / 2 lane, run or terminal handle unknown / the orca exit code.
set -u
dry=0
if [ "${1:-}" = "--dry-run" ]; then dry=1; shift; fi
[ $# -eq 3 ] || { echo "usage: lane-send.sh [--dry-run] <kind> <#n|-> <body>" >&2; exit 64; }
kind=$1 num=$2 body=$3

case "$kind" in
  병합|막힘|풀음|유지|질문|착수|대기|교대|"main 깨짐"|E2E) ;;
  *) echo "lane-send: unknown kind '$kind' (병합|막힘|풀음|유지|질문|착수|대기|교대|main 깨짐|E2E)" >&2; exit 64 ;;
esac
case "$num" in
  -) ref="" ;;
  '#'[0-9]*) ref=" $num" ;;
  [0-9]*) ref=" #$num" ;;
  *) echo "lane-send: issue must be #n or -, got '$num'" >&2; exit 64 ;;
esac
case "$ref" in *[!#\ 0-9]*) echo "lane-send: issue must be #n or -, got '$num'" >&2; exit 64 ;; esac
[ -n "$(printf '%s' "$body" | tr -d '[:space:]')" ] || { echo "lane-send: empty body" >&2; exit 64; }
sentences=$(printf '%s' "$body" | grep -oE '[.!?。](\s|$)' | wc -l | tr -d ' ')
[ "$sentences" -le 3 ] || { echo "lane-send: body has $sentences sentences, max 3" >&2; exit 64; }

if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
lane=${LANE_NAME:-}
if [ -z "$lane" ]; then
  top=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
  case "$top" in lane-*) lane=$(printf '%s' "${top#lane-}" | sed -E 's/-[0-9]+$//') ;; esac
fi
[ -n "$lane" ] || { echo "lane-send: lane unknown; set LANE_NAME" >&2; exit 2; }
run=${LANE_RUN:-}
if [ -z "$run" ] && [ -f "${AP_MAIN:-}/.review/lanes/$lane.md" ]; then
  run=$(grep -oE 'run_[0-9a-f]+' "$AP_MAIN/.review/lanes/$lane.md" | head -1)
fi
[ -n "$run" ] || { echo "lane-send: run id unknown; set LANE_RUN" >&2; exit 2; }
from=${ORCA_TERMINAL_HANDLE:-}
[ -n "$from" ] || [ "$dry" = 1 ] || { echo "lane-send: ORCA_TERMINAL_HANDLE is not set" >&2; exit 2; }

subject="$lane: $kind$ref"
if [ "$dry" = 1 ]; then
  printf "orca orchestration send --run %s --to run:%s --from %s --type status --subject '%s' --body '%s'\n" "$run" "$run" "${from:-\$ORCA_TERMINAL_HANDLE}" "$subject" "$body"
  exit 0
fi
exec orca orchestration send --run "$run" --to "run:$run" --from "$from" --type status --subject "$subject" --body "$body"
