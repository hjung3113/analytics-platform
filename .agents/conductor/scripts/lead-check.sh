#!/usr/bin/env bash
# One command for the lead's resume (LANES §Lead rotation, step 1) and the 2-hour periodic check (#1142).
# Prints the capacity line of every lane host (hosts-capacity.sh), the lock audit, the wave status and the board, then one line per finding:
#   duplicate-write     two or more running write workers (roles impl*, fix) share one cwd
#   unowned-listener    a listener on a reserved preview/E2E port that no running worker or preview owns
#   idle-terminal       a done/stopped worker's Orca terminal is still listed
#   idle-lane           a lane is idle for more than LEAD_CHECK_IDLE_MIN (default 20) minutes while `board.py ready` lists
#                       an in-scope line
# Per-lane liveness (#1401): for each $AP_MAIN/.review/wave/state-<lane> (state-lead excluded) that has a lane worktree
#   (`git worktree list`, directory lane-<lane>[-<n>]), print `lane <name> alive` or `lane <name> idle_since=<min>`.
#   A lane is alive when a worker pid in its state JSONs is alive, or a node/vitest/turbo/playwright process, or a
#   non-interactive codex/claude run (args exec|-p|--print), has its cwd under the lane worktree or under the cwd/worktree
#   of any worker of the lane, finished or not (the lead verifies there after the worker ends). A listed Orca terminal of an
#   unfinished worker counts; the lane's own interactive claude/codex session (its cwd is always the worktree) does not.
#   When the Orca terminal list cannot be read and nothing else shows life, print `lane <name> unknown`: never an
#   idle-lane finding. idle_since is the age of the newest state JSON or worker report of the lane.
# State dirs: WAVE_STATE plus every $AP_MAIN/.review/wave/state-*; board.py check and the findings above read all of them.
# Worker status matches board.py (#1149 Q2): a pid-less TUI worker whose Orca terminal is no longer
#   listed is closed; when the terminal list is unavailable it stays running. The list is queried once.
# Reserved ports: the LANES §Lanes E2E ports and their +1 base-path ports, the conductor.json
#   app_preview range, and 5173. Keep the LANES port list in sync when a lane is added.
# Exit 10 when any finding, or when capacity says start=no, lock-audit.sh exits 10, or board.py check exits 10.
# Env: WAVE_STATE (worker state dir; required unless lane state dirs exist), AP_MAIN/BOARD (board location, see board.py),
#   ENGINE (wave-status dir, default ~/.agents/skills/issue-wave-conductor/scripts),
#   LEAD_CHECK_IDLE_MIN (idle threshold in minutes, default 20),
#   LEAD_CHECK_PORT_LIST (reserved-port list override; self-test only),
#   LEAD_CHECK_TERMINALS (fixture `orca terminal list --json` output; self-test only),
#   LEAD_CHECK_WORKTREES (fixture: worktree paths, one per line; self-test only),
#   LEAD_CHECK_PROCS (fixture: lines `comm<TAB>cwd<TAB>args` instead of lsof; self-test only).
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
  python3 - "${STATE_DIRS:-$WAVE_STATE}" <<'PYEOF'
import json, os, subprocess, sys
from collections import defaultdict
from pathlib import Path

state_dirs = [Path(p) for p in sys.argv[1].split(':') if p]  # one dir, or lane dirs joined with ':'
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
for state_dir in state_dirs:
    for path in sorted(state_dir.glob('*.json')):
        if path.name.startswith('preview-'):
            continue
        try:
            state = json.loads(path.read_text())
        except (ValueError, OSError):
            continue
        if isinstance(state, dict):  # CI snapshots (JSON lists) share the dir; only objects are worker states
            workers.append((path.stem, state, path))

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
for state_dir in state_dirs:
    for path in sorted(state_dir.glob('preview-*.json')):
        try:
            p = json.loads(path.read_text())
        except (ValueError, OSError):
            continue
        if isinstance(p, dict) and isinstance(p.get('pid'), int) and alive(p['pid']):
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

