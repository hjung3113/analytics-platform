#!/usr/bin/env python3
"""Local lane board (#1142): the lead's goal/line state as one JSON file.

Replaces hand-edited LEAD.md tables (LEAD.md keeps only free-form notes). The board lives at
$AP_MAIN/.review/lanes/board.json (gitignored location); the lead seeds it — nothing migrates
automatically. Schema, documented here and in LANES.md §Lead:

    { "release": str, "goal": str, "merge_grant": str,
      "decisions": [ {"text": str, "by": str, "date": str} ],
      "lines": [ {"id": int, "issue": int|str, "title": str,
                  "state": "planned|running|review|blocked|done|dropped",
                  "worker": str|null,      # worker state JSON name in $WAVE_STATE, e.g. "W-1142"
                  "worktree": str, "pr": int|str|null, "next": str, "updated": ISO-8601 str } ] }

Commands: init | add <issue> <title> [key=value...] | set <id|board> key=value... | show | check.
`set` refreshes the line's `updated`; `worker=null` / `pr=null` clears a field. Atomic writes
(temp file + rename in the same directory).

`check` prints one line per finding and exits 10 when: a line is running/review but its worker's
state JSON in $WAVE_STATE is done/stopped/closed/missing (a dead pid counts as stopped); a running
worker in $WAVE_STATE is on no board line; two running lines with write roles (impl*, fix) share a
worktree; a line still in planned/running/review/blocked was not updated for 4 h. A missing board
or missing WAVE_STATE is a note, not a finding.

Env: AP_MAIN (default: the git common dir of the checkout holding this script), BOARD (board path
override), WAVE_STATE (worker state dir; checked only for `check`). --self-test runs fixtures in a
temp folder and needs neither.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

STATES = ('planned', 'running', 'review', 'blocked', 'done', 'dropped')
LINE_KEYS = ('issue', 'title', 'state', 'worker', 'worktree', 'pr', 'next')
BOARD_KEYS = ('release', 'goal', 'merge_grant', 'decisions')
STALE_H = 4


def die(msg, code=2):
    print(f'board: {msg}', file=sys.stderr)
    sys.exit(code)


def default_board_path():
    explicit = os.environ.get('BOARD')
    if explicit:
        return Path(explicit)
    main = os.environ.get('AP_MAIN')
    if not main:
        try:
            common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                                    capture_output=True, text=True, timeout=10)
            if common.returncode == 0 and common.stdout.strip():
                main = str(Path(common.stdout.strip()).parent)
        except (OSError, subprocess.TimeoutExpired):
            pass
    if main:
        return Path(main) / '.review' / 'lanes' / 'board.json'
    die('no board path: set BOARD or AP_MAIN, or run inside the repository', 2)


def load(path):
    try:
        board = json.loads(path.read_text())
    except ValueError as e:
        die(f'{path} is not valid JSON: {e}')
    if not isinstance(board.get('lines'), list):
        die(f'{path}: "lines" must be a list — re-init the board')
    return board


def save(path, board):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f'.{path.name}.tmp')
    tmp.write_text(json.dumps(board, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def now_iso():
    return datetime.now().astimezone().isoformat(timespec='seconds')


def parse_value(key, raw):
    if raw == 'null':
        return None
    if key == 'decisions':
        try:
            value = json.loads(raw)
        except ValueError:
            die('decisions= must be a JSON array of {text, by, date}')
        if not isinstance(value, list):
            die('decisions= must be a JSON array')
        return value
    if key in ('issue', 'pr') and raw.isdigit():
        return int(raw)
    return raw


def apply_kv(obj, kv, allowed):
    for pair in kv:
        if '=' not in pair:
            die(f'expected key=value, got "{pair}"')
        key, raw = pair.split('=', 1)
        if key not in allowed:
            die(f'unknown key "{key}" (allowed: {", ".join(allowed)})')
        if key == 'state':
            if raw not in STATES:
                die(f'state must be one of {", ".join(STATES)}, got "{raw}"')
        obj[key] = parse_value(key, raw)


def cmd_init(path):
    if path.exists():
        die(f'{path} already exists — edit it with set/add, not init')
    save(path, {'release': '', 'goal': '', 'merge_grant': '', 'decisions': [], 'lines': []})
    print(f'board: initialised {path}')


def cmd_add(path, args):
    board = load(path)
    if len(args) < 2:
        die('usage: board.py add <issue> <title> [key=value...]')
    line = {'id': max((l.get('id', 0) for l in board['lines']), default=0) + 1,
            'issue': parse_value('issue', args[0]), 'title': args[1],
            'state': 'planned', 'worker': None, 'worktree': '', 'pr': None, 'next': '',
            'updated': now_iso()}
    apply_kv(line, args[2:], LINE_KEYS)
    board['lines'].append(line)
    save(path, board)
    print(f'board: added line {line["id"]} #{line["issue"]} {line["title"]}')


def cmd_set(path, args):
    board = load(path)
    if not args:
        die('usage: board.py set <id|board> key=value...')
    target = args[0]
    if target == 'board':
        apply_kv(board, args[1:], BOARD_KEYS)
        save(path, board)
        print('board: board fields updated')
        return
    if not target.isdigit():
        die(f'unknown target "{target}" — a line id or "board"')
    line = next((l for l in board['lines'] if l.get('id') == int(target)), None)
    if line is None:
        die(f'no line {target}')
    apply_kv(line, args[1:], LINE_KEYS)
    line['updated'] = now_iso()
    save(path, board)
    print(f'board: line {target} updated')


def cmd_show(path):
    if not path.exists():
        print(f'board: no board at {path} — run "board.py init" and seed it')
        return 1
    board = load(path)
    print(f'release {board.get("release") or "-"} · goal {board.get("goal") or "-"} · '
          f'merge grant {board.get("merge_grant") or "-"}')
    for d in board.get('decisions', []):
        print(f'  decision [{d.get("date", "-")}] {d.get("by", "-")}: {d.get("text", "-")}')
    if not board['lines']:
        print('lines: none')
        return 0
    print(f'{"id":>3} {"issue":>6} {"state":<8} {"worker":<14} {"pr":>5}  {"worktree":<22} {"upd":<16} next')
    for l in board['lines']:
        upd = str(l.get('updated', '-'))[:16]
        print(f'{l.get("id", "-"):>3} {str(l.get("issue", "-")):>6} {l.get("state", "-"):<8} '
              f'{str(l.get("worker") or "-"):<14} {str(l.get("pr") or "-"):>5}  '
              f'{str(l.get("worktree") or "-"):<22} {upd:<16} {l.get("next") or "-"}')
    return 0


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False


def worker_status(state, path):  # same rule as wave-status.py: done | closed | running | stopped
    started = state.get('started_at') or int(path.stat().st_mtime)
    report, sentinel = Path(state.get('report', '')), state.get('sentinel')
    if sentinel and report.is_file() and report.stat().st_mtime >= started:
        lines = [l for l in report.read_text(errors='replace').splitlines() if l.strip()]
        if lines and lines[-1] == sentinel:
            return 'done'
    if not Path(state.get('cwd', '/nonexistent')).is_dir():
        return 'closed'
    if state.get('pid'):
        return 'running' if alive(state['pid']) else 'stopped'
    terminals = orca_terminals()
    if state.get('terminal') and terminals is not None and state['terminal'] not in terminals:
        return 'closed'  # a TUI worker has no pid; its closed terminal means it ended
    return 'running'


_TERMINALS = []
def orca_terminals():
    """Handles of live Orca terminals, or None when orca is unavailable (then TUI workers stay `running`)."""
    if _TERMINALS:
        return _TERMINALS[0]
    try:
        out = subprocess.run(['orca', 'terminal', 'list', '--json'], capture_output=True, text=True, timeout=20).stdout
        result = None if not out.strip() else set(__import__('re').findall(r'term_[0-9a-f-]{36}', out))
    except (OSError, subprocess.SubprocessError):
        result = None
    if os.environ.get('BOARD_NO_ORCA'):
        result = None
    _TERMINALS.append(result)
    return result


def read_workers():
    state_dir = os.environ.get('WAVE_STATE')
    if not state_dir:
        return None, 'WAVE_STATE is not set'
    root = Path(state_dir)
    if not root.is_dir():
        return None, f'WAVE_STATE {state_dir} is not a directory'
    workers = {}
    for path in sorted(root.glob('*.json')):
        if path.name.startswith('preview-'):
            continue
        try:
            workers[path.stem] = (json.loads(path.read_text()), path)
        except (ValueError, OSError):
            continue
    return workers, None


def write_role(role):
    return role is not None and (role.startswith('impl') or role == 'fix')


def cmd_check(path):
    findings = []
    if not path.exists():
        print(f'board check: no board at {path} (run init and seed it) — nothing to check')
        return 0
    board = load(path)
    workers, note = read_workers()
    if workers is None:
        print(f'board check: worker states skipped ({note})')
        workers = {}
    running_workers = {}
    for name, (state, spath) in workers.items():
        status = worker_status(state, spath)
        if status == 'running':
            running_workers[name] = state
    for l in board['lines']:
        lid, state = l.get('id'), l.get('state')
        if state in ('running', 'review'):
            name = l.get('worker')
            if not name:
                if state == 'running':  # a `review` line may sit on a lead step (checks, CI, merge) with no worker
                    findings.append(f'line {lid} (#{l.get("issue")}) is {state} but has no worker')
            elif name not in workers:
                findings.append(f'line {lid} (#{l.get("issue")}) is {state} but worker {name} has no state JSON')
            else:
                status = (worker_status(*workers[name]) if name not in running_workers else 'running')
                if status != 'running':
                    findings.append(f'line {lid} (#{l.get("issue")}) is {state} but worker {name} is {status}')
        if state in ('planned', 'running', 'review', 'blocked'):
            try:
                updated = datetime.fromisoformat(str(l.get('updated', '')))
                if datetime.now().astimezone() - updated > timedelta(hours=STALE_H):
                    findings.append(f'line {lid} (#{l.get("issue")}) is {state} but not updated for '
                                    f'{STALE_H} h (updated {l.get("updated")})')
            except ValueError:
                findings.append(f'line {lid} (#{l.get("issue")}) has unreadable updated "{l.get("updated")}"')
    on_board = {l.get('worker') for l in board['lines'] if l.get('worker')}
    for name, state in sorted(running_workers.items()):
        if name not in on_board:
            findings.append(f'worker {name} (role {state.get("role") or "-"}) is running but on no board line')
    by_worktree = {}
    for l in board['lines']:
        if l.get('state') == 'running' and l.get('worker') in running_workers \
                and write_role(running_workers[l['worker']].get('role')) and l.get('worktree'):
            by_worktree.setdefault(l['worktree'], []).append(l.get('id'))
    for worktree, lids in sorted(by_worktree.items()):
        if len(lids) >= 2:
            findings.append(f'running lines {",".join(map(str, lids))} share write workers on one worktree {worktree}')
    for f in findings:
        print(f'board check: {f}')
    print(f'board check: {"ok" if not findings else f"{len(findings)} finding(s)"}')
    return 10 if findings else 0


def self_test():
    root = Path(tempfile.mkdtemp(prefix='ap-board-self-test-'))
    board, state = root / 'board.json', root / 'state'
    state.mkdir()
    env = {**os.environ, 'BOARD': str(board), 'WAVE_STATE': str(state)}

    def run(*args):
        return subprocess.run([sys.executable, str(Path(__file__).resolve()), *args],
                              capture_output=True, text=True, env=env)

    def expect(code, r, what):
        if r.returncode != code or (code == 10 and 'board check: ' not in r.stdout):
            print(f'self-test failed ({what}): exit {r.returncode}, expected {code}\n{r.stdout}{r.stderr}')
            sys.exit(1)

    # init / add / set / show
    expect(0, run('init'), 'init')
    expect(2, run('init'), 'init refuses overwrite')
    expect(0, run('add', '1142', 'lead checks', 'worktree=1142-lead-checks'), 'add')
    expect(0, run('add', '1143', 'other', 'worktree=other-wt'), 'add 2')
    expect(2, run('set', '1', 'state=bogus'), 'state enum enforced')
    expect(0, run('set', '1', 'state=running', 'worker=W-1142'), 'set running')
    expect(0, run('set', 'board', 'release=v0.19', 'goal=ship checks',
                  'decisions=[{"text":"ok","by":"lead","date":"2026-10-30"}]'), 'set board fields')
    r = run('show')
    expect(0, r, 'show')
    assert 'running' in r.stdout and 'v0.19' in r.stdout and '1142-lead-checks' in r.stdout, r.stdout
    # check: clean pass (fresh updated, running worker exists)
    (state / 'W-1142.json').write_text(json.dumps(
        {'name': 'W-1142', 'role': 'impl', 'cwd': str(root), 'started_at': int(time.time()),
         'report': str(root / 'no-report-yet.md'), 'sentinel': '<!-- W-1142-DONE -->'}))
    expect(0, run('check'), 'check clean')
    # check: line running, worker state missing
    expect(0, run('set', '1', 'worker=W-nope'), 'set missing worker')
    expect(10, run('check'), 'line running, worker missing')
    # check: worker done (report ends with sentinel)
    done_report = root / 'W-1142-REPORT.md'
    done_report.write_text('## Summary\ndone\n<!-- W-1142-DONE -->\n')
    (state / 'W-1142.json').write_text(json.dumps(
        {'name': 'W-1142', 'role': 'impl', 'cwd': str(root), 'started_at': int(time.time()) - 60,
         'report': str(done_report), 'sentinel': '<!-- W-1142-DONE -->'}))
    expect(0, run('set', '1', 'worker=W-1142'), 'set worker back')
    expect(10, run('check'), 'line running, worker done')
    # check: stopped worker (dead pid) and stale line
    (state / 'W-1142.json').write_text(json.dumps(
        {'name': 'W-1142', 'role': 'impl', 'cwd': str(root), 'started_at': int(time.time()) - 60,
         'pid': 99999999, 'report': str(root / 'no-report-yet.md'), 'sentinel': '<!-- W-1142-DONE -->'}))
    expect(10, run('check'), 'line running, worker stopped')
    # check: running worker on no board line
    (state / 'W-9999.json').write_text(json.dumps(
        {'name': 'W-9999', 'role': 'impl', 'cwd': str(root), 'started_at': int(time.time()),
         'report': str(root / 'none.md'), 'sentinel': '<!-- W-9999-DONE -->'}))
    r = run('check')
    expect(10, r, 'running worker off board')
    assert 'W-9999' in r.stdout, r.stdout
    (state / 'W-9999.json').unlink()
    # check: two running write lines share a worktree
    (state / 'W-1142.json').write_text(json.dumps(
        {'name': 'W-1142', 'role': 'impl', 'cwd': str(root), 'started_at': int(time.time()),
         'report': str(root / 'none.md'), 'sentinel': '<!-- W-1142-DONE -->'}))
    (state / 'W-1143.json').write_text(json.dumps(
        {'name': 'W-1143', 'role': 'fix', 'cwd': str(root), 'started_at': int(time.time()),
         'report': str(root / 'none2.md'), 'sentinel': '<!-- W-1143-DONE -->'}))
    expect(0, run('set', '2', 'state=running', 'worker=W-1143', 'worktree=1142-lead-checks'), 'set line 2 running')
    r = run('check')
    expect(10, r, 'two write lines one worktree')
    assert 'share write workers' in r.stdout, r.stdout
    # check: stale updated (> 4 h)
    board_data = json.loads(board.read_text())
    board_data['lines'][0]['updated'] = (datetime.now().astimezone() - timedelta(hours=5)).isoformat(timespec='seconds')
    board.write_text(json.dumps(board_data))
    r = run('check')
    expect(10, r, 'stale line')
    assert 'not updated' in r.stdout, r.stdout
    # check: missing board is a note, not a failure
    board.unlink()
    r = run('check')
    expect(0, r, 'missing board notes only')
    print('board.py self-test passed: init/add/set/show, enum guard, clean check, worker missing/done/stopped, '
          'off-board worker, shared worktree, stale line, missing board')


def main():
    args = sys.argv[1:]
    if args[:1] == ['--self-test']:
        self_test()
        return
    if args[:1] in (['--help'], ['-h']):
        print(__doc__)
        return
    if not args:
        die('usage: board.py {init|add <issue> <title> [key=value...]|set <id|board> key=value...|show|check}')
    path = default_board_path()
    cmd, rest = args[0], args[1:]
    if cmd == 'init':
        cmd_init(path)
    elif cmd == 'add':
        cmd_add(path, rest)
    elif cmd == 'set':
        cmd_set(path, rest)
    elif cmd == 'show':
        sys.exit(cmd_show(path))
    elif cmd == 'check':
        sys.exit(cmd_check(path))
    else:
        die(f'unknown command "{cmd}"')


if __name__ == '__main__':
    main()
