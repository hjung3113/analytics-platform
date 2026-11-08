#!/usr/bin/env bash
# One command for the lead's resume (LANES §Lead rotation, step 1) and the 2-hour periodic check (#1142).
# Prints the capacity line of every lane host (hosts-capacity.sh), the lock audit, the wave status and the board, then one line per finding:
#   duplicate-write     two or more running write workers (roles impl*, fix) share one cwd
#   unowned-listener    a listener on a reserved preview/E2E port that no running worker or preview owns
#   idle-terminal       a done/stopped worker's Orca terminal is still listed
#   Lane findings come from `orca worktree ps --json` (below): blocked-lane, idle-lane, monitoring-lane, gone-lane, host-unknown.
# Lanes (#1566): every host (this machine, then each environment in $AP_MAIN/.review/lanes/hosts.tsv) is asked for
#   `orca worktree ps --json [--environment <env>]`. A lane is any worktree named lane-<anything> (versioned names too), on
#   any host. The first output line is `lanes seen N/M (hosts read a/b)`, then the board's per-release progress, then one
#   line per lane (state, workingMode, minutes in state, liveTerminalCount, whether a child worktree works). Findings:
#   blocked-lane      state blocked or waiting (a dialog or question waits)
#   idle-lane         state done, no child worktree (parentWorktreeId) working, for more than LEAD_CHECK_IDLE_MIN (15) min;
#                     reported even when the board has no ready line
#   monitoring-lane   state working with workingMode monitoring and no terminal output for more than LEAD_CHECK_MONITOR_MIN (100) min
#   gone-lane         liveTerminalCount is 0
#   host-unknown      a host's ps failed: its lanes were not checked (never printed as «ok»)
#   A state-<lane> dir without a lane-<lane>* worktree on a readable host prints `lane <name> not-seen`.
# --lanes-only prints only this lane section (exit 10 on a finding). --nudge is --lanes-only plus sending, for cron:
#   an idle-lane finding sends one fixed text to the lane's terminal per idle interval (keyed by stateStartedAt) and is
#   skipped while a draft is on the lane screen; every other finding wakes the lead once with `orca orchestration send`
#   (Run from LEAD_RUN or $AP_MAIN/.review/lanes/lead.md; --from only when ORCA_TERMINAL_HANDLE is set). Sent keys live in
#   $AP_MAIN/.review/lanes/nudge-state.json and clear when the finding clears.
# State dirs: WAVE_STATE plus every $AP_MAIN/.review/wave/state-*; board.py check and the findings above read all of them.
# Worker status matches board.py (#1149 Q2): a pid-less TUI worker whose Orca terminal is no longer
#   listed is closed; when the terminal list is unavailable it stays running. The list is queried once.
# Reserved ports: the LANES §Lanes E2E ports and their +1 base-path ports, the conductor.json
#   app_preview range, and 5173. Keep the LANES port list in sync when a lane is added.
# Exit 10 when any finding, or when capacity says start=no, lock-audit.sh exits 10, or board.py check exits 10.
# Env: WAVE_STATE (worker state dir; required unless lane state dirs exist), AP_MAIN/BOARD (board location, see board.py),
#   ENGINE (wave-status dir, default ~/.agents/skills/issue-wave-conductor/scripts),
#   LEAD_CHECK_IDLE_MIN (idle threshold in minutes, default 15),
#   LEAD_CHECK_PORT_LIST (reserved-port list override; self-test only),
#   LEAD_CHECK_TERMINALS (fixture `orca terminal list --json` output; self-test only),
#   LEAD_CHECK_MONITOR_MIN (monitoring threshold in minutes, default 100), LEAD_RUN (lead Run id for --nudge),
#   LEAD_CHECK_PS (fixture JSON {"<host>": <worktree ps json>|null}; self-test only),
#   LEAD_CHECK_ORCA (the orca command --nudge and the ps calls use; self-test stub only), LEAD_CHECK_NOW (epoch seconds; self-test only).
# usage: lead-check.sh [--help|--self-test|--lanes-only|--nudge]
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

