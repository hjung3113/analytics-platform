#!/usr/bin/env python3
"""Local lane board (#1142): the lead's goal/line state as one JSON file.

Replaces hand-edited LEAD.md tables (LEAD.md keeps only free-form notes). The board lives at
$AP_MAIN/.review/lanes/board.json (gitignored location); the lead seeds it — nothing migrates
automatically. Schema, documented here and in LANES.md §Lead:

    { "release": str, "goal": str, "merge_grant": str,
      "decisions": [ {"text": str, "by": str, "date": str} ],
      "lines": [ {"id": int, "issue": int|str, "title": str,
                  "state": "planned|running|review|blocked|done|dropped",
                  "release": str,          # optional; missing = the board's current release
                  "worker": str|null,      # worker state JSON name in $WAVE_STATE, e.g. "W-1142"
                  "worktree": str, "pr": int|str|null, "next": str, "updated": ISO-8601 str,
                  "done_at": ISO-8601 str  # set once when the line enters done } ] }

Commands: init | add <issue> <title> [key=value...] | add decision <text> [by=<who>] [date=<YYYY-MM-DD>]
| set <id|board> key=value... [--owner-ok "<quote>"] | show | ready | check.
`set` refreshes the line's `updated` only when `state`, `pr` or `worker` changes value (editing `next`, `title` or
`worktree` leaves it); `worker=null` / `pr=null` clears a field. Atomic writes
(temp file + rename in the same directory).

Release scope (the owner sets it; keeping a lane busy never outranks it): `add` stores `release=<v>` on the
line (default: the board's release). `ready` lists the planned lines whose release equals the board's release
(`ready <id> #<issue> <title>` per line, `board ready: none` when empty), then one `release <v>: …` progress line per
release (counts per state, age of the last done line); assign work only from the `ready` lines. A line
that carries no `release` counts as the current one, so old boards stay readable. Setting `state=running` on a
line of another release (via `set` or `add`) is refused unless `--owner-ok "<the owner's words>"` is given; the
quote is stored on the line as `owner_ok`. `add decision` writes only to `decisions[]` — never a line.

`check` prints one line per finding and exits 10 when: a line is running/review but its worker's
state JSON in $WAVE_STATE is done/stopped/closed/missing (a dead pid counts as stopped); a running
worker in $WAVE_STATE is on no board line; two running lines with write roles (impl*, fix) share a
worktree; a line in running/review/blocked was not updated for 4 h (planned lines wait by design and a `review`
line may have no worker); a release with an unfinished line has had no line reach `done` for 4 h (the newest `done_at`
of its done lines). A missing board or missing WAVE_STATE is a note, not a finding.

Env: AP_MAIN (default: the git common dir of the checkout holding this script), BOARD (board path
override), WAVE_STATE (worker state dir, or several joined with ':' — one per lane; checked only for
`check`). --self-test runs fixtures in a temp folder and needs neither.
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
LINE_KEYS = ('issue', 'title', 'state', 'release', 'worker', 'worktree', 'pr', 'next')
BOARD_KEYS = ('release', 'goal', 'merge_grant', 'decisions')
STALE_H = 4
PROGRESS_KEYS = ('state', 'pr', 'worker')  # only these changes count as progress and refresh `updated`


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


def line_release(board, line):
    """A line without a release belongs to the board's current release."""
    return line.get('release') or board.get('release') or ''


def pop_owner_ok(args):
    """Split `--owner-ok "<quote>"` out of args: (remaining args, quote or None)."""
    if '--owner-ok' not in args:
        return args, None
    i = args.index('--owner-ok')
    if i + 1 >= len(args) or not args[i + 1].strip():
        die('--owner-ok needs the owner\'s words as one quoted argument')
    return args[:i] + args[i + 2:], args[i + 1].strip()


