#!/usr/bin/env bash
# One command for the lead's resume (LANES §Lead rotation, step 1) and the 2-hour periodic check (#1142).
# Prints the capacity line, the lock audit, the wave status and the board, then one line per finding:
#   duplicate-write     two or more running write workers (roles impl*, fix) share one cwd
#   unowned-listener    a listener on a reserved preview/E2E port that no running worker or preview owns
#   idle-terminal       a done/stopped worker's Orca terminal is still listed
# Worker status matches board.py (#1149 Q2): a pid-less TUI worker whose Orca terminal is no longer
#   listed is closed; when the terminal list is unavailable it stays running. The list is queried once.
# Reserved ports: the LANES §Lanes E2E ports and their +1 base-path ports, the conductor.json
#   app_preview range, and 5173. Keep the LANES port list in sync when a lane is added.
# Exit 10 when any finding, or when capacity says start=no, lock-audit.sh exits 10, or board.py check exits 10.
# Env: WAVE_STATE (required: worker state dir), AP_MAIN/BOARD (board location, see board.py),
#   ENGINE (wave-status dir, default ~/.agents/skills/issue-wave-conductor/scripts),
#   LEAD_CHECK_PORT_LIST (reserved-port list override; self-test only),
#   LEAD_CHECK_TERMINALS (fixture `orca terminal list --json` output; self-test only).
# usage: lead-check.sh [--help|--self-test]
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENGINE=${ENGINE:-$HOME/.agents/skills/issue-wave-conductor/scripts}

usage() { awk '/^set -u/{exit} NR > 1 && /^#/ {sub(/^# ?/, ""); print}' "$0"; }

# Reserved ports: conductor.json app_preview range + LANES E2E ports (+1 base path each) + 5173.
reserved_ports() {
  local ports="5173" p lo hi
  for p in 4190 4390 4490 4590 4690 4790 4890 4990; do
    ports="$ports $p $((p + 1))"
  done
  if [ -r "$SCRIPT_DIR/../conductor.json" ]; then
    lo=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["app_preview"]["ports"][0])' "$SCRIPT_DIR/../conductor.json" 2>/dev/null)
    hi=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["app_preview"]["ports"][-1])' "$SCRIPT_DIR/../conductor.json" 2>/dev/null)
    if [ -n "${lo:-}" ] && [ -n "${hi:-}" ]; then
      p=$lo
      while [ "$p" -le "$hi" ]; do ports="$ports $p"; p=$((p + 1)); done
    fi
  fi
  echo "$ports"
}