# Per-lane liveness. args: <ap_main> <ready-line-count> <state-dir>... Prints a `lane …` line per lane with a worktree;
# exit 10 on an idle-lane finding.
lane_liveness() {
  python3 - "$@" <<'PYEOF'
import os, re, subprocess, sys, time
from pathlib import Path
import json

main, ready = Path(sys.argv[1]), int(sys.argv[2])
dirs = [Path(d) for d in sys.argv[3:]]
idle_limit = int(os.environ.get('LEAD_CHECK_IDLE_MIN', '20'))
PROC_NAMES = ('node', 'vitest', 'turbo', 'playwright', 'codex', 'claude')

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

def worktrees():
    fixture = os.environ.get('LEAD_CHECK_WORKTREES')
    if fixture is not None:
        return [l.strip() for l in fixture.splitlines() if l.strip()]
    try:
        r = subprocess.run(['git', '-C', str(main), 'worktree', 'list', '--porcelain'],
                           capture_output=True, text=True, timeout=20)
        return [l[len('worktree '):] for l in r.stdout.splitlines() if l.startswith('worktree ')]
    except (OSError, subprocess.TimeoutExpired):
        return []

def processes():
    """(comm, cwd, args) of candidate processes. Interactive claude/codex sessions are dropped: their cwd is the
    lane worktree whether or not any work runs."""
    fixture = os.environ.get('LEAD_CHECK_PROCS')
    rows = []
    if fixture is not None:
        for l in fixture.splitlines():
            parts = l.split('\t')
            if len(parts) >= 2:
                rows.append((parts[0], parts[1], parts[2] if len(parts) > 2 else ''))
    else:
        cmd = ['lsof', '-nP', '-a', '-d', 'cwd'] + [x for n in PROC_NAMES for x in ('-c', n)] + ['-Fpcn']
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout
        except (OSError, subprocess.TimeoutExpired):
            return []
        pid = comm = None
        for l in out.splitlines():
            if l.startswith('p'):
                pid, comm = l[1:], None
            elif l.startswith('c'):
                comm = l[1:]
            elif l.startswith('n') and pid and comm:
                args = ''
                if comm in ('claude', 'codex'):
                    a = subprocess.run(['ps', '-o', 'args=', '-p', pid], capture_output=True, text=True)
                    args = a.stdout.strip()
                rows.append((comm, l[1:], args))
    keep = []
    for comm, cwd, args in rows:
        if comm in ('claude', 'codex') and not re.search(r'(^|\s)(exec|-p|--print)(\s|$)', args):
            continue
        keep.append((comm, cwd))
    return keep

def live_terminals():
    """Handles of listed Orca terminals, or None when the list is unavailable (then no terminal counts as alive)."""
    fixture = os.environ.get('LEAD_CHECK_TERMINALS')
    try:
        if fixture is not None:
            data = json.loads(fixture)
        else:
            r = subprocess.run(['orca', 'terminal', 'list', '--json'], capture_output=True, text=True, timeout=20)
            if r.returncode != 0:
                return None
            data = json.loads(r.stdout)
        return {t.get('handle') for t in data.get('result', {}).get('terminals', []) if t.get('handle')}
    except (OSError, subprocess.TimeoutExpired, ValueError, AttributeError):
        return None

def report_done(s, p):
    rep, sentinel = Path(s.get('report', '')), s.get('sentinel')
    if not (sentinel and rep.is_file() and rep.stat().st_mtime >= (s.get('started_at') or int(p.stat().st_mtime))):
        return False
    lines = [l for l in rep.read_text(errors='replace').splitlines() if l.strip()]
    return bool(lines) and lines[-1] == sentinel

def under(path, root):
    root = root.rstrip('/')
    return bool(root) and (path == root or path.startswith(root + '/'))

wts = worktrees()
procs = processes()
terms = live_terminals()
findings = []
for d in sorted(dirs):
    if not d.name.startswith('state-') or d.name == 'state-lead':
        continue
    lane = d.name[len('state-'):]
    wt = next((w for w in wts if re.fullmatch(r'lane-%s(-\d+)?' % re.escape(lane), os.path.basename(w))), None)
    if wt is None:
        continue
    why = None
    roots = [wt]  # the lane worktree plus every worktree its workers run in (state cwd / worktree)
    newest = d.stat().st_mtime
    for p in d.glob('*.json'):
        newest = max(newest, p.stat().st_mtime)
        try:
            s = json.loads(p.read_text())
        except (ValueError, OSError):
            continue
        if p.name.startswith('preview-') or not isinstance(s, dict):
            continue
        rep = Path(s.get('report', ''))
        if rep.is_file():
            newest = max(newest, rep.stat().st_mtime)
        if why is None and isinstance(s.get('pid'), int) and alive(s['pid']):
            why = f'worker pid {s["pid"]}'
        # A TUI worker (codex-orca, omp) has no pid: its listed, unfinished terminal is the liveness record.
        if why is None and terms is not None and s.get('terminal') in terms and not report_done(s, p):
            why = f'worker {p.stem} terminal {s["terminal"]}'
        # Every worker's issue worktree counts, finished or not: the lead verifies there after the worker ends.
        roots += [r for r in (s.get('cwd'), s.get('worktree')) if isinstance(r, str) and r]
    if why is None:
        for comm, cwd in procs:
            if any(under(cwd, r) for r in roots):
                why = f'{comm} in {cwd}'
                break
    if why:
        print(f'lane {lane} alive ({why})')
        continue
    if terms is None:  # without the terminal list a pid-less TUI worker cannot be told from a closed one
        print(f'lane {lane} unknown (orca terminal list unavailable)')
        continue
    idle = int((time.time() - newest) / 60)
    print(f'lane {lane} idle_since={idle}')
    if idle > idle_limit and ready > 0:
        findings.append(f'idle-lane: lane {lane} has no live worker or process for {idle} min while the board has '
                        f'{ready} ready in-scope line(s) — assign one (board.py ready)')
for f in findings:
    print(f'lead-check: {f}')
sys.exit(10 if findings else 0)
PYEOF
}