# Per-lane liveness from Orca (#1566). args: <ap_main> <state-dir>... Asks every lane host for `orca worktree ps --json`
# (this machine, then each environment in hosts.tsv; LEAD_CHECK_PS replaces the calls in the self-test), prints
# `lanes seen N/M`, the per-release progress, one `lane …` line per lane, then findings; exit 10 on any finding.
# LEAD_CHECK_NUDGE=1 also sends (see --nudge in the header). A lane is any worktree named lane-<anything>.
lane_liveness() {
  python3 - "$@" <<'PYEOF'
import hashlib, json, os, re, subprocess, sys, time
from datetime import datetime
from pathlib import Path

main = Path(sys.argv[1])
state_dirs = [Path(d) for d in sys.argv[2:]]
idle_limit = int(os.environ.get('LEAD_CHECK_IDLE_MIN', '15'))
mon_limit = int(os.environ.get('LEAD_CHECK_MONITOR_MIN', '100'))
nudge = os.environ.get('LEAD_CHECK_NUDGE') == '1'
orca = os.environ.get('LEAD_CHECK_ORCA', 'orca')
now = float(os.environ.get('LEAD_CHECK_NOW') or time.time())
script_dir = os.environ.get('LEAD_CHECK_SCRIPT_DIR', '')
LANE_RE = re.compile(r'^lane-[A-Za-z0-9][A-Za-z0-9._-]*$')
IDLE_TEXT = '[팀장] 레인이 멈춰 있습니다. 다음 작업을 시작하거나 «대기 #n <blocker|none>»을 보내세요.'

def epoch(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v / 1000 if v > 1e11 else float(v)
    if isinstance(v, str):
        if v.strip().isdigit():
            return epoch(int(v))
        try:
            return datetime.fromisoformat(v.replace('Z', '+00:00')).timestamp()
        except ValueError:
            return None
    return None

fixture = os.environ.get('LEAD_CHECK_PS')  # {"<host>": <ps json> | null}; null = host unreachable
fx = json.loads(fixture) if fixture is not None else None

def host_names():
    if fx is not None:
        return list(fx)
    names = ['local']
    hosts_file = main / '.review' / 'lanes' / 'hosts.tsv'
    if hosts_file.is_file():
        for l in hosts_file.read_text().splitlines():
            env = l.split('\t')[0].strip()
            if env and not env.startswith('#'):
                names.append(env)
    return names

def env_args(host):
    return [] if host == 'local' else ['--environment', host]

def run_orca(host, *args, timeout=30):
    r = subprocess.run([orca, *args, *env_args(host)], capture_output=True, text=True, timeout=timeout)
    return r.stdout if r.returncode == 0 else None

def entries(data):
    r = data.get('result', data) if isinstance(data, dict) else data
    if isinstance(r, dict):
        r = next((r[k] for k in ('worktrees', 'items') if isinstance(r.get(k), list)), [])
    return [e for e in r if isinstance(e, dict)] if isinstance(r, list) else []

def lift(e):
    """Orca reports a lane's state on the worktree's agents, not on the row: lift the main agent's state, workingMode and
    stateStartedAt onto the row unless the row has them (the newest agent without a parent pane is the lane's own)."""
    if isinstance(e.get('agents'), list):
        own = [a for a in e['agents'] if isinstance(a, dict) and not a.get('parentPaneKey')]
        if own:
            a = max(own, key=lambda x: x.get('updatedAt') or 0)
            e = dict(e, _pane=a.get('paneKey'))
            if e.get('state') is None:
                e = dict(e, state=a.get('state'), workingMode=a.get('workingMode'), stateStartedAt=a.get('stateStartedAt'))
    return e

def ps(host):
    """Worktree entries of one host, or None when it cannot be read."""
    try:
        if fx is not None:
            return None if fx[host] is None else [lift(e) for e in entries(fx[host])]
        out = run_orca(host, 'worktree', 'ps', '--json')
        return None if out is None else [lift(e) for e in entries(json.loads(out))]
    except (OSError, subprocess.SubprocessError, ValueError):
        return None

def wt_id(e):
    return e.get('id') or e.get('worktreeId')

def wt_name(e):
    for k in ('displayName', 'name', 'branch'):
        v = e.get(k)
        if isinstance(v, str) and LANE_RE.match(v.split('/')[-1]):
            return v.split('/')[-1]
    p = e.get('path')
    return os.path.basename(p.rstrip('/')) if isinstance(p, str) and LANE_RE.match(os.path.basename(p.rstrip('/'))) else None

lane_names = []  # lane names from state dirs (state-lead excluded)
state_days = int(os.environ.get('LEAD_CHECK_STATE_DAYS', '1'))  # older state dirs are finished lanes, not missing ones
for d in sorted(state_dirs):
    if d.name.startswith('state-') and d.name != 'state-lead' and time.time() - d.stat().st_mtime < state_days * 86400:
        lane_names.append(d.name[len('state-'):])

hosts = host_names()
seen, findings, lines, unknown_hosts = [], [], [], []  # seen: (host, entry, name, children-working)
for h in hosts:
    wts = ps(h)
    if wts is None:
        unknown_hosts.append(h)
        findings.append((f'host-unknown:{h}', f'host-unknown: host {h} — orca worktree ps unavailable; its lanes are not checked',
                         None, None, h))
        continue
    working_parents = {e.get('parentWorktreeId') for e in wts if e.get('state') == 'working' and e.get('parentWorktreeId')}
    for e in wts:
        name = wt_name(e)
        if name:
            seen.append((h, e, name, wt_id(e) in working_parents))

def lane_of_state(n):
    return next((s for s in seen if s[2] == f'lane-{n}' or s[2].startswith(f'lane-{n}-')), None)

matched = {id(lane_of_state(n)) for n in lane_names if lane_of_state(n)}
not_seen = [n for n in lane_names if not lane_of_state(n)]
total = len(lane_names) + sum(1 for s in seen if id(s) not in matched)
print(f'lanes seen {len(seen)}/{total} (hosts read {len(hosts) - len(unknown_hosts)}/{len(hosts)})')

if script_dir:  # per-release progress from the board
    try:
        r = subprocess.run([sys.executable, os.path.join(script_dir, 'board.py'), 'ready'], capture_output=True, text=True,
                           timeout=20, env={**os.environ, 'AP_MAIN': str(main)})
        for l in r.stdout.splitlines():
            if l.startswith('release '):
                print(l)
    except (OSError, subprocess.SubprocessError):
        pass

for h, e, name, child_working in seen:
    state, mode, live = e.get('state'), e.get('workingMode'), e.get('liveTerminalCount')
    started = epoch(e.get('stateStartedAt'))
    age = int((now - started) / 60) if started is not None else None
    sk = e.get('stateStartedAt')
    output = epoch(e.get('lastOutputAt'))  # stateStartedAt stays at the session resume while the lane keeps working
    quiet = int((now - output) / 60) if output is not None else age
    print(f'{name} host={h} state={state} mode={mode or "-"} for={age if age is not None else "?"}min live={live} children_working={int(child_working)}')
    if isinstance(live, int) and live == 0:
        findings.append((f'gone:{name}:{sk}', f'gone-lane: {name} on {h} has no live terminal (liveTerminalCount=0)', e, h, h))
    elif state in ('blocked', 'waiting'):
        findings.append((f'{state}:{name}:{sk}', f'blocked-lane: {name} on {h} is {state} for {age if age is not None else "?"} min — a dialog or question waits', e, h, h))
    elif state == 'done' and not child_working and age is not None and age > idle_limit:
        findings.append((f'idle:{name}:{sk}', f'idle-lane: {name} on {h} finished {age} min ago and no child worktree is working — assign work or send 대기', e, h, h))
    elif state == 'working' and mode == 'monitoring' and quiet is not None and quiet > mon_limit:
        findings.append((f'monitoring:{name}:{sk}', f'monitoring-lane: {name} on {h} has been monitoring with no terminal output for {quiet} min (limit {mon_limit}) — check that it can still wake', e, h, h))
for n in not_seen:
    print(f'lane {n} not-seen (no lane-{n}* worktree on a readable host)')

for key, text, *_ in findings:
    print(f'lead-check: {text}')

def screen_draft(host, handle):
    """True when the composer holds typed text, False when it is empty, None when the screen cannot be read.
    Reads the rendered screen (`--screen --json`), not the accumulated output: old submitted input stays in the latter."""
    out = run_orca(host, 'terminal', 'read', '--terminal', handle, '--screen', '--json')
    if not out:
        return None
    try:
        r = json.loads(out)
    except ValueError:
        return None
    r = r.get('result', r) if isinstance(r, dict) else None
    for k in ('read', 'terminal'):  # real shape: result.terminal.tail is a list of rendered lines
        if isinstance(r, dict) and isinstance(r.get(k), dict):
            r = r[k]
    if not isinstance(r, dict):
        return None
    if isinstance(r.get('draft'), str):
        return bool(r['draft'].strip())
    text = next((r[k] for k in ('screen', 'tail', 'text', 'content') if isinstance(r.get(k), str)), None)
    for k in ('tail', 'lines'):
        if text is None and isinstance(r.get(k), list):
            text = '\n'.join(str(x) for x in r[k])
    if text is None:
        return None
    last = next((l for l in reversed(text.splitlines()) if re.match(r'^\s*[❯>›]', l)), None)
    return bool(last and re.match(r'^\s*[❯>›]\s*\S', last))

def lane_handle(host, e):
    """The terminal of the lane's own agent: terminal-list tabId:leafId joined to the agent's paneKey."""
    pane = e.get('_pane')
    if not pane:
        return None
    out = run_orca(host, 'terminal', 'list', '--json')
    if not out:
        return None
    r = json.loads(out)
    for t in (r.get('result', r) or {}).get('terminals', []):
        if f"{t.get('tabId')}:{t.get('leafId')}" == pane and t.get('handle'):
            return t['handle']
    return None

def nudge_all():
    path = main / '.review' / 'lanes' / 'nudge-state.json'
    try:
        sent = json.loads(path.read_text())
    except (OSError, ValueError):
        sent = {}
    # A finding that cleared may fire again later, but an unreadable host says nothing about its lanes: keep their keys.
    keys = {k for k, *_ in findings}
    sent = {k: v for k, v in sent.items() if k in keys or (isinstance(v, dict) and v.get('host') in unknown_hosts)}
    run = os.environ.get('LEAD_RUN') or ''
    if not run:
        lead = main / '.review' / 'lanes' / 'lead.md'
        m = re.search(r'run_[0-9a-f]+', lead.read_text()) if lead.is_file() else None
        run = m.group(0) if m else ''
    for key, text, e, host, _h in findings:
        if key in sent:
            continue
        if key.startswith('idle:') and e is not None:
            handle = lane_handle(host, e)
            if handle:
                draft = screen_draft(host, handle)
                if draft is None:
                    print(f'lead-check: nudge skipped for {key}: the lane screen is unreadable')
                    continue
                if draft:
                    print(f'lead-check: nudge skipped for {key}: a draft is on the lane screen')
                    continue
                if run_orca(host, 'terminal', 'send', '--terminal', handle, '--text', IDLE_TEXT, '--enter') is not None:
                    sent[key] = {'at': int(now), 'host': host}
                    print(f'lead-check: nudged {key}')
                continue
        if not run:
            print(f'lead-check: nudge for {key} not sent: lead run id unknown (set LEAD_RUN)')
            continue
        args = ['orchestration', 'send', '--run', run, '--to', f'run:{run}', '--type', 'status',
                '--subject', f'lead-check: {key.split(":")[0]}', '--body', text]
        if os.environ.get('ORCA_TERMINAL_HANDLE'):
            args += ['--from', os.environ['ORCA_TERMINAL_HANDLE']]
        if run_orca('local', *args) is not None:
            sent[key] = {'at': int(now), 'host': host}
            print(f'lead-check: lead woken for {key}')
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(sent, indent=1) + '\n')
    os.replace(tmp, path)

if nudge:
    try:
        nudge_all()
    except (OSError, subprocess.SubprocessError, ValueError) as ex:
        print(f'lead-check: nudge failed: {ex}')
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

  # #1566: lane state dirs are collected (state-lead included here, skipped by the liveness check).
  W="$T/main/.review/wave"; rm -rf "$T/main"; mkdir -p "$W" "$T/main/.review/lanes"
  for l in alpha beta gamma ghost lead; do mkdir -p "$W/state-$l"; done
  printf '{"name":"W-21","role":"impl","cwd":"%s","report":"%s","started_at":1}\n' "$T/wt1" "$T/none.md" >"$W/state-alpha/W-21.json"
  printf '[{"name":"ci","bucket":"pass"}]\n' >"$W/state-alpha/ci-snapshot.json"  # CI snapshots are JSON lists, not worker states
  dirs=$(collect_state_dirs "$T/main")
  [ "$(printf '%s' "$dirs" | tr ':' '\n' | grep -c .)" -eq 5 ] || fail "collect_state_dirs: $dirs"
  [ "$(WAVE_STATE="$W/state-alpha" collect_state_dirs "$T/main" | tr ':' '\n' | grep -c .)" -eq 5 ] \
    || fail "collect_state_dirs does not dedupe WAVE_STATE"
  pass=$((pass + 1))

  # #1566: per-lane liveness from `orca worktree ps --json` (LEAD_CHECK_PS: host -> output, null = unreachable).
  # local: alpha (versioned name, done 30 min, no working child -> idle), beta (blocked), gamma (done 30 min but a child
  # works -> clean), delta (monitoring 120 min), eps (monitoring 300 min with output 2 min ago -> clean), zeta (no live terminal -> gone), a
  # non-lane worktree. desktop (remote): remote (done 40 min -> idle). broken: unreachable -> host-unknown.
  # ghost has a state dir but no worktree. The board has no planned line (ready=0): idle is still reported.
  NOW=1800000000
  mkps() { # <alpha minutes in state> -> $T/ps.json
    python3 - "$NOW" "$1" >"$T/ps.json" <<'PYX'
import json, sys
now, am = int(sys.argv[1]), int(sys.argv[2])
ms = lambda m: (now - m * 60) * 1000
def wt(i, name, state, m, mode=None, live=1, parent=None):
    r = {'id': i, 'displayName': name, 'path': '/w/' + name, 'state': state, 'workingMode': mode,
         'stateStartedAt': ms(m), 'parentWorktreeId': parent, 'liveTerminalCount': live}
    if i in ('wA', 'wR'):  # the lane's own agent pane, joined to terminal-list tabId:leafId
        r['agents'] = [{'paneKey': 'tab' + i + ':leaf' + i, 'parentPaneKey': None, 'state': state, 'updatedAt': 1}]
    return r
local = {'result': {'worktrees': [
    wt('wA', 'lane-alpha-v030', 'done', am), wt('wB', 'lane-beta', 'blocked', 5),
    wt('wC', 'lane-gamma', 'done', 30), wt('wC1', '1566-child', 'working', 3, parent='wC'),
    wt('wD', 'lane-delta', 'working', 120, 'monitoring'), dict(wt('wE', 'lane-eps', 'working', 300, 'monitoring'), lastOutputAt=ms(2)),
    wt('wZ', 'lane-zeta', 'working', 4, live=0), wt('wN', '1566-plain', 'done', 90)]}}
# Real Orca rows carry the state on agents[]; lane-eps uses that shape (a sub-agent pane is ignored)
for r in local['result']['worktrees']:
    if r['id'] == 'wE':
        st, wm, ss = r.pop('state'), r.pop('workingMode'), r.pop('stateStartedAt')
        r['agents'] = [{'parentPaneKey': None, 'state': st, 'workingMode': wm, 'stateStartedAt': ss, 'updatedAt': 2},
                       {'parentPaneKey': 'p', 'state': 'done', 'stateStartedAt': ss, 'updatedAt': 3}]
desktop = {'result': {'worktrees': [wt('wR', 'lane-remote', 'done', 40)]}}
print(json.dumps({'local': local, 'desktop': desktop, 'broken': None}))
PYX
  }
  mkps 30
  printf '{"release":"v1","goal":"","merge_grant":"","decisions":[],"lines":[{"id":1,"issue":1,"title":"a","state":"done","release":"v1","updated":"2026-11-08T00:00:00+00:00"},{"id":2,"issue":2,"title":"b","state":"running","release":"v1","updated":"2026-11-08T00:00:00+00:00"}]}\n' \
    >"$T/main/.review/lanes/board.json"
  # shellcheck disable=SC2086
  mkdir -p "$W/state-oldlane"; touch -t 202001010000 "$W/state-oldlane"  # a finished lane's old dir is not a missing lane
  dirs="$dirs:$W/state-oldlane"
  (unset BOARD; LEAD_CHECK_NOW=$NOW LEAD_CHECK_PS="$(cat "$T/ps.json")" LEAD_CHECK_SCRIPT_DIR="$SCRIPT_DIR" \
    lane_liveness "$T/main" $(printf '%s' "$dirs" | tr ':' ' ')) >"$T/out8" 2>&1; rc=$?
  out=$(cat "$T/out8")
  [ "$rc" -eq 10 ] || fail "lane findings (ready=0) not flagged (exit $rc):
$out"
  [ "$(head -1 "$T/out8")" = "lanes seen 7/8 (hosts read 2/3)" ] || fail "first line is not the lanes-seen line:
$out"
  check_has "release v1: " "$out"
  check_has "idle-lane: lane-alpha-v030 on local finished 30 min ago" "$out"
  check_has "idle-lane: lane-remote on desktop finished 40 min ago" "$out"
  check_has "blocked-lane: lane-beta on local is blocked" "$out"
  check_has "monitoring-lane: lane-delta on local has been monitoring with no terminal output for 120 min" "$out"
  check_has "gone-lane: lane-zeta on local has no live terminal" "$out"
  check_has "host-unknown: host broken" "$out"
  check_has "lane ghost not-seen" "$out"
  case "$out" in *"lane oldlane not-seen"*) fail "an old state dir was reported as a missing lane" ;; esac
  for l in gamma eps; do case "$out" in *"lead-check: "*"lane-$l "*) fail "lane $l should be clean:
$out" ;; esac; done
  pass=$((pass + 1))

  # #1566: --nudge sends the idle text once per idle interval and wakes the lead once per other finding; a draft on the
  # lane screen skips the nudge; a new idle interval sends again. The stub records every orca call.
  cat >"$T/stub-orca" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$STUB_LOG"
case "$1 $2" in
  "terminal list") echo '{"result":{"terminals":[{"handle":"h_shell","worktreeId":"wA","tabId":"tabX","leafId":"leafX"},{"handle":"h_alpha","worktreeId":"wA","tabId":"tabwA","leafId":"leafwA"},{"handle":"h_remote","worktreeId":"wR","tabId":"tabwR","leafId":"leafwR"}]}}' ;;
  "terminal read")
    case "$*" in *--screen*--json*) ;; *) echo "read without --screen --json" >&2; exit 1 ;; esac
    case "$*" in
      *h_remote*) echo '{"result":{"terminal":{"handle":"h_remote","status":"running","tail":["work","❯ half typed draft"]}}}' ;;
      *) [ -f "$STUB_UNREADABLE" ] && exit 1
         # old submitted input above, empty composer now
         echo '{"result":{"terminal":{"handle":"h_alpha","status":"running","tail":["❯ earlier submitted text","work","❯ "]}}}' ;;
    esac ;;
