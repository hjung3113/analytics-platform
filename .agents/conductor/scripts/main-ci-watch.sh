#!/usr/bin/env bash
# Watch the main push CI of one merge commit (addenda/merge.md, after the merge). Run it in the background.
# usage: main-ci-watch.sh <merge-sha> | --help | --self-test
#   1. Find the ci.yml push run on main for <merge-sha>; retry up to MAIN_CI_FIND_TIMEOUT (default 300 s) until it appears.
#   2. Wait for it to complete, at most MAIN_CI_TIMEOUT (default 5400 s = 90 min).
#   Runs are looked up on the server by commit sha. Result handling takes a mkdir lock beside the marker, so a late older
#   red never overwrites a newer state (main-green records the newest green) and a green never deletes a newer red marker;
#   ancestry comes from `gh api compare`, not the local clone.
#   3. success: remove $AP_MAIN/.review/lanes/main-red when it names the same or an older sha (an ancestor of <merge-sha>).
#      failure/timed_out/startup_failure: write that marker (sha, run id, url, time) and, when LANE_NAME is set, send
#      `lane-send.sh "main 깨짐" - "<run url>"` to the lead (LANE_RUN is read by lane-send.sh). Without LANE_NAME only the
#      marker is written and the line is printed.
#      cancelled: the run was superseded by a later push; nothing changes (that push has its own watcher).
#   merge-precheck.sh reads the marker; a fix PR merges with `merge-precheck.sh --main-fix`.
# Exit: 0 green or cancelled / 1 red (marker written) / 2 usage or gh failed / 3 no run appeared or the wait timed out.
# Env: AP_MAIN (default: the git common dir's parent), MAIN_CI_POLL (poll seconds, default 30),
#   MAIN_CI_FIND_TIMEOUT, MAIN_CI_TIMEOUT, LANE_NAME, LANE_RUN,
#   MAIN_CI_RUNS_CMD (self-test only: command printing the `gh run list` JSON; MAIN_CI_SHA is the commit asked for),
#   MAIN_CI_SEND_CMD (self-test only: replaces `bash lane-send.sh`; receives kind, "-", body),
#   MAIN_CI_ANCESTOR_CMD (self-test only: `cmd <old> <new>`, exit 0 ancestor / 1 not / 2 unknown; otherwise `gh api compare`).
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
usage() { awk '/^set -u/{exit} NR > 1 && /^#/ {sub(/^# ?/, ""); print}' "$0"; }

run_list() { # <sha>: the server filters by commit, so a busy main cannot push the target out of the window
  if [ -n "${MAIN_CI_RUNS_CMD:-}" ]; then MAIN_CI_SHA=$1 eval "$MAIN_CI_RUNS_CMD"
  else gh run list --branch main --workflow ci.yml --event push --commit "$1" --limit 20 \
    --json status,conclusion,headSha,databaseId,url,createdAt
  fi
}

# Run the list and parse it; the gh exit status is kept apart from the parser's. Prints the pick_run record; rc 2 on failure.
fetch_rec() { # <sha>
  local json
  json=$(run_list "$1") || { echo "main-ci-watch: gh run list failed" >&2; return 2; }
  printf '%s' "$json" | pick_run "$1"
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

# is_ancestor <old> <new>: 0 = new contains old (or equal), 1 = not, 2 = unknown. Asked of the server: the local clone may lack a fresh squash sha.
is_ancestor() {
  local old=$1 new=$2 st
  [ "$old" = "$new" ] && return 0
  if [ -n "${MAIN_CI_ANCESTOR_CMD:-}" ]; then "$MAIN_CI_ANCESTOR_CMD" "$old" "$new"; return $?; fi
  st=$(gh api "repos/{owner}/{repo}/compare/${old}...${new}" --jq .status 2>/dev/null) || return 2
  case "$st" in ahead|identical) return 0 ;; behind|diverged) return 1 ;; *) return 2 ;; esac
}

# Serialize "decide + update marker": a mkdir lock beside the marker (a lock older than 2 min is stale).
LOCKD=""
take_lock() { # <marker>
  local d="$1.lock.d" i=0
  mkdir -p "$(dirname "$1")"
  while ! mkdir "$d" 2>/dev/null; do
    find "$d" -maxdepth 0 -mmin +2 -exec rm -rf {} + 2>/dev/null
    i=$((i + 1)); [ "$i" -gt "${MAIN_CI_LOCK_TRIES:-240}" ] && { echo "main-ci-watch: marker lock busy: $d" >&2; return 2; }
    sleep 0.25
  done
  LOCKD=$d
}
drop_lock() { [ -n "$LOCKD" ] && rmdir "$LOCKD" 2>/dev/null; LOCKD=""; }

sha_of() { sed -n 's/^sha=//p' "$1" 2>/dev/null | head -1; }

write_atomic() { # <file> <content>
  printf '%s' "$2" >"$1.tmp.$$" && mv -f "$1.tmp.$$" "$1"
}