# The state dirs to read: WAVE_STATE plus every lane dir under $AP_MAIN/.review/wave, joined with ':'.
collect_state_dirs() {
  local main=$1 d out="" seen=""
  for d in "${WAVE_STATE:-}" "$main"/.review/wave/state-*; do
    [ -n "$d" ] && [ -d "$d" ] || continue
    d=$(cd "$d" && pwd -P)
    case ":$seen:" in *":$d:"*) continue ;; esac
    seen="$seen:$d"
    out="${out:+$out:}$d"
  done
  printf '%s' "$out"
}

self_test() {
  # T, srv and live stay global: the EXIT trap runs after the function returns (#1151).
  local port rc out srvpid dead pass
  unset WAVE_STATE  # a lane's ambient state dir must not leak into the fixtures
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

  # #1401: state findings read several lane dirs at once (duplicate write across two dirs).
  rm -rf "$T/s1" "$T/s2"; mkdir -p "$T/s1" "$T/s2"
  printf '{"name":"W-11","role":"impl","cwd":"%s","terminal":"t1","report":"%s","sentinel":"<!-- W-11-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/s1/W-11.json"
  printf '{"name":"W-12","role":"impl","cwd":"%s","terminal":"t2","report":"%s","sentinel":"<!-- W-12-DONE -->","started_at":%s}\n' \
    "$T/wt4" "$T/none.md" "$(date +%s)" >"$T/s2/W-12.json"
  STATE_DIRS="$T/s1:$T/s2" LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"t1"},{"handle":"t2"}]}}' \
    state_findings >"$T/out7" 2>&1; rc=$?
  out=$(cat "$T/out7")
  [ "$rc" -eq 10 ] || fail "duplicate write across two state dirs not flagged (exit $rc):