def guard_release(board, line, kv, owner_ok):
    """Starting a line of another release needs the owner's words (scope beats keeping lanes busy)."""
    if 'state=running' not in kv:
        return
    rel, current = line_release(board, line), board.get('release') or ''
    if rel == current:
        return
    if not owner_ok:
        die(f'line {line.get("id")} (#{line.get("issue")}) is release "{rel}" but the board release is '
            f'"{current}": starting it needs --owner-ok "<the owner\'s words>"', 3)
    line['owner_ok'] = owner_ok


def cmd_add_decision(path, args):
    board = load(path)
    if not args:
        die('usage: board.py add decision <text> [by=<who>] [date=<YYYY-MM-DD>]')
    entry = {'text': args[0], 'by': 'lead', 'date': datetime.now().date().isoformat()}
    for pair in args[1:]:
        key, _, raw = pair.partition('=')
        if key not in ('by', 'date') or not raw:
            die(f'add decision accepts only by=<who> and date=<YYYY-MM-DD>, got "{pair}"')
        entry[key] = raw
    board.setdefault('decisions', []).append(entry)
    save(path, board)
    print(f'board: decision recorded ({entry["by"]}, {entry["date"]}); no line added')


def cmd_add(path, args):
    if args[:1] == ['decision']:
        return cmd_add_decision(path, args[1:])
    board = load(path)
    args, owner_ok = pop_owner_ok(args)
    if len(args) < 2:
        die('usage: board.py add <issue> <title> [key=value...] | add decision <text> [by=..] [date=..]')
    line = {'id': max((l.get('id', 0) for l in board['lines']), default=0) + 1,
            'issue': parse_value('issue', args[0]), 'title': args[1],
            'state': 'planned', 'release': board.get('release') or '', 'worker': None, 'worktree': '',
            'pr': None, 'next': '', 'updated': now_iso()}
    apply_kv(line, args[2:], LINE_KEYS)
    guard_release(board, line, args[2:], owner_ok)
    if line.get('state') == 'done':
        line['done_at'] = line['updated']
    board['lines'].append(line)
    save(path, board)
    print(f'board: added line {line["id"]} #{line["issue"]} {line["title"]} (release {line_release(board, line) or "-"})')


def release_groups(board):
    """[(release, [lines])] in order of first appearance; legacy decision lines are not work."""
    groups = {}
    for l in board['lines']:
        if str(l.get('issue')) != 'decision':
            groups.setdefault(line_release(board, l), []).append(l)
    return list(groups.items())


def last_done(lines):
    """Newest completion time among the done lines, or None. `done_at` is set when a line enters done and never moves
    again; lines from before that field fall back to `updated`."""
    stamps = []
    for l in lines:
        if l.get('state') == 'done':
            try:
                stamps.append(datetime.fromisoformat(str(l.get('done_at') or l.get('updated', ''))))
            except ValueError:
                pass
    return max(stamps) if stamps else None


def cmd_ready(path):
    if not path.exists():
        print(f'board ready: no board at {path}')
        return 1
    board = load(path)
    current = board.get('release') or ''
    # legacy decisions written as lines (issue=decision) are not work to assign
    ready = [l for l in board['lines'] if l.get('state') == 'planned' and str(l.get('issue')) != 'decision'
             and line_release(board, l) == current]
    for l in ready:
        print(f'ready {l.get("id")} #{l.get("issue")} {l.get("title")} (release {current or "-"})')
    if not ready:
        print(f'board ready: none (release {current or "-"})')
    for rel, lines in release_groups(board):
        counts = {st: sum(1 for l in lines if l.get('state') == st) for st in STATES if st != 'dropped'}
        last = last_done(lines)
        age = f'{(datetime.now().astimezone() - last).total_seconds() / 3600:.1f} h ago' if last else 'none'
        print(f'release {rel or "-"}: ' + ', '.join(f'{st} {n}' for st, n in counts.items())
              + f' (last done {age})' + (' [current]' if rel == current else ''))
    return 0


