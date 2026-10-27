#!/usr/bin/env bash
# 기계 자원 잠금을 잡고, 자식 명령이 끝나면(성공·실패·시그널) 풀어 준다(LANES §기계 자원 · #1018 C1).
# 잠금 규약은 그대로다: $AP_MAIN/.review/<잠금> 디렉터리를 mkdir로 잡고 owner·since·purpose를 쓰며,
# 풀 때는 owner가 자기 것일 때만 mv + trash로 푼다(rm 금지). 이 스크립트는 그 규약의 구현이고, 직접 mkdir로 잡는 방식도 여전히 유효하다.
# 추가로 `token` 파일($$-<epoch>-$RANDOM)을 쓴다. 풀 때 owner와 token이 모두 같아야 푼다 — 같은 handle끼리(같은 터미널의 서브에이전트·배경 명령)도
# 남이 새로 잡은 잠금을 풀지 않는다. purpose 끝에는 `, pid <래퍼 PID>, pgid <자식 그룹>`이 붙어, SIGKILL로 남은 잠금도 lock-audit.sh가 PID 사망으로 찾는다(자식 그룹이 살아 있으면 held).
#
# 사용: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>
# 종료 코드: 자식의 종료 코드 그대로. 이미 잡혀 있으면(같은 잠금을 중첩해 잡는 경우 포함, 교착 없이 즉시) 명령을 돌리지 않고 75(한 줄: with-lock: <잠금> held by …).
#   자식이 직접 75를 내면 "이미 잡힘"과 구분되지 않는다(이미 잡힘은 명령을 돌리지 않고 stdout에 `with-lock: … held by` 줄을 낸다). 인자 오류(빈 purpose 포함) 64. AP_MAIN 없음·owner 없음 2.
# 환경 변수: AP_MAIN(기본: 현재 작업 디렉터리(cwd)가 속한 worktree의 공용 저장소 루트),
#   ORCA_TERMINAL_HANDLE(owner. 없으면 WITH_LOCK_OWNER를 쓰고, 둘 다 없으면 exit 2 — `foreground` 같은 이름으로 바꾸지 않는다).
# 신호: 자식은 새 프로세스 그룹(set -m)에서 돈다. TERM·HUP·INT를 받으면 INT도 TERM으로 바꿔 그 그룹 전체(손자 포함)에 보내고, 끝나길 기다린 뒤 푼다.
#   SIGKILL은 잡을 수 없다 — 그때는 잠금이 남고 purpose의 pid로 lock-audit.sh가 찾는다. 자식이 tty를 stdin으로 읽어야 하는 명령은 쓰지 않는다(배경 그룹이라 정지한다).
# macOS(bash 3.2, BSD date) 호환.
set -u

usage() { echo "usage: with-lock.sh <heavy.lock|browser.lock|merge.lock|worker-slot-N> <purpose> -- <command...>" >&2; exit 64; }

[ $# -ge 4 ] || usage
lock_name=$1
purpose=$2
[ "$3" = "--" ] || usage
shift 3
[ -n "$(printf '%s' "$purpose" | tr -d '[:space:]')" ] || { echo "with-lock: purpose가 비었다" >&2; usage; }

case "$lock_name" in
  heavy.lock|browser.lock|merge.lock) ;;
  worker-slot-[0-9]*) case "${lock_name#worker-slot-}" in *[!0-9]*) usage ;; esac ;;
  *) echo "with-lock: 모르는 잠금 이름 '$lock_name'" >&2; usage ;;
esac

if [ -z "${AP_MAIN:-}" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
[ -d "${AP_MAIN:-}/.review" ] || { echo "with-lock: AP_MAIN/.review 없음 (AP_MAIN=${AP_MAIN:-})" >&2; exit 2; }

me=${ORCA_TERMINAL_HANDLE:-${WITH_LOCK_OWNER:-}}
[ -n "$me" ] || { echo "with-lock: ORCA_TERMINAL_HANDLE도 WITH_LOCK_OWNER도 없다 — owner를 알 수 없어 잡지 않는다" >&2; exit 2; }

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
  # owner와 token이 모두 자기 것일 때만 푼다. 남이 풀고 새로 잡았으면 건드리지 않는다.
  [ "$(cat "$lock/owner" 2>/dev/null | tr -d '\n')" = "$me" ] || return 0
  [ "$(cat "$lock/token" 2>/dev/null | tr -d '\n')" = "$token" ] || return 0
  if mv "$lock" "$lock.released-$$" 2>/dev/null; then
    if command -v trash >/dev/null 2>&1; then
      trash "$lock.released-$$" || echo "with-lock: trash 실패, $lock.released-$$ 가 남았다" >&2
    else
      echo "with-lock: trash 없음, $lock.released-$$ 를 남긴다(직접 정리)" >&2
    fi
  fi
}

child=0
exit_code=143
on_signal() { # 자식 그룹 전체에 TERM을 넘기고 끝나길 기다린 뒤 푼다
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

set -m # 자식을 새 프로세스 그룹에서 띄운다(pgid = 자식 PID)
"$@" <&0 &  # 백그라운드로 돌려도 stdin을 그대로 넘긴다
child=$!
set +m
printf '%s, pid %s, pgid %s\n' "$purpose" "$$" "$child" >"$lock/purpose"  # 래퍼만 SIGKILL이어도 자식 그룹 생존을 lock-audit.sh가 본다
wait "$child"
rc=$?
child=0
release
exit $rc