$out"
  check_has "duplicate-write: 2 running write workers on one cwd $T/wt4: W-11, W-12" "$out"

  # #1401: per-lane liveness. a: live worker pid. b: idle, only the lane's interactive claude session in its cwd.
  # c: a node process in the worktree. d: done worker with an open terminal (does not count). e: no worktree.
  # g: a non-interactive codex run in the worktree. lead: skipped.
  # h (C3): a pid-less codex-orca worker whose terminal is listed. i: its terminal is listed but the report is done.
  # j: a node verify in the worker's own issue worktree (state cwd), outside the lane worktree.
  # k: unreadable terminal list + the worker's interactive TUI -> unknown, no finding.
  # l: report done, node verify in the issue cwd -> alive.
  (trap - EXIT; exec sleep 60) & live=$!
  W="$T/main/.review/wave"; rm -rf "$T/main"; mkdir -p "$W"
  for l in a b c d e g h i j lead; do mkdir -p "$W/state-$l"; done
  printf '{"name":"W-21","role":"impl","cwd":"%s","pid":%s,"report":"%s","started_at":1}\n' "$T/wt1" "$live" "$T/none.md" >"$W/state-a/W-21.json"
  printf '{"name":"W-22","role":"impl","cwd":"%s","pid":99999999,"report":"%s","started_at":1}\n' "$T/wt1" "$T/none.md" >"$W/state-b/W-22.json"
  printf '{"name":"W-23","role":"impl","cwd":"%s","report":"%s","started_at":1}\n' "$T/wt1" "$T/none.md" >"$W/state-c/W-23.json"
  printf '{"name":"W-24","role":"impl","cwd":"%s","terminal":"term_open","report":"%s/W-24-REPORT.md","sentinel":"<!-- W-24-DONE -->","started_at":1}\n' "$T/wt1" "$W/state-d" >"$W/state-d/W-24.json"
  printf '## Summary\n<!-- W-24-DONE -->\n' >"$W/state-d/W-24-REPORT.md"
  printf '{"name":"W-25","role":"impl","cwd":"%s","report":"%s","started_at":1}\n' "$T/wt1" "$T/none.md" >"$W/state-e/W-25.json"
  printf '{"name":"W-26","role":"impl","cwd":"%s","report":"%s","started_at":1}\n' "$T/wt1" "$T/none.md" >"$W/state-g/W-26.json"
  printf '{"name":"W-27","role":"impl","cwd":"%s/issue-h","terminal":"term_open","report":"%s/none.md","started_at":1}\n' "$T" "$T" >"$W/state-h/W-27.json"
  printf '{"name":"W-28","role":"impl","cwd":"%s/issue-i","terminal":"term_open","report":"%s/W-28-REPORT.md","sentinel":"<!-- W-28-DONE -->","started_at":1}\n' "$T" "$W/state-i" >"$W/state-i/W-28.json"
  printf '## Summary\n<!-- W-28-DONE -->\n' >"$W/state-i/W-28-REPORT.md"
  printf '{"name":"W-29","role":"impl","cwd":"%s/issue-j","report":"%s/none.md","started_at":1}\n' "$T" "$T" >"$W/state-j/W-29.json"
  for l in a b; do printf '[{"name":"ci","bucket":"pass"}]\n' >"$W/state-$l/ci-snapshot.json"; done  # CI snapshots are JSON lists, not worker states
  for l in b c d e g h i j; do touch -t 202601010000 "$W/state-$l"/* "$W/state-$l"; done
  WT=$(printf '%s\n' "$T/wt/lane-a" "$T/wt/lane-b-2" "$T/wt/lane-c" "$T/wt/lane-d" "$T/wt/lane-g" "$T/wt/lane-h" "$T/wt/lane-i" "$T/wt/lane-j" "$T/wt/lane-lead")
  PR=$(printf 'claude\t%s\tclaude --dangerously-skip-permissions\nnode\t%s/apps/x\tnode vitest\ncodex\t%s\tcodex exec --task t\nnode\t%s/issue-j/apps\tnode verify\n' \
    "$T/wt/lane-b-2" "$T/wt/lane-c" "$T/wt/lane-g" "$T")
  dirs=$(collect_state_dirs "$T/main")
  [ "$(printf '%s' "$dirs" | tr ':' '\n' | grep -c .)" -eq 10 ] || fail "collect_state_dirs: $dirs"
  [ "$(WAVE_STATE="$W/state-a" collect_state_dirs "$T/main" | tr ':' '\n' | grep -c .)" -eq 10 ] \
    || fail "collect_state_dirs does not dedupe WAVE_STATE"
  pass=$((pass + 1))
  # shellcheck disable=SC2086
  LEAD_CHECK_TERMINALS='{"result":{"terminals":[{"handle":"term_open"}]}}' \
    LEAD_CHECK_WORKTREES="$WT" LEAD_CHECK_PROCS="$PR" lane_liveness "$T/main" 1 $(printf '%s' "$dirs" | tr ':' ' ') >"$T/out8" 2>&1; rc=$?
  out=$(cat "$T/out8")
  [ "$rc" -eq 10 ] || fail "idle lanes with a ready line not flagged (exit $rc):
$out"
  check_has "lane a alive (worker pid" "$out"
  check_has "lane c alive (node in" "$out"
  check_has "lane g alive (codex in" "$out"
  check_has "lane h alive (worker W-27 terminal term_open" "$out"
  check_has "lane j alive (node in $T/issue-j/apps" "$out"
  check_has "idle-lane: lane i has no live worker or process" "$out"
  check_has "lane b idle_since=" "$out"
  check_has "idle-lane: lane b has no live worker or process" "$out"
  check_has "idle-lane: lane d has no live worker or process" "$out"
  for l in e lead; do case "$out" in *"lane $l "*) fail "lane $l should be skipped:
$out" ;; esac; done
  LEAD_CHECK_WORKTREES="$WT" LEAD_CHECK_PROCS="$PR" lane_liveness "$T/main" 0 "$W/state-b" "$W/state-d" >"$T/out9" 2>&1; rc=$?
  [ "$rc" -eq 0 ] || fail "idle lanes flagged without a ready line (exit $rc):
$(cat "$T/out9")"
  check_has "lane d idle_since=" "$(cat "$T/out9")"

  # C3: a finished worker whose issue cwd still runs a node verify keeps the lane alive; an unreadable terminal list is
  # `unknown` (never idle, never exit 10).
  for l in k l; do mkdir -p "$W/state-$l"; done
  printf '{"name":"W-31","role":"impl","cwd":"%s/issue-k","terminal":"term_x","report":"%s/none.md","started_at":1}\n' "$T" "$T" >"$W/state-k/W-31.json"
  printf '{"name":"W-32","role":"impl","cwd":"%s/issue-l","report":"%s/W-32-REPORT.md","sentinel":"<!-- W-32-DONE -->","started_at":1}\n' "$T" "$W/state-l" >"$W/state-l/W-32.json"
  printf '## Summary\n<!-- W-32-DONE -->\n' >"$W/state-l/W-32-REPORT.md"
  touch -t 202601010000 "$W/state-k"/* "$W/state-k" "$W/state-l"/* "$W/state-l"
  WT2=$(printf '%s\n' "$T/wt/lane-k" "$T/wt/lane-l")
  PR2=$(printf 'codex\t%s/issue-k\tcodex --dangerously-bypass\nnode\t%s/issue-l/apps\tnode verify\n' "$T" "$T")
  LEAD_CHECK_TERMINALS='{"result":{"terminals":[]}}' LEAD_CHECK_WORKTREES="$WT2" LEAD_CHECK_PROCS="$PR2" \
    lane_liveness "$T/main" 1 "$W/state-l" >"$T/out10" 2>&1; rc=$?
  [ "$rc" -eq 0 ] || fail "finished worker with a verify in its cwd flagged (exit $rc):
$(cat "$T/out10")"
  check_has "lane l alive (node in $T/issue-l/apps" "$(cat "$T/out10")"
  LEAD_CHECK_TERMINALS='not-json' LEAD_CHECK_WORKTREES="$WT2" LEAD_CHECK_PROCS="$PR2" \
    lane_liveness "$T/main" 1 "$W/state-k" >"$T/out11" 2>&1; rc=$?
  [ "$rc" -eq 0 ] || fail "unreadable terminal list changed the exit code (exit $rc):
$(cat "$T/out11")"
  check_has "lane k unknown" "$(cat "$T/out11")"
  case "$(cat "$T/out11")" in *idle*) fail "unknown lane reported idle:
$(cat "$T/out11")" ;; *) pass=$((pass + 1)) ;; esac

  cleanup
  echo "lead-check.sh self-test passed: $pass assertion groups (duplicate write cwd, idle terminal, unowned listener, owned listener, clean pass, closed old TUI same cwd, two live TUIs, terminals unavailable, several state dirs, per-lane liveness: pid, process cwd, interactive session and open terminal do not count, no ready line = no finding, pid-less TUI worker with a listed terminal, verify in a worker worktree, verify after the worker report is done, unreadable terminal list = unknown)"
}

[ $# -le 1 ] || { echo "usage: lead-check.sh [--help|--self-test]" >&2; exit 64; }
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --self-test) self_test; exit $? ;;
esac

AP_MAIN=${AP_MAIN:-}
if [ -z "$AP_MAIN" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
if [ -n "${WAVE_STATE:-}" ] && [ ! -d "$WAVE_STATE" ]; then
  echo "lead-check: WAVE_STATE $WAVE_STATE is not a directory" >&2; exit 2
fi
STATE_DIRS=$(collect_state_dirs "$AP_MAIN")
[ -n "$STATE_DIRS" ] || { echo "lead-check: WAVE_STATE is not set and $AP_MAIN/.review/wave has no state-* dir" >&2; exit 2; }
export STATE_DIRS

rc=0

caps=$(bash "$SCRIPT_DIR/hosts-capacity.sh" 2>&1) || true
echo "$caps"
cap=$(printf '%s\n' "$caps" | head -1)
case "$cap" in *" start=no"*)
  echo "lead-check: capacity start=no — start no new worker or heavy step"
  rc=10 ;;
esac
printf '%s\n' "$caps" | grep -E '^host=[^ ]+ .* start=no' | sed -E 's/^host=([^ ]+) .*/lead-check: host \1 start=no — place new work on another host/'