def cmd_set(path, args):
    board = load(path)
    args, owner_ok = pop_owner_ok(args)
    if not args:
        die('usage: board.py set <id|board> key=value... [--owner-ok "<quote>"]')
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
    before = {k: line.get(k) for k in PROGRESS_KEYS}
    apply_kv(line, args[1:], LINE_KEYS)
    guard_release(board, line, args[1:], owner_ok)
    if line.get('state') == 'done' and before['state'] != 'done':
        line['done_at'] = now_iso()  # completion time: later pr/worker corrections must not renew it
    if any(line.get(k) != before[k] for k in PROGRESS_KEYS):
        line['updated'] = now_iso()  # `next`/title edits are bookkeeping: they must not hide a stalled line
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
    print(f'{"id":>3} {"issue":>6} {"state":<8} {"rel":<8} {"worker":<14} {"pr":>5}  {"worktree":<22} {"upd":<16} next')
    for l in board['lines']:
        upd = str(l.get('updated', '-'))[:16]
        print(f'{l.get("id", "-"):>3} {str(l.get("issue", "-")):>6} {l.get("state", "-"):<8} '
              f'{line_release(board, l) or "-":<8} '
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
    roots = [Path(p) for p in state_dir.split(':') if p]  # one dir per lane, joined with ':'
    for root in roots:
        if not root.is_dir():
            return None, f'WAVE_STATE {root} is not a directory'
    workers = {}
    for root in roots:
        for path in sorted(root.glob('*.json')):
            if path.name.startswith('preview-'):
                continue
            try:
                state = json.loads(path.read_text())
            except (ValueError, OSError):
                continue
            if isinstance(state, dict):  # state dirs also hold CI snapshots (JSON lists); only objects are worker states
                workers[path.stem] = (state, path)
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
                pass  # a line may sit on a lead step (checks, CI, merge) with no worker; stale-line check below still applies
            elif name not in workers:
                findings.append(f'line {lid} (#{l.get("issue")}) is {state} but worker {name} has no state JSON')
            else:
                status = (worker_status(*workers[name]) if name not in running_workers else 'running')
                if status != 'running':
                    findings.append(f'line {lid} (#{l.get("issue")}) is {state} but worker {name} is {status}')
        if state in ('running', 'review', 'blocked'):  # planned lines wait by design
            try:
                updated = datetime.fromisoformat(str(l.get('updated', '')))
                if datetime.now().astimezone() - updated > timedelta(hours=STALE_H):
                    findings.append(f'line {lid} (#{l.get("issue")}) is {state} but not updated for '
                                    f'{STALE_H} h (updated {l.get("updated")})')
            except ValueError:
                findings.append(f'line {lid} (#{l.get("issue")}) has unreadable updated "{l.get("updated")}"')
    for rel, lines in release_groups(board):
        last = last_done(lines)
        open_n = sum(1 for l in lines if l.get('state') in ('planned', 'running', 'review', 'blocked'))
        if last and open_n and datetime.now().astimezone() - last > timedelta(hours=STALE_H):
            findings.append(f'release {rel or "-"} has {open_n} unfinished line(s) and no line done for {STALE_H} h '
                            f'(last done {last.isoformat(timespec="minutes")})')
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
    # check across two state dirs joined with ':' (one per lane)
    other = root / 'state-b'
    other.mkdir()
    (other / 'W-1143.json').write_text((state / 'W-1143.json').read_text())
    (state / 'W-1143.json').unlink()
    env2 = {**env, 'WAVE_STATE': f'{state}:{other}'}
    r = subprocess.run([sys.executable, str(Path(__file__).resolve()), 'check'], capture_output=True, text=True, env=env2)
    assert 'W-1143' not in r.stdout, r.stdout  # found in the second dir, not reported missing/off-board
    (other / 'ci-snapshot.json').write_text('[{"name": "ci", "bucket": "pass"}]')  # CI snapshots are JSON lists
    r = subprocess.run([sys.executable, str(Path(__file__).resolve()), 'check'], capture_output=True, text=True, env=env2)
    assert 'Traceback' not in r.stderr and 'ci-snapshot' not in r.stdout, r.stderr  # a list is skipped, not a worker
    r = run('check')
    assert 'W-1143' in r.stdout, r.stdout  # one dir alone cannot see it
    # check: missing board is a note, not a failure
    board.unlink()
    r = run('check')
    expect(0, r, 'missing board notes only')

    # release scope (#1401): ready, release default, running on another release needs --owner-ok, decisions only in decisions[]
    expect(0, run('init'), 'init again')
    expect(0, run('set', 'board', 'release=v1'), 'board release v1')
    expect(0, run('add', '1', 'current default release'), 'add default release')
    expect(0, run('add', '2', 'next release line', 'release=v2'), 'add other release')
    expect(0, run('add', '3', 'done line', 'state=done'), 'add done line')
    data = json.loads(board.read_text())
    assert data['lines'][0]['release'] == 'v1', data
    r = run('ready')
    expect(0, r, 'ready')
    assert 'ready 1 #1' in r.stdout and '#2' not in r.stdout and '#3' not in r.stdout, r.stdout
    r = run('set', '2', 'state=running')
    expect(3, r, 'running on another release refused')
    assert '--owner-ok' in r.stderr, r.stderr
    assert json.loads(board.read_text())['lines'][1]['state'] == 'planned'
    expect(2, run('set', '2', 'state=running', '--owner-ok'), '--owner-ok without a quote')
    expect(0, run('set', '2', 'next=prep'), 'other fields of another release need no quote')
    expect(0, run('set', '2', 'state=running', '--owner-ok', 'owner 2026-11-06: start v2 now'), 'owner-ok accepted')
    line2 = json.loads(board.read_text())['lines'][1]
    assert line2['state'] == 'running' and line2['owner_ok'] == 'owner 2026-11-06: start v2 now', line2
    expect(3, run('add', '9', 'sneaky', 'release=v3', 'state=running'), 'add running on another release refused')
    expect(0, run('set', '1', 'state=running'), 'current release starts without a quote')
    # a line without a release field (old board) counts as the current release
    data = json.loads(board.read_text())
    del data['lines'][2]['release']
    data['lines'][2]['state'] = 'planned'
    board.write_text(json.dumps(data))
    r = run('ready')
    assert '#3' in r.stdout, r.stdout
    # legacy decision lines (issue=decision) are never ready work
    data = json.loads(board.read_text())
    data['lines'].append({'id': 98, 'issue': 'decision', 'title': 'old decision line', 'state': 'planned'})
    board.write_text(json.dumps(data))
    r = run('ready')
    assert 'old decision line' not in r.stdout and '#3' in r.stdout, r.stdout
    # add decision touches decisions[] only
    before = len(json.loads(board.read_text())['lines'])
    expect(0, run('add', 'decision', 'v2 waits for the owner', 'by=owner'), 'add decision')
    data = json.loads(board.read_text())
    assert len(data['lines']) == before and data['decisions'][-1]['text'] == 'v2 waits for the owner' \
        and data['decisions'][-1]['by'] == 'owner', data
    expect(2, run('add', 'decision', 'x', 'worker=W-1'), 'add decision rejects line keys')

    # stall detection (#1566): `updated` moves only with state/pr/worker; planned lines never go stale; a workerless
    # running line is not a finding by itself; ready lists every release with the age of its last done line.
    board.unlink()
    for (_dir, _names, files) in os.walk(state):
        for f in files:
            (Path(_dir) / f).unlink()
    old = (datetime.now().astimezone() - timedelta(hours=10)).isoformat(timespec='seconds')

    def age_line(lid, stamp):
        d = json.loads(board.read_text())
        ln = next(l for l in d['lines'] if l['id'] == lid)
        ln['updated'] = stamp
        if 'done_at' in ln:
            ln['done_at'] = stamp
        board.write_text(json.dumps(d))

    def line(lid):
        return next(l for l in json.loads(board.read_text())['lines'] if l['id'] == lid)

    expect(0, run('init'), 'init for stall detection')
    expect(0, run('set', 'board', 'release=v1'), 'release v1')
    expect(0, run('add', '1', 'planned old'), 'planned line')
    expect(0, run('add', '2', 'running no worker', 'state=running'), 'workerless running line')
    expect(0, run('add', '3', 'done long ago', 'state=done'), 'done line')
    expect(0, run('add', '4', 'other release done', 'state=done', 'release=v0'), 'other release done line')
    for lid in (1, 2, 3, 4):
        age_line(lid, old)
    r = run('check')
    assert 'has no worker' not in r.stdout and 'line 1 ' not in r.stdout, r.stdout  # planned is not stale, workerless is not a finding
    assert 'line 2 (#2) is running but not updated' in r.stdout, r.stdout  # running still goes stale
    assert 'release v1 has 2 unfinished line(s) and no line done for 4 h' in r.stdout, r.stdout
    assert 'release v0 ' not in r.stdout, r.stdout  # v0 has nothing unfinished
    expect(10, r, 'release without a recent done line')
    before = line(2)['updated']
    expect(0, run('set', '2', 'next=waiting for review'), 'set next only')
    assert line(2)['updated'] == before, line(2)  # `next` does not refresh updated
    expect(0, run('set', '2', 'worker=W-7'), 'set worker')
    assert line(2)['updated'] != before, line(2)
    before = line(2)['updated']
    expect(0, run('set', '2', 'worker=W-7'), 'set the same worker again')
    assert line(2)['updated'] == before, line(2)  # an unchanged value is not progress
    expect(0, run('set', '3', 'pr=12'), 'set pr')
    assert line(3)['updated'] != old, line(3)
    assert line(3)['done_at'] == old, line(3)  # correcting a done line's pr does not renew its completion time
    r = run('check')
    assert 'release v1 has 2 unfinished line(s) and no line done for 4 h' in r.stdout, r.stdout  # alarm stays
    expect(0, run('set', '2', 'state=done'), 'line 2 enters done')
    assert line(2)['done_at'] != old and line(2)['done_at'] == line(2)['updated'], line(2)
    expect(0, run('set', '2', 'state=running'), 'line 2 back to running')
    expect(0, run('set', '2', 'state=done'), 'line 2 done again')
    r = run('check')
    assert 'release v1 has' not in r.stdout, r.stdout  # a line entering done now clears the alarm
    r = run('ready')
    expect(0, r, 'ready with release lines')
    assert 'release v1: planned 1, running 0, review 0, blocked 0, done 2 (last done 0.0 h ago) [current]' in r.stdout, r.stdout
    assert 'release v0: planned 0, running 0, review 0, blocked 0, done 1 (last done 10.0 h ago)' in r.stdout, r.stdout
    print('board.py self-test passed: init/add/set/show, enum guard, clean check, worker missing/done/stopped, '
          'off-board worker, shared worktree, stale line, two state dirs, missing board, release scope '
          '(ready, default release, owner-ok, old lines, decision only in decisions[]), stall detection '
          '(updated only on state/pr/worker change, planned never stale, no «has no worker», release done-age alarm, '
          'release progress lines)')


def main():
    args = sys.argv[1:]
    if args[:1] == ['--self-test']:
        self_test()
        return
    if args[:1] in (['--help'], ['-h']):
        print(__doc__)
        return
    if not args:
        die('usage: board.py {init|add <issue> <title> [key=value...]|add decision <text>|'
            'set <id|board> key=value... [--owner-ok "<quote>"]|show|ready|check}')
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
    elif cmd == 'ready':
        sys.exit(cmd_ready(path))
    elif cmd == 'check':
        sys.exit(cmd_check(path))
    else:
        die(f'unknown command "{cmd}"')


if __name__ == '__main__':
    main()
