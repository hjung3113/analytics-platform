#!/usr/bin/env bash
# 루트 검사를 순서대로 돌리고 단계마다 로그를 남긴다(PROFILE §Verify 2단계 · #1018 C3, O2).
#   verify-root.sh [--light] <log-dir>
# 단계: lint → typecheck(잠금 없이) → test → build. test·build는 heavy.lock 아래에서 한 번에 묶어 돈다(with-lock.sh, purpose `verify-root foreground`).
# --light: lint·typecheck만 돌리고 heavy.lock을 잡지 않는다(Kernel·셸·공통 컴포넌트·mock 서버·apps/platform-web 조립을 건드리지 않는 노드, PROFILE §Verify).
# 로그: <log-dir>/<step>.log — 전체 출력과 마지막 줄 `exit=<코드>`. 첫 실패에서 멈추고 그 단계의 코드를 종료 코드로 한다.
# 끝에 단계마다 `step=<name> exit=<n> seconds=<s>`를 stdout에 출력한다.
# 종료 코드: 0 통과 / 그 단계의 코드 / 3 capacity.sh가 start=no(잠금도 잡지 않고 이유 한 줄) / 75 heavy.lock이 이미 잡혀 있음 / 64 인자 오류.
# 워커 수·--concurrency는 넣지 않는다: turbo.json의 concurrency와 ~/.zshenv의 vitest 상한이 정한다. 필터(--filter='!@fops/*')는 루트 package.json 스크립트가 이미 갖고 있다.
set -u

light=0
if [ "${1:-}" = "--light" ]; then light=1; shift; fi
[ $# -eq 1 ] || { echo "usage: verify-root.sh [--light] <log-dir>" >&2; exit 64; }
logdir=$1
mkdir -p "$logdir" || exit 64
here=$(cd "$(dirname "$0")" && pwd)

summary=""
run_step() { # run_step <name> <command...> — 종료 코드를 그대로 돌려주고 로그·요약을 남긴다
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

test_build() { # test → build를 한 잠금 안에서 이어 돌린다. 요약은 서브셸이라 파일로 넘긴다
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
summary="${summary}$(cat "$logdir/.tb-summary")
"
[ "$rc" -eq 75 ] && echo "verify-root: heavy.lock이 이미 잡혀 있다" >&2
finish $rc