la_out=$(bash "$SCRIPT_DIR/lock-audit.sh" 2>&1); la=$?
[ -n "$la_out" ] && printf '%s\n' "$la_out"
[ "$la" -eq 10 ] && rc=10

IFS=: read -r -a dirs <<<"$STATE_DIRS"
for d in "${dirs[@]}"; do
  echo "== wave state $d"
  python3 "$ENGINE/wave-status.py" --state-dir "$d" || true
done

# board.py reads every state dir at once (WAVE_STATE may be a ':'-joined list), so a line whose worker lives in
# another lane's dir is not reported as missing.
export WAVE_STATE=$STATE_DIRS
python3 "$SCRIPT_DIR/board.py" show || true
ready=$(python3 "$SCRIPT_DIR/board.py" ready 2>/dev/null)
[ -n "$ready" ] && printf '%s\n' "$ready"
ready_n=$(printf '%s\n' "$ready" | grep -c '^ready ')
python3 "$SCRIPT_DIR/board.py" check
[ $? -eq 10 ] && rc=10

lane_liveness "$AP_MAIN" "$ready_n" "${dirs[@]}"
[ $? -eq 10 ] && rc=10

LEAD_CHECK_PORT_LIST=$(reserved_ports) state_findings
[ $? -eq 10 ] && rc=10

exit $rc
