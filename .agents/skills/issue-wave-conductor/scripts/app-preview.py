#!/usr/bin/env python3
"""app-preview.py — serve a checkout's platform-web (mock assembly) on a free port for real-app checks.

  app-preview.py start <checkout> [--name <label>]
  app-preview.py stop <label> | --all
  app-preview.py status

`start` runs `vite` (development mode = mock assembly with DevTools, no backend, no DB) from the checkout on the first
free port in 5180–5199 and waits until it answers. Ports 4190 (E2E) and 5173 (the owner's dev server) stay free.
Each preview gets its own port, so its origin and localStorage (role `platform:role`, favourites, table columns)
are separate from every other preview.

Each process starts in its own session. `stop` kills the whole process group (pnpm → vite children) only after an
ownership check: the recorded pgid plus the parent's recorded start time and command line, or — when the parent is
gone (or the state file predates pgid recording) — a vite command with the recorded port and `--strictPort` inside
the group. Unclear ownership (e.g. a reused PID) gets no signal; the state file stays and the stop reports
`ownership unclear`. State is
`$WAVE_STATE/preview-<label>.json` (default `~/.cache/worker-ops/previews/`). `status` lists tracked previews with
liveness and reports untracked vite servers on the preview port range as `untracked` — they belong to someone
else, so neither `stop --all` nor this script touches them. Before a handoff, `status` must show no tracked preview.
Prints one JSON line.
"""
import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PORTS = range(5180, 5200)


def emit(obj, code=0):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(code)


def state_dir():
    d = Path(os.environ.get('WAVE_STATE') or Path.home() / '.cache/worker-ops/previews')
    d.mkdir(parents=True, exist_ok=True)
    return d


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def port_free(port):
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', port)) != 0


