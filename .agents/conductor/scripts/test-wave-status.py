#!/usr/bin/env python3
"""wave-status.py: which worker states count as wave state, and how each one reads."""
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / 'wave-status.py'

with tempfile.TemporaryDirectory(prefix='wave-status-test-') as tmp:
    t = Path(tmp)
    states = t / 'wave'
    states.mkdir()
    live_wt = t / 'wt-live'
    live_wt.mkdir()
    now = int(time.time())

    def state(name, cwd, pid=None, report=None, started=now - 600):
        rep = t / f'{name}-REPORT.md'
        if report is not None:
            rep.write_text(report)
        data = dict(name=name, role='impl', model='m', effort='e', cwd=str(cwd), report=str(rep),
                    sentinel=f'<!-- {name}-DONE -->', started_at=started, log=str(t / f'{name}.log'))
        if pid:
            data['pid'] = pid
        (states / f'{name}.json').write_text(json.dumps(data))
        return rep

    def ps_field(pid, field):
        return subprocess.run(['ps', '-o', field, '-p', str(pid)], capture_output=True, text=True).stdout.strip()

    state('running', live_wt, pid=os.getpid())
    state('stopped', live_wt, pid=99999999)
    state('terminal', live_wt)
    state('done', live_wt, report='body\n<!-- done-DONE -->\n')
    old = state('done-old', live_wt, report='body\n<!-- done-old-DONE -->\n', started=now - 9 * 3600)
    os.utime(old, (now - 8 * 3600, now - 8 * 3600))
    state('closed', t / 'removed-worktree', pid=99999999)
    state('wrong-sentinel', live_wt, pid=99999999, report='body\nnot the sentinel\n')
    # app-preview.py 형식 미리보기 — 소유 판정은 app-preview.py와 같은 규칙이다.
    (states / 'preview-live.json').write_text(json.dumps(dict(
        label='live', pid=os.getpid(), lstart=ps_field(os.getpid(), 'lstart='), command=ps_field(os.getpid(), 'command='),
        url='http://127.0.0.1:5180')))
    # 같은 pid가 다른 프로세스로 재사용됐다(기록된 시작 시각·명령과 불일치): 소유 아님.
    (states / 'preview-reused.json').write_text(json.dumps(dict(
        label='reused', pid=os.getpid(), lstart='garbage lstart', command='garbage command',
        url='http://127.0.0.1:5183')))
    # 부모도 pgid도 기록이 없어 죽었는지 살았는지 판정 불가: unclear로 표시된다.
    (states / 'preview-dead.json').write_text(json.dumps(dict(label='dead', pid=99999999, url='http://127.0.0.1:5181')))
    # 부모(launcher)는 죽고 pgid 그룹에 기록 checkout의 vite가 남은 경우: 표시된다.
    node = shutil.which('node')
    assert node, 'node is required to fake a recorded-checkout vite process'
    checkout = t / 'preview-checkout'
    vite_js = checkout / 'node_modules' / 'vite' / 'bin' / 'vite.js'
    vite_js.parent.mkdir(parents=True)
    vite_js.write_text('setInterval(() => {}, 1 << 30)\n')
    # `&` so sh forks node into its new session/group and then exits: recorded pid dead, vite alive.
    launcher = subprocess.Popen(['sh', '-c', f'"{node}" "{vite_js}" --host 127.0.0.1 --port 5182 --strictPort &'],
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
    pgid = os.getpgid(launcher.pid)
    (states / 'preview-orphan.json').write_text(json.dumps(dict(
        label='orphan', pid=launcher.pid, pgid=pgid, checkout=str(checkout), port=5182,
        url='http://127.0.0.1:5182')))
    try:
        # sh forks node asynchronously: kill the launcher only once the vite process exists.
        deadline = time.time() + 5
        while '--strictPort' not in subprocess.run(['ps', '-axo', 'command='], capture_output=True,
                                                   text=True).stdout:
            assert time.time() < deadline, 'fake vite process never appeared'
            time.sleep(0.1)
        launcher.kill()
        launcher.wait()  # reap the launcher: alive(pid) must be false for the recorded pid

        out = subprocess.run([sys.executable, str(SCRIPT), '--json', '--state-dir', str(states)],
                             capture_output=True, text=True, check=True).stdout
        snap = json.loads(out)
        got = {w['name']: w['status'] for w in snap['workers']}
        want = {'running': 'running', 'stopped': 'stopped', 'terminal': 'running', 'done': 'done',
                'wrong-sentinel': 'stopped'}
        assert got == want, got
        assert [(p['name'], p['state']) for p in snap['previews']] == [
            ('dead', 'unclear'), ('live', 'live'), ('orphan', 'live')], snap['previews']
        assert 'containers' not in snap, snap.keys()
        text = subprocess.run([sys.executable, str(SCRIPT), '--state-dir', str(states)],
                              capture_output=True, text=True, check=True).stdout
        assert text.startswith('Workers: 4 active, 1 done'), text
        assert 'dead (unclear)' in text and 'orphan' in text, text
        # ps 조회가 막히면 소유 부정이 아니라 unclear로 표시된다.
        unclear = json.loads(subprocess.run([sys.executable, str(SCRIPT), '--json', '--state-dir', str(states)],
                                            capture_output=True, text=True, check=True,
                                            env={'PATH': '/nonexistent'}).stdout)
        assert [p['state'] for p in unclear['previews']] == ['unclear'] * 4, unclear['previews']
        print('PASS: wave-status worker states, preview ownership and text summary')
    finally:
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            pass