esac
exit 0
STUB
  chmod +x "$T/stub-orca"; : >"$T/orca.log"
  nudge() { (unset BOARD; export LEAD_CHECK_NOW=$NOW LEAD_CHECK_PS="$(cat "$T/ps.json")" LEAD_CHECK_ORCA="$T/stub-orca" STUB_LOG="$T/orca.log" STUB_UNREADABLE="$T/unreadable" \
      LEAD_RUN=run_abc LEAD_CHECK_NUDGE=1; lane_liveness "$T/main" $(printf '%s' "$dirs" | tr ':' ' ')) >"$T/out12" 2>&1; }
  nudge
  [ "$(grep -c '^terminal send' "$T/orca.log")" -eq 1 ] || fail "first run: expected one lane nudge:
$(cat "$T/orca.log")"
  grep -q '^terminal send --terminal h_alpha' "$T/orca.log" || fail "nudge did not go to the idle lane:
$(cat "$T/orca.log")"
  [ "$(grep -c '^orchestration send' "$T/orca.log")" -eq 4 ] || fail "first run: expected 4 lead wakes (blocked, monitoring, gone, host-unknown):
$(cat "$T/orca.log")"
  check_has "nudge skipped for idle:lane-remote" "$(cat "$T/out12")"
  nudge
  [ "$(grep -c '^terminal send' "$T/orca.log")" -eq 1 ] && [ "$(grep -c '^orchestration send' "$T/orca.log")" -eq 4 ] \
    || fail "second run sent a duplicate:
$(cat "$T/orca.log")"
  python3 - "$T/ps.json" "$NOW" <<'PYX'
import json, sys
d = json.load(open(sys.argv[1])); now = int(sys.argv[2])
d['local']['result']['worktrees'][0]['stateStartedAt'] = (now - 50 * 60) * 1000  # idle again, a new interval
json.dump(d, open(sys.argv[1], 'w'))
PYX
  : >"$T/unreadable"  # read failure: skip, do not treat as an empty composer
  nudge
  [ "$(grep -c '^terminal send' "$T/orca.log")" -eq 1 ] || fail "unreadable screen was nudged:
$(cat "$T/orca.log")"
  check_has "lane screen is unreadable" "$(cat "$T/out12")"
  rm -f "$T/unreadable"
  nudge
  [ "$(grep -c '^terminal send' "$T/orca.log")" -eq 2 ] || fail "new idle interval was not nudged:
$(cat "$T/orca.log")"
  grep -q '^terminal send --terminal h_shell' "$T/orca.log" && fail "nudge went to an unrelated terminal"
  # reachable -> unreachable -> reachable with the same idle interval: no second nudge
  python3 - "$T/ps.json" <<'PYX'
import json, sys
d = json.load(open(sys.argv[1])); d['local'] = None
json.dump(d, open(sys.argv[1] + '.down', 'w'))
PYX
  cp "$T/ps.json" "$T/ps.up"; cp "$T/ps.json.down" "$T/ps.json"
  nudge
  cp "$T/ps.up" "$T/ps.json"
  nudge
  [ "$(grep -c '^terminal send' "$T/orca.log")" -eq 2 ] || fail "host outage reset the nudge history:
$(cat "$T/orca.log")"
  pass=$((pass + 1))

  # --lanes-only with no local state-* dir still reads Orca (remote-only lead)
  mkdir -p "$T/bare/.review/lanes"
  out=$(AP_MAIN="$T/bare" WAVE_STATE= LEAD_CHECK_NOW=$NOW LEAD_CHECK_PS="$(cat "$T/ps.json")" bash "$SCRIPT_DIR/lead-check.sh" --lanes-only 2>&1); rc=$?
  [ "$rc" -eq 10 ] || fail "--lanes-only without state dirs exited $rc:
$out"
  check_has "idle-lane: lane-remote on desktop" "$out"
  pass=$((pass + 1))

  cleanup
  echo "lead-check.sh self-test passed: $pass assertion groups (duplicate write cwd, idle terminal, unowned listener, owned listener, clean pass, closed old TUI same cwd, two live TUIs, terminals unavailable, several state dirs, lane liveness from orca worktree ps: versioned lane name, remote host, unreachable host, ready=0, blocked, idle with and without a working child, long monitoring, gone, not-seen; --nudge: one send per idle interval, no duplicate lead wake, draft skipped)"
}

lanes_only=0
for a in "$@"; do
  case "$a" in
    --help|-h) usage; exit 0 ;;
    --self-test) [ $# -eq 1 ] || { echo "usage: lead-check.sh [--help|--self-test|--lanes-only|--nudge]" >&2; exit 64; }; self_test; exit $? ;;
    --lanes-only) lanes_only=1 ;;
    --nudge) lanes_only=1; export LEAD_CHECK_NUDGE=1 ;;
    *) echo "usage: lead-check.sh [--help|--self-test|--lanes-only|--nudge]" >&2; exit 64 ;;
  esac