# The three state findings. Ports to check come from LEAD_CHECK_PORT_LIST. Exit 10 on any finding.
state_findings() {
  python3 - "$WAVE_STATE" <<'PYEOF'
import json, os, subprocess, sys
from collections import defaultdict
from pathlib import Path

state_dir = Path(sys.argv[1])
notes, findings = [], []

def alive(pid):
    if not isinstance(pid, int):
        return False
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False

def ps_text(pid, field):
    try:
        r = subprocess.run(['ps', '-o', field, '-p', str(pid)], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''

def worker_status(s, path, terminals):  # same rule as board.py: done | closed | running | stopped
    started = s.get('started_at') or int(path.stat().st_mtime)
    report, sentinel = Path(s.get('report', '')), s.get('sentinel')
    if sentinel and report.is_file() and report.stat().st_mtime >= started:
        lines = [l for l in report.read_text(errors='replace').splitlines() if l.strip()]
        if lines and lines[-1] == sentinel:
            return 'done'
    if not Path(s.get('cwd', '/nonexistent')).is_dir():
        return 'closed'
    if s.get('pid'):
        return 'running' if alive(s['pid']) else 'stopped'
    if s.get('terminal') and terminals is not None and s['terminal'] not in terminals:
        return 'closed'  # a TUI worker has no pid; its closed terminal means it ended (as board.py)
    return 'running'

def write_role(role):
    return role is not None and (role.startswith('impl') or role == 'fix')

workers = []
for path in sorted(state_dir.glob('*.json')):
    if path.name.startswith('preview-'):
        continue
    try:
        workers.append((path.stem, json.loads(path.read_text()), path))
    except (ValueError, OSError):
        continue

# The Orca terminal list, queried once (Q2): worker status and the idle-terminal finding share it.
terminals = None
fixture = os.environ.get('LEAD_CHECK_TERMINALS')
if fixture is not None:
    try:
        terminals = {t.get('handle') for t in json.loads(fixture).get('result', {}).get('terminals', [])
                     if t.get('handle')}
    except ValueError:
        notes.append('terminal list fixture unreadable — idle-terminal and closed-TUI checks skipped')
else:
    try:
        r = subprocess.run(['orca', 'terminal', 'list', '--json'], capture_output=True, text=True, timeout=20)
        if r.returncode == 0:
            terminals = {t.get('handle') for t in json.loads(r.stdout).get('result', {}).get('terminals', [])
                         if t.get('handle')}
        else:
            notes.append('orca terminal list unavailable — idle-terminal and closed-TUI checks skipped')
    except (OSError, subprocess.TimeoutExpired, ValueError):
        notes.append('orca terminal list unavailable — idle-terminal and closed-TUI checks skipped')

# 1. Two or more running write workers share one cwd.
running_write = defaultdict(list)
worker_pids = {}
for name, s, path in workers:
    if worker_status(s, path, terminals) != 'running':
        continue
    if isinstance(s.get('pid'), int) and alive(s['pid']):
        worker_pids[s['pid']] = name
    if write_role(s.get('role')):
        running_write[s.get('cwd', '')].append(name)
for cwd, names in sorted(running_write.items()):
    if len(names) >= 2:
        findings.append(f'duplicate-write: {len(names)} running write workers on one cwd {cwd}: '
                        f'{", ".join(sorted(names))}')

# 2. A listener on a reserved port that no running worker or preview owns.
preview_pids, preview_pgids = {}, {}
for path in sorted(state_dir.glob('preview-*.json')):
    try:
        p = json.loads(path.read_text())
    except (ValueError, OSError):
        continue
    if isinstance(p.get('pid'), int) and alive(p['pid']):
        preview_pids[p['pid']] = path.stem
    if isinstance(p.get('pgid'), int):
        preview_pgids[p['pgid']] = path.stem
owners = set(worker_pids) | set(preview_pids)

def owned(pid):
    cur, seen = pid, set()
    for _ in range(20):  # the listener, then its ancestors: a worker/preview pid above counts as owner
        if cur in owners:
            return True
        pgid = ps_text(cur, 'pgid=').split()[0] if ps_text(cur, 'pgid=') else ''
        if pgid.isdigit() and int(pgid) in preview_pgids:
            return True
        if cur in seen or cur <= 1:
            return False
        seen.add(cur)
        nxt = ps_text(cur, 'ppid=')
        nxt = nxt.split()[0] if nxt else ''
        if not nxt.isdigit():
            return False
        cur = int(nxt)
    return False

ports = [int(p) for p in os.environ.get('LEAD_CHECK_PORT_LIST', '').replace(',', ' ').split() if p.isdigit()]
for port in ports:
    try:
        r = subprocess.run(['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN', '-t'],
                           capture_output=True, text=True, timeout=10)
        pids = [int(x) for x in r.stdout.split() if x.isdigit()] if r.returncode == 0 else []
    except (OSError, subprocess.TimeoutExpired):
        notes.append(f'port {port}: lsof unavailable — listener check skipped')
        continue
    for pid in pids:
        if owned(pid):
            continue
        cmd = ps_text(pid, 'command=')[:60] or '?'
        findings.append(f'unowned-listener: port {port} pid {pid} ({cmd}) is owned by no running worker or preview')

# 3. A done/stopped worker's Orca terminal is still listed.
if terminals is not None:
    for name, s, path in workers:
        status = worker_status(s, path, terminals)
        if status in ('done', 'stopped') and s.get('terminal') and s['terminal'] in terminals:
            findings.append(f'idle-terminal: worker {name} is {status} but terminal {s["terminal"]} is still listed')

for n in notes:
    print(f'lead-check: note {n}')
for f in findings:
    print(f'lead-check: {f}')
sys.exit(10 if findings else 0)
PYEOF
}

self_test() {
  # T, srv and live stay global: the EXIT trap runs after the function returns (#1151).
  local port rc out srvpid dead pass
  T=$(mktemp -d "${TMPDIR:-/tmp}/ap-lead-check-self-test.XXXXXX") || return 1
  mkdir -p "$T/state" "$T/wt1" "$T/wt2"
  # The EXIT trap also runs on a `set -u` abort, which skipped `fail` and left the http.server listening (#1151).
  # A `&` child killed before its exec inherits the trap and would delete the fixture mid-test, so each child
  # clears it first (bash 3.2: no BASHPID to tell the shells apart inside cleanup).
  cleanup() { kill "${srv:-}" "${live:-}" 2>/dev/null; wait "${srv:-}" "${live:-}" 2>/dev/null; rm -rf "${T:-}"; }
  trap cleanup EXIT
  pass=0
  fail() { echo "self-test failed: $1"; cleanup; exit 1; }
  check_has() { case "$2" in *"$1"*) pass=$((pass + 1)) ;; *) fail "missing '$1' in:
$2" ;; esac; }

  # A dead pid: spawn and reap, so the fixture is a real finished process.
  (trap - EXIT; exec sleep 60) & dead=$!; kill "$dead" 2>/dev/null; wait "$dead" 2>/dev/null
  (trap - EXIT; exec sleep 60) & live=$!

  # W-1 stopped with an open terminal; W-2 and W-3 running write workers on one cwd; a live preview owner.
  printf '{"name":"W-1","role":"impl","cwd":"%s","pid":%s,"terminal":"term_dead","report":"%s","sentinel":"<!-- W-1-DONE -->","started_at":1}\n' \
    "$T/wt1" "$dead" "$T/none.md" >"$T/state/W-1.json"
  printf '{"name":"W-2","role":"impl","cwd":"%s","report":"%s","sentinel":"<!-- W-2-DONE -->","started_at":%s}\n' \
    "$T/wt1" "$T/none.md" "$(date +%s)" >"$T/state/W-2.json"
  printf '{"name":"W-3","role":"fix","cwd":"%s","report":"%s","sentinel":"<!-- W-3-DONE -->","started_at":%s}\n' \
    "$T/wt1" "$T/none.md" "$(date +%s)" >"$T/state/W-3.json"
  printf '{"label":"owned","pid":%s,"pgid":%s,"port":1,"checkout":"%s"}\n' "$live" "$live" "$T" >"$T/state/preview-owned.json"

  # Pick a free port and listen on it.
  port=5971
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do port=$((port + 1)); done
  (trap - EXIT; exec python3 -m http.server "$port" --bind 127.0.0.1) >/dev/null 2>&1 & srv=$!
  sleep 1

  WAVE_STATE="$T/state" LEAD_CHECK_PORT_LIST="$port" \
    LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"term_dead"},{"handle":"term_live"}]}}' \
    state_findings >"$T/out" 2>&1; rc=$?
  out=$(cat "$T/out")
  [ "$rc" -eq 10 ] || fail "expected exit 10, got $rc"
  check_has "duplicate-write: 2 running write workers on one cwd $T/wt1: W-2, W-3" "$out"
  check_has "idle-terminal: worker W-1 is stopped but terminal term_dead is still listed" "$out"
  check_has "unowned-listener: port $port pid" "$out"

  # The same listener is clean once a running preview records its pid.
  srvpid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t | head -1)
  printf '{"label":"srv","pid":%s,"pgid":%s,"port":%s,"checkout":"%s"}\n' "$srvpid" "$srvpid" "$port" "$T" \
    >"$T/state/preview-srv.json"
  WAVE_STATE="$T/state" LEAD_CHECK_PORT_LIST="$port" \
    LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"term_dead"}]}}' \
    state_findings >"$T/out2" 2>&1; rc=$?
  out=$(cat "$T/out2")
  [ "$rc" -eq 10 ] || fail "expected exit 10 after owning the listener, got $rc"
  case "$out" in *unowned-listener*) fail "owned listener still flagged:
$out" ;; *) pass=$((pass + 1)) ;; esac

  # Clean state: one running worker, its terminal closed, no reserved listener.
  kill "$srv" 2>/dev/null; wait "$srv" 2>/dev/null
  kill "$live" 2>/dev/null; wait "$live" 2>/dev/null
  rm -f "$T/state"/*.json
  printf '{"name":"W-4","role":"impl","cwd":"%s","report":"%s","sentinel":"<!-- W-4-DONE -->","started_at":%s}\n' \
    "$T/wt2" "$T/none.md" "$(date +%s)" >"$T/state/W-4.json"
  WAVE_STATE="$T/state" LEAD_CHECK_TERMINALS='{"result":{"terminals":[]}}' \
    state_findings >"$T/out3" 2>&1; rc=$?
  [ "$rc" -eq 0 ] || fail "clean state flagged (exit $rc):
$(cat "$T/out3")"
  pass=$((pass + 1))

  # Q2: a closed old TUI worker and a new impl worker in the same cwd — one writer, no duplicate-write.
  mkdir -p "$T/wt3" "$T/wt4"
  printf '{"name":"W-5","role":"impl","cwd":"%s","terminal":"term_old","report":"%s","sentinel":"<!-- W-5-DONE -->","started_at":1}\n' \
    "$T/wt3" "$T/none.md" >"$T/state/W-5.json"
  printf '{"name":"W-6","role":"impl","cwd":"%s","terminal":"term_new","report":"%s","sentinel":"<!-- W-6-DONE -->","started_at":%s}\n' \
    "$T/wt3" "$T/none.md" "$(date +%s)" >"$T/state/W-6.json"
  WAVE_STATE="$T/state" LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"term_new"}]}}' \
    state_findings >"$T/out4" 2>&1; rc=$?
  [ "$rc" -eq 0 ] || fail "closed old TUI + new impl flagged (exit $rc):
$(cat "$T/out4")"
  pass=$((pass + 1))

  # Q2: two live TUI write workers on one cwd are still a duplicate write.
  printf '{"name":"W-7","role":"impl","cwd":"%s","terminal":"term_a","report":"%s","sentinel":"<!-- W-7-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/state/W-7.json"
  printf '{"name":"W-8","role":"fix","cwd":"%s","terminal":"term_b","report":"%s","sentinel":"<!-- W-8-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/state/W-8.json"
  WAVE_STATE="$T/state" \
    LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"term_a"},{"handle":"term_b"},{"handle":"term_new"}]}}' \
    state_findings >"$T/out5" 2>&1; rc=$?
  out=$(cat "$T/out5")
  [ "$rc" -eq 10 ] || fail "two live TUIs not flagged (exit $rc):
$out"
  check_has "duplicate-write: 2 running write workers on one cwd $T/wt4: W-7, W-8" "$out"

  # Q2: terminal list unavailable → the closed-TUI rule is off and pid-less TUI workers stay running (board.py).
  rm -f "$T/state"/*.json
  printf '{"name":"W-7","role":"impl","cwd":"%s","terminal":"term_a","report":"%s","sentinel":"<!-- W-7-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/state/W-7.json"
  printf '{"name":"W-9","role":"impl","cwd":"%s","terminal":"term_c","report":"%s","sentinel":"<!-- W-9-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/state/W-9.json"
  WAVE_STATE="$T/state" LEAD_CHECK_TERMINALS='not-json' state_findings >"$T/out6" 2>&1; rc=$?
  out=$(cat "$T/out6")
  [ "$rc" -eq 10 ] || fail "unavailable terminals should keep TUI workers running (exit $rc):
$out"
  check_has "duplicate-write: 2 running write workers on one cwd $T/wt4: W-7, W-9" "$out"

  cleanup
  echo "lead-check.sh self-test passed: $pass assertion groups (duplicate write cwd, idle terminal, unowned listener, owned listener, clean pass, closed old TUI same cwd, two live TUIs, terminals unavailable)"
}

[ $# -le 1 ] || { echo "usage: lead-check.sh [--help|--self-test]" >&2; exit 64; }
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
esac

[ -n "${WAVE_STATE:-}" ] || { echo "lead-check: WAVE_STATE is not set" >&2; exit 2; }
[ -d "$WAVE_STATE" ] || { echo "lead-check: WAVE_STATE $WAVE_STATE is not a directory" >&2; exit 2; }

rc=0

cap=$(bash "$SCRIPT_DIR/capacity.sh" 2>&1) || true
echo "$cap"
case "$cap" in *" start=no"*)
  echo "lead-check: capacity start=no — start no new worker or heavy step"
  rc=10 ;;
esac

la_out=$(bash "$SCRIPT_DIR/lock-audit.sh" 2>&1); la=$?
[ -n "$la_out" ] && printf '%s\n' "$la_out"
[ "$la" -eq 10 ] && rc=10

python3 "$ENGINE/wave-status.py" --state-dir "$WAVE_STATE" || true

python3 "$SCRIPT_DIR/board.py" show || true
python3 "$SCRIPT_DIR/board.py" check
[ $? -eq 10 ] && rc=10

LEAD_CHECK_PORT_LIST=$(reserved_ports) state_findings
[ $? -eq 10 ] && rc=10

exit $rc
