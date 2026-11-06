#!/usr/bin/env bash
# Watch the main push CI of one merge commit (addenda/merge.md, after the merge). Run it in the background.
# usage: main-ci-watch.sh <merge-sha> | --help | --self-test
#   1. Find the ci.yml push run on main for <merge-sha>; retry up to MAIN_CI_FIND_TIMEOUT (default 300 s) until it appears.
#   2. Wait for it to complete, at most MAIN_CI_TIMEOUT (default 5400 s = 90 min).
#   3. success: remove $AP_MAIN/.review/lanes/main-red when it names the same or an older sha (an ancestor of <merge-sha>).
#      failure/timed_out/startup_failure: write that marker (sha, run id, url, time) and, when LANE_NAME is set, send
#      `lane-send.sh "main 깨짐" - "<run url>"` to the lead (LANE_RUN is read by lane-send.sh). Without LANE_NAME only the
#      marker is written and the line is printed.
#      cancelled: the run was superseded by a later push; nothing changes (that push has its own watcher).
#   merge-precheck.sh reads the marker; a fix PR merges with `merge-precheck.sh --main-fix`.
# Exit: 0 green or cancelled / 1 red (marker written) / 2 usage or gh failed / 3 no run appeared or the wait timed out.
# Env: AP_MAIN (default: the git common dir's parent), MAIN_CI_POLL (poll seconds, default 30),
#   MAIN_CI_FIND_TIMEOUT, MAIN_CI_TIMEOUT, LANE_NAME, LANE_RUN,
#   MAIN_CI_RUNS_CMD (self-test only: command printing the `gh run list` JSON),
#   MAIN_CI_SEND_CMD (self-test only: replaces `bash lane-send.sh`; receives kind, "-", body),
#   MAIN_CI_GIT_DIR (self-test only: repository used for the ancestor check).
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
usage() { awk '/^set -u/{exit} NR > 1 && /^#/ {sub(/^# ?/, ""); print}' "$0"; }

run_list() {
  if [ -n "${MAIN_CI_RUNS_CMD:-}" ]; then eval "$MAIN_CI_RUNS_CMD"
  else gh run list --branch main --workflow ci.yml --event push --limit 30 \
    --json status,conclusion,headSha,databaseId,url,createdAt
  fi
}

# stdin: run list JSON; arg: sha. Prints "none" or "<status> <conclusion|-> <databaseId> <url>" for the newest run of the sha.
pick_run() {
  python3 -c '
import json, sys
sha = sys.argv[1]
try:
    runs = json.load(sys.stdin)
except ValueError:
    print("unreadable"); sys.exit(0)
for r in runs if isinstance(runs, list) else []:
    if (r.get("headSha") or "") == sha:
        print("%s %s %s %s" % (r.get("status") or "-", r.get("conclusion") or "-", r.get("databaseId") or "-", r.get("url") or "-"))
        sys.exit(0)
print("none")
' "$1"
}

clear_marker() { # <marker> <sha>
  local marker=$1 sha=$2 old
  [ -f "$marker" ] || return 0
  old=$(sed -n 's/^sha=//p' "$marker" | head -1)
  if [ -z "$old" ] || [ "$old" = "$sha" ] || git -C "${MAIN_CI_GIT_DIR:-.}" merge-base --is-ancestor "$old" "$sha" 2>/dev/null; then
    rm -f "$marker"
    echo "main-ci-watch: main is green at ${sha:0:10}; removed $marker"
  else
    echo "main-ci-watch: main is green at ${sha:0:10}, but $marker names a newer or unrelated sha ($old); left in place"
  fi
}

