#!/usr/bin/env bash
# 일이 끝났는데 잡혀 있는 잠금을 찾는다(30분 잠금 점검, LANES §stale 잠금 점검 · #1006). 아무것도 풀지 않는다 —
# 푸는 것은 LANES ② 순서(주인에게 알림 → 10분 뒤 팀장)다. macOS 전용(date -j).
#
# 대상: $AP_MAIN/.review/{heavy.lock,browser.lock,merge.lock,worker-slot-*}. 잠금마다 한 줄:
#   <잠금> owner=<handle> since=<ISO> age=<분> verdict=<...> why=<근거>
# verdict:
#   held                   주인이 살아 있고 끝났다는 증거가 없다(또는 아직 min age 전)
#   owner-gone             owner 파일이 5분 넘게 없거나 handle이 orca terminal list에 없다 (LANES ①)
#   done-pr-merged/closed  purpose의 PR(#n·PR n)이 병합/닫힘
#   done-pid-dead          purpose의 pid가 없거나 다른 프로세스(PID 재사용)다
#   done-ship-not-running  purpose에 ship이 있는데 ship-pr 프로세스가 없다
#   unknown                since·purpose가 없어 판정 근거가 없다
# done-*는 age가 LOCK_AUDIT_MIN_AGE_MIN(기본 30)분 이상일 때만 낸다. 종료 코드: done-*/owner-gone이 하나라도 있으면 10, 아니면 0.
# 환경 변수(선택): AP_MAIN(기본: 이 스크립트가 있는 worktree의 공용 저장소 루트), LOCK_AUDIT_MIN_AGE_MIN, LOCK_AUDIT_OWNERLESS_MIN(5).
set -u

min_age=${LOCK_AUDIT_MIN_AGE_MIN:-30}
ownerless_min=${LOCK_AUDIT_OWNERLESS_MIN:-5}
if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
[ -d "${AP_MAIN:-}/.review" ] || { echo "lock-audit: AP_MAIN/.review 없음 (AP_MAIN=${AP_MAIN:-})" >&2; exit 2; }
now=$(date +%s)

handles=$(orca terminal list --json 2>/dev/null | grep -o '"handle": *"[^"]*"' | sed 's/.*"\(term_[^"]*\)"/\1/')
have_handles=0; [ -n "$handles" ] && have_handles=1

to_epoch() { # ISO(UTC) 또는 epoch 숫자 → epoch, 못 읽으면 빈 값
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
    since_ep=$(stat -f %m "$lock" 2>/dev/null || echo "$now")  # since가 없으면 디렉터리 mtime으로 나이만 본다
    age=$(( (now - since_ep) / 60 ))
  fi
  verdict=unknown; why="since·purpose 없음"

  if [ -z "$owner" ]; then
    if [ "$age" -ge "$ownerless_min" ]; then verdict=owner-gone; why="owner 파일 없이 ${age}분"; else verdict=held; why="owner 파일 없음(${age}분, ${ownerless_min}분 전)"; fi
  elif [ "$have_handles" = 1 ] && ! printf '%s\n' "$handles" | grep -qxF "$owner"; then
    verdict=owner-gone; why="owner handle이 orca terminal list에 없음"
  elif [ -z "$purpose" ]; then
    verdict=unknown; why="purpose 없음"
  else
    verdict=held; why="끝났다는 증거 없음"
    pr=$(printf '%s' "$purpose" | sed -nE 's/.*(#|PR[ #]*)([0-9]+).*/\2/p' | head -1)
    pid=$(printf '%s' "$purpose" | sed -nE 's/.*[Pp][Ii][Dd][ =:]*([0-9]+).*/\1/p' | head -1)
    done_v=""; done_w=""
    if [ -n "$pr" ]; then
      st=$(gh pr view "$pr" --json state -q .state 2>/dev/null)
      case "$st" in
        MERGED) done_v=done-pr-merged; done_w="PR #$pr 병합됨" ;;
        CLOSED) done_v=done-pr-closed; done_w="PR #$pr 닫힘" ;;
      esac
    fi
    if [ -z "$done_v" ] && [ -n "$pid" ]; then
      cmd=$(ps -o command= -p "$pid" 2>/dev/null)
      if [ -z "$cmd" ]; then done_v=done-pid-dead; done_w="pid $pid 없음"
      elif ! printf '%s' "$cmd" | grep -qE 'claude|codex|node|vite|pnpm|turbo|playwright|vitest|omp|grok|agy|ship-pr|python|bash'; then
        done_v=done-pid-dead; done_w="pid ${pid}가 다른 프로세스(${cmd%% *})"
      else why="pid $pid 살아 있음(${cmd%% *})"; fi
    fi
    if [ -z "$done_v" ] && [ -z "$pid" ] && printf '%s' "$purpose" | grep -qi 'ship'; then
      if ! pgrep -f ship-pr >/dev/null 2>&1; then done_v=done-ship-not-running; done_w="ship-pr 프로세스 없음"; else why="ship-pr 실행 중"; fi
    fi
    if [ -n "$done_v" ]; then
      if [ "$age" -ge "$min_age" ]; then verdict=$done_v; why=$done_w; else why="$done_w, 다만 ${age}분 < ${min_age}분"; fi
    fi
  fi

  case "$verdict" in done-*|owner-gone) rc=10 ;; esac
  printf '%s owner=%s since=%s age=%s verdict=%s why=%s\n' "$name" "${owner:-none}" "${since_raw:-none}" "$age" "$verdict" "$why"
done
exit $rc