# Under the lock. Green: remember the newest green sha, drop the marker only if it names this or an older sha.
apply_green() { # <marker> <sha>
  local marker=$1 sha=$2 old g green rc
  green="$(dirname "$1")/main-green"
  g=$(sha_of "$green")
  if [ -z "$g" ] || is_ancestor "$g" "$sha"; then write_atomic "$green" "sha=$sha"$'\n'; fi
  [ -f "$marker" ] || return 0
  old=$(sha_of "$marker")
  if [ -z "$old" ]; then rm -f "$marker"; echo "main-ci-watch: removed unreadable $marker"; return 0; fi
  is_ancestor "$old" "$sha"; rc=$?
  if [ $rc -eq 0 ]; then
    rm -f "$marker"; echo "main-ci-watch: main is green at ${sha:0:10}; removed $marker"
  elif [ $rc -eq 1 ]; then
    echo "main-ci-watch: main is green at ${sha:0:10}, but $marker names a newer or unrelated sha (${old:0:10}); left in place"
  else
    echo "main-ci-watch: could not tell whether ${old:0:10} is an ancestor of ${sha:0:10}; $marker left in place" >&2
  fi
}

# Under the lock. Red: write the marker unless a green at this or a later sha is already recorded. rc 0 = written, 9 = stale.
apply_red() { # <marker> <sha> <id> <url> <concl>
  local marker=$1 sha=$2 g green
  green="$(dirname "$1")/main-green"
  g=$(sha_of "$green")
  if [ -n "$g" ] && is_ancestor "$sha" "$g"; then
    echo "main-ci-watch: red at ${sha:0:10} is older than the recorded green ${g:0:10}; marker not written"; return 9
  fi
  write_atomic "$marker" "$(printf 'sha=%s\nrun=%s\nurl=%s\nconclusion=%s\ntime=%s' "$sha" "$3" "$4" "$5" "$(date '+%Y-%m-%dT%H:%M:%S%z')")"$'\n'
}

watch() { # <sha> ; sets the exit code
  local rc sha=$1 main marker poll find_to run_to start now rec status concl id url
  main=${AP_MAIN:-}
  if [ -z "$main" ]; then
    common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && main=$(dirname "$common")
  fi
  [ -n "$main" ] || { echo "main-ci-watch: AP_MAIN unknown" >&2; return 2; }
  marker="$main/.review/lanes/main-red"
  poll=${MAIN_CI_POLL:-30} find_to=${MAIN_CI_FIND_TIMEOUT:-300} run_to=${MAIN_CI_TIMEOUT:-5400}
  start=$(date +%s)
  while :; do  # 1. find the run
    rec=$(fetch_rec "$sha") || return 2
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
    rec=$(fetch_rec "$sha") || return 2
    [ "$rec" = unreadable ] && { echo "main-ci-watch: run list unreadable" >&2; return 2; }
    [ "$rec" = none ] && rec="in_progress - $id $url"
  done
  case "$concl" in  # 3. outcome
    success) take_lock "$marker" || return 2; apply_green "$marker" "$sha"; drop_lock; return 0 ;;
    cancelled|skipped|neutral) echo "main-ci-watch: run $id ($url) is $concl; superseded or skipped, marker unchanged"; return 0 ;;
    *)
      take_lock "$marker" || return 2
      apply_red "$marker" "$sha" "$id" "$url" "$concl"; rc=$?
      drop_lock
      [ $rc -eq 9 ] && return 0
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
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "green with an unrelated marker"
  [ -e "$marker" ] || fail "green removed a marker that names an unrelated sha"
  pass=$((pass + 1))
  rm -f "$marker"

  # C5: green removes a marker that names an older sha. The ancestry comes from the (fake) server, not from a local
  # object: no repository exists in this fixture, so a local `git merge-base` could not answer.
  old=3333333333333333333333333333333333333333; new=4444444444444444444444444444444444444444
  printf '#!/bin/sh\ngrep -q "^$1 $2$" "%s/anc" && exit 0\ngrep -q "^err" "%s/anc" && exit 2\nexit 1\n' "$T" "$T" >"$T/bin/anc"; chmod +x "$T/bin/anc"
  export MAIN_CI_ANCESTOR_CMD="$T/bin/anc"
  printf '%s %s\n' "$old" "$new" >"$T/anc"
  seqreset; run_json completed '"success"' "$new" >"$SEQ_DIR/last.json"
  printf 'sha=%s\n' "$old" >"$marker"
  bash "$0" "$new" >"$T/out" 2>&1; rc=$?; expect 0 "green over an older marker (server ancestry)"
  [ ! -e "$marker" ] || fail "green did not remove the marker for an older sha"
  pass=$((pass + 1))
  # Unknown ancestry (server error) keeps the marker.
  rm -f "$T/main/.review/lanes/main-green"; printf 'err\n' >"$T/anc"
  printf 'sha=%s\n' "$old" >"$marker"
  bash "$0" "$new" >"$T/out" 2>&1; rc=$?; expect 0 "green with unknown ancestry"
  [ -e "$marker" ] || fail "unknown ancestry removed the marker"
  pass=$((pass + 1))
  rm -f "$marker" "$T/main/.review/lanes/main-green"

  # C1: a green for the newer sha is recorded first; the late red of the older sha must not write a marker.
  printf '%s %s\n' "$old" "$new" >"$T/anc"
  seqreset; run_json completed '"success"' "$new" >"$SEQ_DIR/last.json"
  bash "$0" "$new" >"$T/out" 2>&1; rc=$?; expect 0 "green first"
  seqreset; run_json completed '"failure"' "$old" >"$SEQ_DIR/last.json"
  bash "$0" "$old" >"$T/out" 2>&1; rc=$?; expect 0 "late older red"
  [ ! -e "$marker" ] || fail "a late older red revived the marker after a newer green"
  grep -q "older than the recorded green" "$T/out" || fail "no stale-red notice"
  pass=$((pass + 1))
  rm -f "$T/main/.review/lanes/main-green"
  # C1: a green for the older sha never deletes the marker of a newer red.
  seqreset; run_json completed '"failure"' "$new" >"$SEQ_DIR/last.json"
  bash "$0" "$new" >"$T/out" 2>&1; rc=$?; expect 1 "newer red"
  seqreset; run_json completed '"success"' "$old" >"$SEQ_DIR/last.json"
  bash "$0" "$old" >"$T/out" 2>&1; rc=$?; expect 0 "older green"
  grep -q "sha=$new" "$marker" || fail "an older green removed or replaced the newer red marker"
  pass=$((pass + 1))
  rm -f "$marker" "$T/main/.review/lanes/main-green"
  # C1: results are applied under a lock; a held lock delays the write until it is released.
  mkdir "$marker.lock.d"; ( sleep 1; rmdir "$marker.lock.d" ) &
  seqreset; run_json completed '"failure"' "$sha" >"$SEQ_DIR/last.json"
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "red waits for the lock"
  [ ! -d "$marker.lock.d" ] || fail "lock not released"
  grep -q "sha=$sha" "$marker" || fail "red did not write after the lock was released"
  pass=$((pass + 1))
  rm -f "$marker" "$T/main/.review/lanes/main-green"
  # A lock that stays held makes the watcher stop with exit 2 instead of writing around it.
  mkdir "$marker.lock.d"
  MAIN_CI_LOCK_TRIES=2 bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "lock held"
  [ ! -e "$marker" ] || fail "marker written without the lock"
  rmdir "$marker.lock.d"
  unset MAIN_CI_ANCESTOR_CMD
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

  # C6: 40 newer runs of other shas precede the target. The fake honours the commit filter like the server (and, without
  # it, returns only the newest 30), so the target is found only when the script asks for it by sha.
  cat >"$T/bin/runs" <<'EOF'