def ps_rows():
    """(pid, pgid, command) of every process, from one ps sweep."""
    out = subprocess.run(['ps', '-axo', 'pid=,pgid=,command='], capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
            rows.append((int(parts[0]), int(parts[1]), parts[2]))
    return rows


def ps_value(pid, field):
    """One ps field of pid (`lstart=`, `command=`), or None when the process is gone."""
    r = subprocess.run(['ps', '-o', field, '-p', str(pid)], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def group_members(pgid):
    """Live pids still inside the process group."""
    return [pid for pid, g, _cmd in ps_rows() if g == pgid]


def vite_in_group(pgid, port):
    """A vite server with the recorded port and --strictPort inside the process group."""
    return any('vite' in cmd and '--strictPort' in cmd and f'--port {port}' in cmd
               for _pid, g, cmd in ps_rows() if g == pgid)


def owns(s):
    """True when the recorded preview may be signalled safely; False = ownership unclear."""
    if 'pgid' not in s:  # state file from before pgid recording: vite signature only
        return vite_in_group(s['pid'], s['port'])
    if alive(s['pid']):
        return ps_value(s['pid'], 'lstart=') == s.get('lstart') \
            and ps_value(s['pid'], 'command=') == s.get('command')
    return vite_in_group(s['pgid'], s['port'])


def tracked():
    out = []
    for f in sorted(state_dir().glob('preview-*.json')):
        try:
            s = json.loads(f.read_text())
        except ValueError:
            continue
        s['alive'] = owns(s)
        s['file'] = str(f)
        out.append(s)
    return out


def untracked(known_ports):
    ps = subprocess.run(['ps', '-axo', 'pid=,command='], capture_output=True, text=True).stdout
    found = []
    for line in ps.splitlines():
        pid, _, cmd = line.strip().partition(' ')
        if 'vite' in cmd and '--strictPort' in cmd:
            for port in PORTS:
                if f'--port {port}' in cmd and port not in known_ports:
                    found.append({'pid': int(pid), 'port': port})
    return found


def stop_one(s):
    if not owns(s):
        return {'ok': False, 'error': 'ownership unclear', 'label': s['label'], 'pid': s['pid'], 'port': s['port'],
                'file': s['file']}
    pgid = s.get('pgid', s['pid'])
    try:
        os.killpg(pgid, signal.SIGTERM)
    except OSError:
        pass
    for _ in range(20):
        if not group_members(pgid):
            break
        time.sleep(0.25)
    if group_members(pgid):
        try:
            os.killpg(pgid, signal.SIGKILL)
        except OSError:
            pass
    Path(s['file']).unlink(missing_ok=True)
    return {'ok': True, 'label': s['label']}


def start(args):
    checkout = Path(args.checkout).resolve()
    if not (checkout / 'apps/platform-web/vite.config.ts').is_file():
        emit({'ok': False, 'error': f'not an analytics-platform checkout: {checkout}'}, 2)
    if not (checkout / 'node_modules/.modules.yaml').is_file():
        emit({'ok': False, 'error': 'node_modules missing: submodule init + pnpm install --frozen-lockfile first'}, 1)
    label = args.name or checkout.name
    if (state_dir() / f'preview-{label}.json').exists():
        emit({'ok': False, 'error': f'preview {label} already tracked; stop it first'}, 1)
    port = next((p for p in PORTS if port_free(p)), None)
    if port is None:
        emit({'ok': False, 'error': 'no free port in 5180-5199'}, 1)
    log = state_dir() / f'preview-{label}.log'
    cmd = ['pnpm', '--filter', '@ap/platform-web', 'exec', 'vite', '--host', '127.0.0.1', '--port', str(port),
           '--strictPort']
    with open(log, 'w') as out, open(os.devnull) as null:
        proc = subprocess.Popen(cmd, cwd=checkout, stdin=null, stdout=out, stderr=subprocess.STDOUT,
                                start_new_session=True)
    url = f'http://127.0.0.1:{port}'
    state = {'label': label, 'checkout': str(checkout), 'pid': proc.pid, 'pgid': os.getpgid(proc.pid),
             'lstart': ps_value(proc.pid, 'lstart='), 'command': ps_value(proc.pid, 'command='),
             'port': port, 'url': url, 'log': str(log),
             'head': subprocess.run(['git', '-C', str(checkout), 'rev-parse', '--short', 'HEAD'],
                                    capture_output=True, text=True).stdout.strip()}
    (state_dir() / f'preview-{label}.json').write_text(json.dumps(state))
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    emit({'ok': True, **state})
        except OSError:
            time.sleep(1)
    stop_one({**state, 'file': str(state_dir() / f'preview-{label}.json')})
    emit({'ok': False, 'error': f'preview did not answer within 90 s; see {log}', 'log': str(log)}, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    p_start = sub.add_parser('start')
    p_start.add_argument('checkout')
    p_start.add_argument('--name')
    p_stop = sub.add_parser('stop')
    p_stop.add_argument('label', nargs='?')
    p_stop.add_argument('--all', action='store_true')
    sub.add_parser('status')
    args = parser.parse_args()

    if args.cmd == 'start':
        start(args)
    if args.cmd == 'stop':
        targets = [s for s in tracked() if args.all or s['label'] == args.label]
        if not targets and not args.all:
            emit({'ok': False, 'error': f'no tracked preview {args.label}'}, 1)
        stopped, skipped = [], []
        for s in targets:
            r = stop_one(s)
            if r['ok']:
                stopped.append(r['label'])
            else:
                skipped.append({'label': r['label'], 'error': r['error']})
        if skipped and not args.all:
            emit({'ok': False, 'error': skipped[0]['error'], 'label': skipped[0]['label']}, 1)
        emit({'ok': True, 'stopped': stopped, 'skipped': skipped})
    previews = tracked()
    emit({'ok': True, 'previews': [{k: s[k] for k in ('label', 'url', 'pid', 'alive', 'head')} for s in previews],
          'untracked': untracked({s['port'] for s in previews})})


if __name__ == '__main__':
    main()
