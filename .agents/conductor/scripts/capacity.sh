#!/usr/bin/env bash
# 기계 사용량을 보고 지금 동시에 돌려도 되는 작업자 수와 흐름 세션 수를 한 줄로 출력한다(#936).
# 경계값의 근거와 한계는 .agents/conductor/LANES.md §기계 자원. 이 스크립트는 아무것도 막지 않는다(상태 파일 하나만 쓴다) —
# 호출자(흐름 세션·팀장)가 출력을 보고 판단한다. macOS 전용(memory_pressure, sysctl).
#
# 출력(한 줄, 종료 코드 항상 0):
#   <green|yellow|red> workers=<1-7> lanes=<2-4> start=<yes|no> free=<%> swap_used_mb=<n> swap_total_mb=<n> swap_delta_mb=<n|?> load1=<x> ncpu=<n> why=<이유>
#   start=no는 새 작업자·무거운 단계를 시작하지 않는다는 뜻이다. 이미 잡은 자리와 잠금은 뺏지 않는다.
# 환경 변수(모두 선택): CAPACITY_STATE(직전 swap 기록 파일, 기본 $AP_MAIN/.review/capacity.last, AP_MAIN이 없으면 $TMPDIR/capacity.last),
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
  echo "yellow workers=3 lanes=3 start=yes free=${free:-?} swap_used_mb=${swap_used:-?} swap_total_mb=${swap_total:-?} swap_delta_mb=? load1=${load1:-?} ncpu=${ncpu:-?} why=측정 실패, 지금 상한 유지"
  exit 0
fi
swap_used=${swap_used%.*}
swap_total=${swap_total%.*}
: "${swap_total:=0}"

# 직전 기록과 비교한다. delta는 기록이 min_age_s 이상 window_s 이하일 때만 유효하다(그보다 짧으면 증가를 재기에 간격이 너무 짧고,
# 길면 오래된 값이다). 유효하지 않으면 '?': 증가 없음으로 치지 않고 green만 막는다.
# 기록은 없거나 window_s 안에 못 들었거나 window_s/2 이상 지났을 때만 새로 쓴다 — 그래야 delta가 항상 min_age_s~window_s 구간을 보고,
# 자주 불러도 기준이 같이 밀려 서서히 느는 swap이 가려지지 않는다.
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
# 단계는 메모리 여유 %만으로 정한다(사용자 2026-10-26: "지금은 메모리 사용량으로만 판단").
# swap·load·커널 압박은 출력에 참고값으로만 남긴다 — 쌓인 swap은 지금 부족하다는 뜻이 아니었다.
if [ "$free" -lt "$red_free" ]; then
  level=red
  why="여유 ${free}% < ${red_free}%"
elif [ "$free" -ge "$green_free" ]; then
  level=green
  why="여유 ${free}% ≥ ${green_free}%"
else
  level=yellow
  why="여유 ${free}% < ${green_free}%"
fi

case $level in
  green) w=7; l=4; s=yes ;;
  yellow) w=3; l=3; s=yes ;;
  red) w=1; l=2; s=no ;;
esac
echo "$level workers=$w lanes=$l start=$s free=$free swap_used_mb=$swap_used swap_total_mb=$swap_total swap_delta_mb=$delta load1=$load1 ncpu=$ncpu why=$why"