#!/bin/sh
n=$(cat "$SEQ_DIR/n" 2>/dev/null || echo 0)
f="$SEQ_DIR/$n.json"
[ -f "$f" ] || f="$SEQ_DIR/last.json"
echo $((n + 1)) >"$SEQ_DIR/n"
if [ -n "$MAIN_CI_SHA" ]; then cat "$f"; else python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)[:30]))' <"$f"; fi
EOF
  seqreset
  python3 -c '
import json, sys
sha = sys.argv[1]
runs = [{"status": "completed", "conclusion": "success", "headSha": "%040d" % i, "databaseId": i, "url": "u"} for i in range(40)]
runs.append({"status": "completed", "conclusion": "failure", "headSha": sha, "databaseId": 77, "url": "https://example.test/run/77"})
print(json.dumps(runs))' "$sha" >"$SEQ_DIR/last.json"
  env -u LANE_NAME bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "target behind 40 other runs"
  grep -q "sha=$sha" "$marker" || fail "target beyond the first 30 runs was not found"
  pass=$((pass + 1))
  rm -f "$marker" "$T/main/.review/lanes/main-green"

  # C7: a gh failure exits 2 at once, on the first lookup and while waiting for the run.
  printf '#!/bin/sh\necho "[" ; exit 1\n' >"$T/bin/runs"; chmod +x "$T/bin/runs"
  seqreset
  bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "gh fails on the first lookup"
  printf '#!/bin/sh\nn=$(cat "$SEQ_DIR/n" 2>/dev/null || echo 0)\necho $((n + 1)) >"$SEQ_DIR/n"\nif [ "$n" -ge 1 ]; then exit 1; fi\nprintf "[{\\"status\\":\\"in_progress\\",\\"conclusion\\":null,\\"headSha\\":\\"%%s\\",\\"databaseId\\":77,\\"url\\":\\"u\\"}]" "$MAIN_CI_SHA"\n' >"$T/bin/runs"
  seqreset
  MAIN_CI_TIMEOUT=60 bash "$0" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "gh fails while waiting"

  cleanup
  echo "main-ci-watch.sh self-test passed: $pass checks (usage, late run + green clears same-sha marker, unrelated marker kept, older marker cleared, red writes marker, lane-send args, cancelled, no run, timeout; race, server ancestry, 40-run overflow, gh failure)"
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
esac
[ $# -eq 1 ] || { echo "usage: main-ci-watch.sh <merge-sha>" >&2; exit 2; }
watch "$1"
exit $?
