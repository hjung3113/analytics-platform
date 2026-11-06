#!/usr/bin/env bash
# Watch the main push CI of one merge commit (addenda/merge.md, after the merge). Run it in the background.
# usage: main-ci-watch.sh <merge-sha> | --help | --self-test
#   1. Find the ci.yml push run on main for <merge-sha> (looked up on the server by commit), retrying up to
#      MAIN_CI_FIND_TIMEOUT (default 300 s); wait for it to complete, at most MAIN_CI_TIMEOUT (default 5400 s = 90 min).
#   2. Marker = the truth now. Once the run has completed, under a mkdir lock beside the marker, ask the server for the newest
#      ci.yml push run on main (completed cancelled/skipped/neutral skipped, window of 50): red (failure/timed_out/
#      startup_failure) writes $AP_MAIN/.review/lanes/main-red with that run's sha, id and url; success removes it.
#      If that newest run is still queued or running (a re-run included) or none is found, an existing marker stays and a
#      red watched run records itself. Reason: every watcher writes the current state, so finish order cannot leave a stale
#      marker, and an unfinished run never clears a known red. A re-run has no watcher of its own: run this script again.
#   3. Notify only for the watched run: if THAT run failed, print the line and, when LANE_NAME is set, send
#      `lane-send.sh "main 깨짐" - "<run url>"` to the lead (LANE_RUN is read by lane-send.sh). Without LANE_NAME only the
#      marker is written and the line is printed.
#   The script cds to $AP_MAIN first, so gh never depends on the caller's cwd (it may be a worktree removed meanwhile).
#   merge-precheck.sh reads the marker; a fix PR merges with `merge-precheck.sh --main-fix`.
# Exit: 0 watched run green, cancelled or skipped / 1 watched run red (marker updated) / 2 usage, AP_MAIN missing or gh failed /
#   3 no run appeared or the wait timed out.
# Env: AP_MAIN (default: the git common dir's parent), MAIN_CI_POLL (poll seconds, default 30),
#   MAIN_CI_FIND_TIMEOUT, MAIN_CI_TIMEOUT, MAIN_CI_LOCK_TRIES, LANE_NAME, LANE_RUN,
#   MAIN_CI_RUNS_CMD (self-test only: command printing the `gh run list` JSON; MAIN_CI_SHA is the commit asked for),
#   MAIN_CI_LATEST_CMD (self-test only: command printing the JSON of the latest completed runs),
#   MAIN_CI_SEND_CMD (self-test only: replaces `bash lane-send.sh`; receives kind, "-", body).
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

# stdin: JSON of runs (any status), newest first. Skips completed cancelled/skipped/neutral runs (they say nothing about
# main). Prints "<conclusion> <headSha> <databaseId> <url>" for the first other run, "pending ..." when that run is still
# queued or running (a re-run of a red run included: its red is not resolved yet), or "none".
pick_latest() {
  python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin)
except ValueError:
    print("unreadable"); sys.exit(0)
for r in runs if isinstance(runs, list) else []:
    c = r.get("conclusion") or ""
    if r.get("status") == "completed" and c in ("cancelled", "skipped", "neutral"):
        continue
    if r.get("status") != "completed" or not c:
        c = "pending"
    print("%s %s %s %s" % (c, r.get("headSha") or "-", r.get("databaseId") or "-", r.get("url") or "-"))
    sys.exit(0)
print("none")
'
}

latest_rec() { # prints the pick_latest record; rc 2 when gh fails
  local json
  if [ -n "${MAIN_CI_LATEST_CMD:-}" ]; then json=$(eval "$MAIN_CI_LATEST_CMD")
  else json=$(gh run list --branch main --workflow ci.yml --event push --limit 50 \
    --json status,conclusion,headSha,databaseId,url,createdAt)
  fi || { echo "main-ci-watch: gh run list (latest) failed" >&2; return 2; }
  printf '%s' "$json" | pick_latest
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

write_atomic() { # <file> <content>
  printf '%s' "$2" >"$1.tmp.$$" && mv -f "$1.tmp.$$" "$1"
}

# Under the lock: set the marker from the newest run on main (see step 2). rc 2 = lookup failed.
sync_marker() { # <marker> <watched conclusion> <watched sha> <watched id> <watched url>
  local marker=$1 wconcl=$2 wsha=$3 wid=$4 wurl=$5 rec concl sha id url
  rec=$(latest_rec) || return 2
  [ "$rec" = unreadable ] && { echo "main-ci-watch: latest run list unreadable" >&2; return 2; }
  if [ "$rec" = none ] || [ "${rec%% *}" = pending ]; then
    # The newest run cannot judge main yet: keep any marker; a red watched run still records itself if none exists.
    case "$wconcl" in
      success|cancelled|skipped|neutral) echo "main-ci-watch: newest run not finished or none; marker unchanged"; return 0 ;;
    esac
    [ -e "$marker" ] && { echo "main-ci-watch: newest run not finished; keeping $marker"; return 0; }
    rec="$wconcl $wsha $wid $wurl"
  fi
  set -- $rec; concl=$1 sha=$2 id=$3 url=$4
  case "$concl" in
    success)
      if [ -e "$marker" ]; then rm -f "$marker"; echo "main-ci-watch: latest run is green (${sha:0:10}); removed $marker"; fi ;;
    *)
      write_atomic "$marker" "$(printf 'sha=%s\nrun=%s\nurl=%s\nconclusion=%s\ntime=%s' "$sha" "$id" "$url" "$concl" "$(date '+%Y-%m-%dT%H:%M:%S%z')")"$'\n'
      echo "main-ci-watch: latest run is $concl (${sha:0:10}); wrote $marker" ;;
  esac
}

