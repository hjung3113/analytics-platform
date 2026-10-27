#!/usr/bin/env bash
# 기계 자원 잠금을 잡고, 자식 명령이 끝나면(성공·실패·시그널) 풀어 준다(LANES §기계 자원 · #1018 C1).
# 잠금 규약은 그대로다: $AP_MAIN/.review/<잠금> 디렉터리를 mkdir로 잡고 owner·since·purpose를 쓰며,
# 풀 때는 owner가 자기 것일 때만 mv + trash로 푼다(rm 금지). 이 스크립트는 그 규약의 구현이고, 직접 mkdir로 잡는 방식도 여전히 유효하다.
#
# 사용: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>
# 종료 코드: 자식의 종료 코드 그대로. 이미 잡혀 있으면 명령을 돌리지 않고 75(한 줄: with-lock: <잠금> held by …). 인자 오류 64. AP_MAIN 없음 2.
# 환경 변수: AP_MAIN(기본: 이 스크립트가 있는 worktree의 공용 저장소 루트), ORCA_TERMINAL_HANDLE(owner, 없으면 foreground).
# macOS(bash 3.2, BSD date) 호환.
set -u

usage() { echo "usage: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>" >&2; exit 64; }

[ $# -ge 4 ] || usage
lock_name=$1
purpose=$2
[ "$3" = "--" ] || usage
shift 3

case "$lock_name" in
  heavy.lock|browser.lock|merge.lock) ;;
  worker-slot-[0-9]*) case "${lock_name#worker-slot-}" in *[!0-9]*) usage ;; esac ;;
  *) echo "with-lock: 모르는 잠금 이름 '$lock_name'" >&2; usage ;;
esac

if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
[ -d "${AP_MAIN:-}/.review" ] || { echo "with-lock: AP_MAIN/.review 없음 (AP_MAIN=${AP_MAIN:-})" >&2; exit 2; }

lock="$AP_MAIN/.review/$lock_name"
me=${ORCA_TERMINAL_HANDLE:-foreground}

if ! mkdir "$lock" 2>/dev/null; then
  o=$(cat "$lock/owner" 2>/dev/null | tr -d '\n')
  s=$(cat "$lock/since" 2>/dev/null | tr -d '\n')
  p=$(cat "$lock/purpose" 2>/dev/null | tr '\n' ' ')
  echo "with-lock: $lock_name held by ${o:-none} since ${s:-none} purpose ${p:-none}"
  exit 75
fi
printf '%s\n' "$me" >"$lock/owner"
date -u +%FT%TZ >"$lock/since"
printf '%s\n' "$purpose" >"$lock/purpose"

released=0
release() {
  [ "$released" = 1 ] && return 0
  released=1
  # owner가 자기 것일 때만 푼다. 남이 풀고 새로 잡았으면 건드리지 않는다.
  [ "$(cat "$lock/owner" 2>/dev/null | tr -d '\n')" = "$me" ] || return 0
  if mv "$lock" "$lock.released-$$" 2>/dev/null; then
    if command -v trash >/dev/null 2>&1; then
      trash "$lock.released-$$" || echo "with-lock: trash 실패, $lock.released-$$ 가 남았다" >&2
    else
      echo "with-lock: trash 없음, $lock.released-$$ 를 남긴다(직접 정리)" >&2
    fi
  fi
}

child=0
on_signal() { # 자식에게 신호를 넘기고 기다린 뒤 푼다
  sig=$1
  [ "$child" -gt 0 ] && kill "-$sig" "$child" 2>/dev/null
  [ "$child" -gt 0 ] && wait "$child" 2>/dev/null
  release
  case $sig in INT) exit 130 ;; *) exit 143 ;; esac
}
trap 'release' EXIT
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM

"$@" <&0 &  # 백그라운드로 돌려도 stdin을 그대로 넘긴다
child=$!
wait "$child"
rc=$?
child=0
release
exit $rc