watch() { # <sha> ; sets the exit code
  local sha=$1 main marker poll find_to run_to start now rec status concl id url
  main=${AP_MAIN:-}
  if [ -z "$main" ]; then
    common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && main=$(dirname "$common")
  fi
  [ -n "$main" ] || { echo "main-ci-watch: AP_MAIN unknown" >&2; return 2; }
  marker="$main/.review/lanes/main-red"
  poll=${MAIN_CI_POLL:-30} find_to=${MAIN_CI_FIND_TIMEOUT:-300} run_to=${MAIN_CI_TIMEOUT:-5400}
  start=$(date +%s)
  while :; do  # 1. find the run
    rec=$(run_list | pick_run "$sha") || { echo "main-ci-watch: gh run list failed" >&2; return 2; }
    [ "$rec" = unreadable ] && { echo "main-ci-watch: run list unreadable" >&2; return 2; }
    [ "$rec" != none ] && break
    now=$(date +%s)
    if [ $((now - start)) -ge "$find_to" ]; then
      echo "main-ci-watch: no ci.yml push run for ${sha:0:10} after ${find_to}s" >&2; return 3
    fi
    sleep "$poll"
  done
  while :; do  # 2. wait for completion
    set -- $rec; status=$1 concl=$2 id=$3 url=$4
    [ "$status" = completed ] && break
    now=$(date +%s)
    if [ $((now - start)) -ge "$run_to" ]; then
      echo "main-ci-watch: run $id ($url) not finished after ${run_to}s" >&2; return 3
    fi
    sleep "$poll"
    rec=$(run_list | pick_run "$sha") || { echo "main-ci-watch: gh run list failed" >&2; return 2; }
    [ "$rec" = none ] || [ "$rec" = unreadable ] && rec="in_progress - $id $url"
  done
  case "$concl" in  # 3. outcome
    success) clear_marker "$marker" "$sha"; return 0 ;;
    cancelled|skipped|neutral) echo "main-ci-watch: run $id ($url) is $concl; superseded or skipped, marker unchanged"; return 0 ;;
    *)
      mkdir -p "$(dirname "$marker")"
      printf 'sha=%s\nrun=%s\nurl=%s\nconclusion=%s\ntime=%s\n' "$sha" "$id" "$url" "$concl" "$(date '+%Y-%m-%dT%H:%M:%S%z')" >"$marker"
      echo "main-ci-watch: MAIN-RED ${sha:0:10} $concl $url (marker $marker)"
      if [ -n "${LANE_NAME:-}" ]; then
        if [ -n "${MAIN_CI_SEND_CMD:-}" ]; then eval "$MAIN_CI_SEND_CMD" "'main 깨짐'" "-" "'$url'"
        else bash "$SCRIPT_DIR/lane-send.sh" "main 깨짐" - "$url"; fi || echo "main-ci-watch: lane-send failed" >&2
      else
        echo "main-ci-watch: LANE_NAME is not set; marker written, nothing sent — tell the lead"
      fi
      return 1 ;;
  esac
}