watch() { # <sha> ; sets the exit code
  local rc sha=$1 main common marker poll find_to run_to start now rec status concl id url
  main=${AP_MAIN:-}
  if [ -z "$main" ]; then  # from the script's own checkout: the caller's cwd may be gone
    common=$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && main=$(dirname "$common")
  fi
  [ -n "$main" ] && [ -d "$main" ] || { echo "main-ci-watch: AP_MAIN unknown or missing: ${main:-}" >&2; return 2; }
  cd "$main" || return 2
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
  take_lock "$marker" || return 2  # 2. the marker follows the newest run on main, whichever watcher gets here
  sync_marker "$marker" "$concl" "$sha" "$id" "$url"; rc=$?
  drop_lock
  [ $rc -eq 0 ] || return $rc
  case "$concl" in  # 3. notify for the watched run only
    success) return 0 ;;
    cancelled|skipped|neutral) echo "main-ci-watch: run $id ($url) is $concl; superseded or skipped"; return 0 ;;
    *)
      echo "main-ci-watch: MAIN-RED ${sha:0:10} $concl $url (marker $marker)"
      if [ -n "${LANE_NAME:-}" ]; then
        if [ -n "${MAIN_CI_SEND_CMD:-}" ]; then eval "$MAIN_CI_SEND_CMD" "'main 깨짐'" "-" "'$url'"
        else bash "$main/.agents/conductor/scripts/lane-send.sh" "main 깨짐" - "$url"; fi || echo "main-ci-watch: lane-send failed" >&2  # lane-send from AP_MAIN: this script's worktree may be gone
      else
        echo "main-ci-watch: LANE_NAME is not set; marker written, nothing sent — tell the lead"
      fi
      return 1 ;;
  esac
}

