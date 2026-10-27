#!/usr/bin/env bash
# Report machine usage and the current worker and flow-session limits on one line.
# Thresholds and limitations are documented in .agents/conductor/LANES.md §Machine resources (16 GB). This script blocks nothing (it only writes one state file) —
# the caller (flow session or lead) decides from the output. macOS only (`memory_pressure`, `sysctl`).
#
# Output (one line; exit code is always 0):
#   <green|yellow|red> workers=<1-7> lanes=<2-4> start=<yes|no> free=<%> swap_used_mb=<n> swap_total_mb=<n> swap_delta_mb=<n|?> load1=<x> ncpu=<n> why=<reason>
#   start=no means do not start a new worker or heavy step. Do not take an occupied slot or lock.
# Optional environment variables: CAPACITY_STATE (previous swap record file, default $AP_MAIN/.review/capacity.last, or $TMPDIR/capacity.last if AP_MAIN is unset),
#   CAPACITY_GREEN_FREE(25) CAPACITY_RED_FREE(20) CAPACITY_SWAP_GROW_MB(256) CAPACITY_SWAP_FULL_MB(8192) CAPACITY_SWAP_WINDOW_S(1800) CAPACITY_SWAP_MIN_AGE_S(120)
set -u

green_free=${CAPACITY_GREEN_FREE:-25}
red_free=${CAPACITY_RED_FREE:-20}
grow_mb=${CAPACITY_SWAP_GROW_MB:-256}
full_mb=${CAPACITY_SWAP_FULL_MB:-8192}
window_s=${CAPACITY_SWAP_WINDOW_S:-1800}
min_age_s=${CAPACITY_SWAP_MIN_AGE_S:-120}
state=${CAPACITY_STATE:-${AP_MAIN:+$AP_MAIN/.review/capacity.last}}
state=${state:-${TMPDIR:-/tmp}/capacity.last}

free=$(memory_pressure 2>/dev/null | sed -n 's/.*free percentage: *\([0-9]*\)%.*/\1/p' | head -1)
swap=$(sysctl -n vm.swapusage 2>/dev/null)
swap_total=$(printf '%s' "$swap" | sed -n 's/.*total = *\([0-9.]*\)M.*/\1/p')
swap_used=$(printf '%s' "$swap" | sed -n 's/.*used = *\([0-9.]*\)M.*/\1/p')
load1=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')
ncpu=$(sysctl -n hw.ncpu 2>/dev/null)
pl=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null)
pl=${pl:-1}

if [ -z "$free" ] || [ -z "$swap_used" ] || [ -z "$load1" ] || [ -z "$ncpu" ]; then
  echo "yellow workers=3 lanes=3 start=yes free=${free:-?} swap_used_mb=${swap_used:-?} swap_total_mb=${swap_total:-?} swap_delta_mb=? load1=${load1:-?} ncpu=${ncpu:-?} why=measurement failed, keep current limits"
  exit 0
fi
swap_used=${swap_used%.*}
swap_total=${swap_total%.*}
: "${swap_total:=0}"

# Compare with the previous record. A delta is valid only when the record is at least min_age_s and at most window_s old (a shorter interval
# is too short to measure growth; a longer interval is stale). If invalid, '?': do not treat it as no growth, and block green only.
# Write a new record only when none exists, it is outside window_s, or it is at least window_s/2 old — this keeps delta within min_age_s~window_s
# and prevents frequent calls from moving the baseline and hiding gradual swap growth.
now=$(date +%s)
delta='?'
age=-1
if [ -r "$state" ]; then
  read -r prev_t prev_used <"$state" 2>/dev/null
  if [ "${prev_t:-0}" -gt 0 ] 2>/dev/null && [ -n "${prev_used:-}" ]; then
    age=$((now - prev_t))
    if [ "$age" -ge "$min_age_s" ] && [ "$age" -le "$window_s" ]; then
      delta=$((swap_used - prev_used))
    fi
  fi
fi
if [ "$age" -lt 0 ] || [ "$age" -gt "$window_s" ] || [ "$age" -ge $((window_s / 2)) ]; then
  { mkdir -p "$(dirname "$state")" && printf '%s %s\n' "$now" "$swap_used" >"$state.tmp.$$" && mv -f "$state.tmp.$$" "$state"; } 2>/dev/null
fi

load_hi=$(awk -v l="$load1" -v n="$ncpu" 'BEGIN{print (l > 2*n) ? 1 : 0}')
load_ok=$(awk -v l="$load1" -v n="$ncpu" 'BEGIN{print (l < n) ? 1 : 0}')
growing=0
[ "$delta" != '?' ] && [ "$delta" -ge "$grow_mb" ] && growing=1

why=
# Determine the stage only from free memory % (owner decision).
# Keep swap, load, and kernel pressure as reference values in the output only; accumulated swap alone does not indicate a current shortage.
if [ "$free" -lt "$red_free" ]; then
  level=red
  why="free ${free}% < ${red_free}%"
elif [ "$free" -ge "$green_free" ]; then
  level=green
  why="free ${free}% >= ${green_free}%"
else
  level=yellow
  why="free ${free}% < ${green_free}%"
fi

case $level in
  green) w=7; l=4; s=yes ;;
  yellow) w=3; l=3; s=yes ;;
  red) w=1; l=2; s=no ;;
esac
echo "$level workers=$w lanes=$l start=$s free=$free swap_used_mb=$swap_used swap_total_mb=$swap_total swap_delta_mb=$delta load1=$load1 ncpu=$ncpu why=$why"