self_test() {
  local T rc pass out
  T=$(mktemp -d "${TMPDIR:-/tmp}/ap-main-ci-watch-self-test.XXXXXX") || return 1
  cleanup() { rm -rf "$T"; }
  pass=0
  fail() { echo "self-test failed: $1"; cleanup; exit 1; }
  expect() { [ "$1" -eq "$rc" ] && { pass=$((pass + 1)); return 0; }; fail "$2: exit $rc, expected $1"; }
  mkdir -p "$T/main/.review/lanes" "$T/bin"
  export AP_MAIN="$T/main" MAIN_CI_POLL=0 MAIN_CI_FIND_TIMEOUT=2 MAIN_CI_TIMEOUT=2
  local marker="$T/main/.review/lanes/main-red" sha=1111111111111111111111111111111111111111
  local other=2222222222222222222222222222222222222222
  # Fake run list: $T/seq holds one JSON per call (the last repeats); a counter file picks the next.
  cat >"$T/bin/runs" <<'EOF'
#!/bin/sh
n=$(cat "$SEQ_DIR/n" 2>/dev/null || echo 0)
f="$SEQ_DIR/$n.json"
[ -f "$f" ] || f="$SEQ_DIR/last.json"
echo $((n + 1)) >"$SEQ_DIR/n"
cat "$f"
EOF
  chmod +x "$T/bin/runs"
  export SEQ_DIR="$T/seq" MAIN_CI_RUNS_CMD="$T/bin/runs"
  seqreset() { rm -rf "$SEQ_DIR"; mkdir -p "$SEQ_DIR"; }
  run_json() { printf '[{"status":"%s","conclusion":%s,"headSha":"%s","databaseId":77,"url":"https://example.test/run/77"}]' "$1" "$2" "$3"; }

  bash "$0" >/dev/null 2>&1; rc=$?; expect 2 "usage"

  # Run appears late, finishes green, removes a marker that names the same sha.
  seqreset; printf '[]' >"$SEQ_DIR/0.json"; run_json in_progress null "$sha" >"$SEQ_DIR/1.json"; run_json completed '"success"' "$sha" >"$SEQ_DIR/last.json"
  printf 'sha=%s\nrun=1\n' "$sha" >"$marker"
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "green after retries"
  [ ! -e "$marker" ] || fail "green did not remove the marker for the same sha"
  pass=$((pass + 1))

  # Green leaves a marker that names an unrelated sha (not an ancestor).
  seqreset; run_json completed '"success"' "$sha" >"$SEQ_DIR/last.json"
  printf 'sha=%s\n' "$other" >"$marker"
  MAIN_CI_GIT_DIR="$T" bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "green with an unrelated marker"
  [ -e "$marker" ] || fail "green removed a marker that names an unrelated sha"
  pass=$((pass + 1))
  rm -f "$marker"

  # Green removes a marker that names an older sha (ancestor), in a throwaway repository.
  git -C "$T" init -q repo && git -C "$T/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m a \
    && git -C "$T/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m b || fail "fixture repo"
  old=$(git -C "$T/repo" rev-parse HEAD~1); new=$(git -C "$T/repo" rev-parse HEAD)
  seqreset; run_json completed '"success"' "$new" >"$SEQ_DIR/last.json"
  printf 'sha=%s\n' "$old" >"$marker"
  MAIN_CI_GIT_DIR="$T/repo" bash "$0" "$new" >"$T/out" 2>&1; rc=$?; expect 0 "green over an older marker"
  [ ! -e "$marker" ] || fail "green did not remove the marker for an older sha"
  pass=$((pass + 1))

  # Red without LANE_NAME: marker only.
  seqreset; run_json completed '"failure"' "$sha" >"$SEQ_DIR/last.json"
  env -u LANE_NAME bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "red without lane"
  grep -q "sha=$sha" "$marker" && grep -q 'run=77' "$marker" || fail "marker lacks sha/run id"
  grep -q "LANE_NAME is not set" "$T/out" || fail "no marker-only notice"
  pass=$((pass + 1))
  rm -f "$marker"

  # Red with LANE_NAME: the send command gets kind, "-" and the run url.
  seqreset; run_json completed '"failure"' "$sha" >"$SEQ_DIR/last.json"
  printf '#!/bin/sh\nprintf "%%s|%%s|%%s\\n" "$1" "$2" "$3" >"%s/sent"\n' "$T" >"$T/bin/send"; chmod +x "$T/bin/send"
  LANE_NAME=ops MAIN_CI_SEND_CMD="$T/bin/send" bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "red with lane"
  [ "$(cat "$T/sent" 2>/dev/null)" = "main 깨짐|-|https://example.test/run/77" ] || fail "send args wrong: $(cat "$T/sent" 2>/dev/null)"
  pass=$((pass + 1))
  rm -f "$marker"

  # Cancelled: no marker. Never appears: exit 3. Never finishes: exit 3.
  seqreset; run_json completed '"cancelled"' "$sha" >"$SEQ_DIR/last.json"
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "cancelled"
  [ ! -e "$marker" ] || fail "cancelled wrote a marker"
  pass=$((pass + 1))
  seqreset; printf '[]' >"$SEQ_DIR/last.json"
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 3 "run never appears"
  seqreset; run_json in_progress null "$sha" >"$SEQ_DIR/last.json"
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 3 "run never finishes"

  cleanup
  echo "main-ci-watch.sh self-test passed: $pass checks (usage, late run + green clears same-sha marker, unrelated marker kept, older marker cleared, red writes marker, lane-send args, cancelled, no run, timeout)"
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
esac
[ $# -eq 1 ] || { echo "usage: main-ci-watch.sh <merge-sha>" >&2; exit 2; }
watch "$1"
exit $?