self_test() {
  local T rc pass out SELF
  SELF="$SCRIPT_DIR/$(basename "$0")"
  T=$(mktemp -d "${TMPDIR:-/tmp}/ap-main-ci-watch-self-test.XXXXXX") || return 1
  cleanup() { rm -rf "$T"; }
  pass=0
  fail() { echo "self-test failed: $1"; cleanup; exit 1; }
  expect() { [ "$1" -eq "$rc" ] && { pass=$((pass + 1)); return 0; }; fail "$2: exit $rc, expected $1"; }
  mkdir -p "$T/main/.review/lanes" "$T/bin"
  export AP_MAIN="$T/main" MAIN_CI_POLL=0 MAIN_CI_FIND_TIMEOUT=2 MAIN_CI_TIMEOUT=2
  local marker="$T/main/.review/lanes/main-red" sha=1111111111111111111111111111111111111111
  local other=2222222222222222222222222222222222222222
  # Fake run list: $SEQ_DIR holds one JSON per call (the last repeats); a counter file picks the next. `ls .` fails when the
  # cwd was deleted, like gh does.
  cat >"$T/bin/runs" <<'EOF'
#!/bin/sh
ls . >/dev/null 2>&1 || exit 1
n=$(cat "$SEQ_DIR/n" 2>/dev/null || echo 0)
f="$SEQ_DIR/$n.json"
[ -f "$f" ] || f="$SEQ_DIR/last.json"
echo $((n + 1)) >"$SEQ_DIR/n"
cat "$f"
EOF
  printf '#!/bin/sh\nls . >/dev/null 2>&1 || exit 1\ncat "%s/latest.json"\n' "$T" >"$T/bin/latest"
  chmod +x "$T/bin/runs" "$T/bin/latest"
  export SEQ_DIR="$T/seq" MAIN_CI_RUNS_CMD="$T/bin/runs" MAIN_CI_LATEST_CMD="$T/bin/latest"
  seqreset() { rm -rf "$SEQ_DIR"; mkdir -p "$SEQ_DIR"; }
  run_json() { printf '[{"status":"%s","conclusion":%s,"headSha":"%s","databaseId":77,"url":"https://example.test/run/77"}]' "$1" "$2" "$3"; }
  watched() { seqreset; run_json completed "\"$1\"" "$2" >"$SEQ_DIR/last.json"; }   # the watched run
  latest() { run_json completed "\"$1\"" "$2" >"$T/latest.json"; }                    # newest completed run on main
  printf '#!/bin/sh\nprintf "%%s|%%s|%%s\\n" "$1" "$2" "$3" >"%s/sent"\n' "$T" >"$T/bin/send"; chmod +x "$T/bin/send"

  bash "$SELF" >/dev/null 2>&1; rc=$?; expect 2 "usage"

  # Run appears late, finishes green; the latest run is green: a marker is removed.
  seqreset; printf '[]' >"$SEQ_DIR/0.json"; run_json in_progress null "$sha" >"$SEQ_DIR/1.json"; run_json completed '"success"' "$sha" >"$SEQ_DIR/last.json"
  latest success "$sha"; printf 'sha=%s\nrun=1\n' "$other" >"$marker"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "green after retries"
  [ ! -e "$marker" ] || fail "green did not remove the marker"
  pass=$((pass + 1))

  # (a) The watched run is red but the latest completed run is green: marker removed, exit 1, notify sent.
  watched failure "$other"; latest success "$sha"; rm -f "$T/sent"
  printf 'sha=%s\n' "$other" >"$marker"
  LANE_NAME=ops MAIN_CI_SEND_CMD="$T/bin/send" bash "$SELF" "$other" >"$T/out" 2>&1; rc=$?; expect 1 "(a) red watched, green latest"
  [ ! -e "$marker" ] || fail "(a) a green latest run left the marker"
  [ "$(cat "$T/sent" 2>/dev/null)" = "main 깨짐|-|https://example.test/run/77" ] || fail "(a) no notify: $(cat "$T/sent" 2>/dev/null)"
  pass=$((pass + 1))

  # (b) The watched run is green but the latest completed run is red (another sha): marker written with that sha, no notify.
  watched success "$sha"; latest failure "$other"; rm -f "$marker" "$T/sent"
  LANE_NAME=ops MAIN_CI_SEND_CMD="$T/bin/send" bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "(b) green watched, red latest"
  grep -q "sha=$other" "$marker" || fail "(b) marker does not name the latest red sha"
  [ ! -e "$T/sent" ] || fail "(b) notified for a green watched run"
  pass=$((pass + 1))

  # (c) Same sha re-run: an earlier green, then a newer red for the same sha writes the marker.
  rm -f "$marker"; watched success "$sha"; latest success "$sha"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "(c) first green"
  [ ! -e "$marker" ] || fail "(c) marker after green"
  watched failure "$sha"; latest failure "$sha"
  env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "(c) same-sha re-run red"
  grep -q "sha=$sha" "$marker" && grep -q 'run=77' "$marker" || fail "(c) re-run red not written"
  grep -q "LANE_NAME is not set" "$T/out" || fail "no marker-only notice"
  pass=$((pass + 1))
  rm -f "$marker"

  # Cancelled runs are ignored when judging main: [cancelled newest, failure older] -> the failure is the state.
  watched cancelled "$sha"
  printf '[{"status":"completed","conclusion":"cancelled","headSha":"%s","databaseId":90,"url":"u90"},{"status":"completed","conclusion":"failure","headSha":"%s","databaseId":80,"url":"u80"}]' "$sha" "$other" >"$T/latest.json"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "cancelled watched run"
  grep -q "sha=$other" "$marker" && grep -q 'run=80' "$marker" || fail "cancelled run was not skipped when judging main"
  pass=$((pass + 1))
  # No completed run at all: the marker stays as it was.
  printf '[]' >"$T/latest.json"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "empty latest list"
  [ -e "$marker" ] || fail "empty latest list removed the marker"
  pass=$((pass + 1))
  rm -f "$marker"

  # N2: a red marker for B; B is re-running (newest, in_progress) and an older A success arrives late: marker kept.
  printf 'sha=%s\nrun=77\n' "$other" >"$marker"
  watched success "$sha"
  printf '[{"status":"in_progress","conclusion":null,"headSha":"%s","databaseId":77,"url":"u77"},{"status":"completed","conclusion":"success","headSha":"%s","databaseId":10,"url":"u10"}]' "$other" "$sha" >"$T/latest.json"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 0 "(N2) late green during a re-run"
  grep -q "sha=$other" "$marker" || fail "(N2) a late older green removed the marker of a re-running red"
  pass=$((pass + 1))
  # Newest run still running, watched run red, no marker: the watched red is recorded.
  rm -f "$marker"; watched failure "$sha"
  env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "red while a newer run is pending"
  grep -q "sha=$sha" "$marker" || fail "watched red not recorded while the newest run is pending"
  pass=$((pass + 1))
  # N3: every listed run is cancelled; the watched red is still recorded.
  rm -f "$marker"; watched failure "$sha"
  python3 -c 'import json; print(json.dumps([{"status":"completed","conclusion":"cancelled","headSha":"%040d" % i,"databaseId":i,"url":"u"} for i in range(50)]))' >"$T/latest.json"
  env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "(N3) only cancelled runs listed"
  grep -q "sha=$sha" "$marker" || fail "(N3) watched red lost behind cancelled runs"
  pass=$((pass + 1))
  rm -f "$marker"

  # Results are applied under a lock; a held lock delays the write until it is released.
  mkdir "$marker.lock.d"; ( sleep 1; rmdir "$marker.lock.d" ) &
  watched failure "$sha"; latest failure "$sha"
  env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "red waits for the lock"
  [ ! -d "$marker.lock.d" ] || fail "lock not released"
  grep -q "sha=$sha" "$marker" || fail "red did not write after the lock was released"
  pass=$((pass + 1))
  rm -f "$marker"
  # A lock that stays held makes the watcher stop with exit 2 instead of writing around it.
  mkdir "$marker.lock.d"
  MAIN_CI_LOCK_TRIES=2 bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "lock held"
  [ ! -e "$marker" ] || fail "marker written without the lock"
  rmdir "$marker.lock.d"

  # Never appears: exit 3. Never finishes: exit 3.
  seqreset; printf '[]' >"$SEQ_DIR/last.json"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 3 "run never appears"
  seqreset; run_json in_progress null "$sha" >"$SEQ_DIR/last.json"
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 3 "run never finishes"

  # (d) C5: started from a deleted cwd, the watcher still finishes (it cds to AP_MAIN; the fakes fail in a dead cwd).
  watched failure "$sha"; latest failure "$sha"; rm -f "$marker"
  mkdir "$T/gone"
  ( cd "$T/gone" && rmdir "$T/gone" && env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1 ); rc=$?; expect 1 "(d) deleted cwd"
  grep -q "sha=$sha" "$marker" || fail "(d) marker not written from a deleted cwd"
  rm -f "$marker"
  AP_MAIN="$T/nowhere" bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "missing AP_MAIN"

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
  latest failure "$sha"
  env -u LANE_NAME bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 1 "target behind 40 other runs"
  grep -q "sha=$sha" "$marker" || fail "target beyond the first 30 runs was not found"
  pass=$((pass + 1))
  rm -f "$marker"

  # C7: a gh failure exits 2 at once, on the first lookup, while waiting for the run, and on the latest-run lookup.
  printf '#!/bin/sh\necho "[" ; exit 1\n' >"$T/bin/runs"; chmod +x "$T/bin/runs"
  seqreset
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "gh fails on the first lookup"
  printf '#!/bin/sh\nn=$(cat "$SEQ_DIR/n" 2>/dev/null || echo 0)\necho $((n + 1)) >"$SEQ_DIR/n"\nif [ "$n" -ge 1 ]; then exit 1; fi\nprintf "[{\\"status\\":\\"in_progress\\",\\"conclusion\\":null,\\"headSha\\":\\"%%s\\",\\"databaseId\\":77,\\"url\\":\\"u\\"}]" "$MAIN_CI_SHA"\n' >"$T/bin/runs"
  seqreset
  MAIN_CI_TIMEOUT=60 bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "gh fails while waiting"
  printf '#!/bin/sh\nprintf "[{\\"status\\":\\"completed\\",\\"conclusion\\":\\"success\\",\\"headSha\\":\\"%%s\\",\\"databaseId\\":77,\\"url\\":\\"u\\"}]" "$MAIN_CI_SHA"\n' >"$T/bin/runs"
  printf '#!/bin/sh\nexit 1\n' >"$T/bin/latest"
  seqreset
  bash "$SELF" "$sha" >"$T/out" 2>&1; rc=$?; expect 2 "gh fails on the latest-run lookup"
  [ ! -d "$marker.lock.d" ] || fail "lock left behind after a failed lookup"

  cleanup
  echo "main-ci-watch.sh self-test passed: $pass checks (usage; late run; red watched + green latest; green watched + red latest; same-sha re-run; cancelled ignored; empty latest; re-run pending (N2); pending + red; all cancelled (N3); lock wait and timeout; no run; timeout; deleted cwd; missing AP_MAIN; 40-run overflow; gh failures)"
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
esac
[ $# -eq 1 ] || { echo "usage: main-ci-watch.sh <merge-sha>" >&2; exit 2; }
watch "$1"
exit $?