done

AP_MAIN=${AP_MAIN:-}
if [ -z "$AP_MAIN" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
if [ -n "${WAVE_STATE:-}" ] && [ ! -d "$WAVE_STATE" ]; then
  echo "lead-check: WAVE_STATE $WAVE_STATE is not a directory" >&2; exit 2
fi
STATE_DIRS=$(collect_state_dirs "$AP_MAIN")
# Only the full worker audit needs worker state; --lanes-only/--nudge read Orca alone (a lead that supervises only remote
# lanes keeps no local state-* dir).
[ -n "$STATE_DIRS" ] || [ "$lanes_only" = 1 ] || { echo "lead-check: WAVE_STATE is not set and $AP_MAIN/.review/wave has no state-* dir" >&2; exit 2; }
export STATE_DIRS

rc=0
export LEAD_CHECK_SCRIPT_DIR=$SCRIPT_DIR
dirs=()
[ -z "$STATE_DIRS" ] || IFS=: read -r -a dirs <<<"$STATE_DIRS"

# Lane liveness first: its `lanes seen N/M` line opens the output, and --lanes-only/--nudge (cron) stop here.
lane_liveness "$AP_MAIN" ${dirs[@]+"${dirs[@]}"}
lrc=$?
[ "$lanes_only" = 1 ] && exit $lrc
[ "$lrc" -eq 10 ] && rc=10

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

for d in "${dirs[@]}"; do
  echo "== wave state $d"
  python3 "$ENGINE/wave-status.py" --state-dir "$d" || true
done

# board.py reads every state dir at once (WAVE_STATE may be a ':'-joined list), so a line whose worker lives in
# another lane's dir is not reported as missing.
export WAVE_STATE=$STATE_DIRS
python3 "$SCRIPT_DIR/board.py" show || true
ready=$(python3 "$SCRIPT_DIR/board.py" ready 2>/dev/null)
printf '%s\n' "$ready" | grep -v '^release '  # the per-release lines are in the lane section
python3 "$SCRIPT_DIR/board.py" check
[ $? -eq 10 ] && rc=10

LEAD_CHECK_PORT_LIST=$(reserved_ports) state_findings
[ $? -eq 10 ] && rc=10

exit $rc
