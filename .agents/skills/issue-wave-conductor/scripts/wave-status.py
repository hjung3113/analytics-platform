#!/usr/bin/env python3
"""웨이브의 한 시점 스냅숏: 작업자와 리뷰어, 미리보기, worktree, 열린 PR.

읽기 전용. 코디네이터가 진행 질문에 쓴다. 작업자 상태는 `worker-launch.sh`가 쓰는 JSON이며, `$WAVE_STATE`
또는, 없으면 이 레포의 최근 세션 scratchpad `wave/` 폴더(하루 안에 만진 것)를 읽는다.

  python3 wave-status.py [--json] [--prs] [--state-dir <dir>]...
"""
import argparse
import json
import os
import subprocess
import time
from pathlib import Path

DAY = 24 * 3600
RECENT = 3 * 3600
REPO = Path(__file__).resolve().parents[4]


def _app_preview():
    """app-preview.py를 불러온다 — 미리보기 소유 판정을 이 도구가 따로 두지 않고 같은 규칙으로 읽기만 한다."""
    import importlib.util
    path = Path(__file__).resolve().parent / 'app-preview.py'
    spec = importlib.util.spec_from_file_location('app_preview', path)
    if spec is None or spec.loader is None:
        raise ImportError(f'app-preview.py not found next to wave-status.py: {path}')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


APP_PREVIEW = _app_preview()


def run(args, timeout=10):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=REPO)
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (ProcessLookupError, ValueError, TypeError):
        return False
    except PermissionError:
        return True


def state_dirs(explicit):
    if explicit:
        return [Path(d) for d in explicit]
    if os.environ.get('WAVE_STATE'):
        return [Path(os.environ['WAVE_STATE'])]
    slug = str(REPO).replace('/', '-')
    now = time.time()
    found = []
    for root in {Path('/private/tmp'), Path(os.environ.get('TMPDIR', '/tmp'))}:
        for d in root.glob(f'claude-*/{slug}/*/scratchpad/wave'):
            if d.is_dir() and now - d.stat().st_mtime < DAY:
                found.append(d)
    return sorted(found, key=lambda d: d.stat().st_mtime, reverse=True)


def report_done(s):
    report = Path(s.get('report', ''))
    if not report.is_file() or report.stat().st_mtime < s.get('started_at', 0):
        return False
    lines = [l for l in report.read_text(errors='replace').splitlines() if l.strip()]
    return bool(lines) and lines[-1] == s.get('sentinel')


def worker(path, now):
    s = json.loads(path.read_text())
    started = s.get('started_at') or int(path.stat().st_mtime)
    if report_done(s):
        status = 'done'
    elif not Path(s.get('cwd', '/nonexistent')).is_dir():
        # worktree가 사라졌다: 이 작업자는 코디네이터가 마쳤다(병합했거나 버렸다).
        status = 'closed'
    elif s.get('pid'):
        status = 'running' if alive(s['pid']) else 'stopped'
    else:
        # Orca 터미널 작업자는 여기에 PID가 없다. 보고서도 없으면 실행 중으로 본다.
        status = 'running'
    report = Path(s.get('report', ''))
    finished = int(report.stat().st_mtime) if status == 'done' else None
    log = Path(s.get('log', ''))
    quiet = int((now - log.stat().st_mtime) / 60) if log.is_file() else None
    return dict(name=s.get('name', path.stem), role=s.get('role'), model=s.get('model'), effort=s.get('effort'),
                worktree=Path(s.get('cwd', '')).name, status=status, minutes=int((now - started) / 60),
                log_quiet_minutes=quiet, started_at=started, finished_at=finished)


def preview(path):
    """app-preview.py와 같은 읽기 전용 소유 판정으로 상태 파일을 분류한다.

    'live' = 소유가 증명됨(부모 생존 + 시작 시각·명령 일치, 또는 죽은 부모의 pgid 그룹에 기록 checkout의 vite 생존).
    'unclear' = 판정 불명(ps 실패, 신원·checkout·pgid 기록 없음) — 숨기지 않고 표시한다.
    None = 소유 아님을 입증(부모 pid 재사용, 그룹에 우리 vite 없음) — 숨긴다.
    """
    try:
        p = json.loads(path.read_text())
    except ValueError:
        return None
    ap = APP_PREVIEW
    try:
        pid = p.get('pid')
        if isinstance(pid, int) and ap.alive(pid):
            if ap.identified(p.get('lstart')) and ap.identified(p.get('command')):
                current = (ap.ps_value(pid, 'lstart='), ap.ps_value(pid, 'command='))
                if not all(ap.identified(v) for v in current):
                    state = 'unclear'
                else:
                    state = 'live' if current == (p['lstart'], p['command']) else None
            else:
                state = 'unclear'  # 살아 있어도 신원이 없으면 pid 재사용을 배제할 증거가 없다
        elif isinstance(p.get('pgid'), int) and ap.identified(p.get('checkout')) and isinstance(p.get('port'), int):
            found = ap.vite_in_group(p['pgid'], p['port'], p['checkout'])
            state = 'live' if found else 'unclear' if found is None else None
        else:
            state = 'unclear'
    except OSError:  # ps를 못 찾는 등 조회 실패는 소유 부정이 아니라 불명확이다
        state = 'unclear'
    if state is None:
        return None
    return dict(name=p.get('label') or p.get('name', path.stem), url=p.get('url'), state=state)


def snapshot(dirs, with_prs):
    now = time.time()
    workers, previews = [], []
    for d in dirs:
        # glob order is filesystem order (differs on Linux CI); sort so previews list by label.
        for path in sorted(d.glob('*.json')):
            if path.name.startswith('preview-'):
                p = preview(path)
                if p:
                    previews.append(p)
                continue
            try:
                w = worker(path, now)
            except (ValueError, OSError):
                continue
            # closed 작업자와 보고서가 RECENT보다 오래된 done 작업자는 기록이지 웨이브 상태가 아니다.
            if w['status'] == 'closed' or (w['status'] == 'done' and now - w['finished_at'] > RECENT):
                continue
            workers.append(w)
    order = {'running': 0, 'stopped': 1, 'done': 2}
    workers.sort(key=lambda w: (order.get(w['status'], 3), -w['started_at']))

    worktrees = []
    out = run(['git', 'worktree', 'list', '--porcelain'])
    if out:
        for block in out.strip().split('\n\n')[1:]:
            fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
            worktrees.append(dict(path=Path(fields.get('worktree', '')).name,
                                  branch=fields.get('branch', '').replace('refs/heads/', '')))

    prs = None
    if with_prs:
        out = run(['gh', 'pr', 'list', '--state', 'open', '--limit', '20', '--json',
                   'number,title,baseRefName,statusCheckRollup'], timeout=20)
        if out:
            prs = []
            for p in json.loads(out):
                checks = p.get('statusCheckRollup') or []
                states = {c.get('conclusion') or c.get('state') or c.get('status') for c in checks}
                ci = ('fail' if states & {'FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'} else
                      'pass' if checks and states <= {'SUCCESS', 'NEUTRAL', 'SKIPPED'} else
                      'pending' if checks else 'none')
                prs.append(dict(number=p['number'], title=p['title'], base=p['baseRefName'], ci=ci))
    return dict(at=int(now), state_dirs=[str(d) for d in dirs], workers=workers, previews=previews,
                worktrees=worktrees, prs=prs)


def text(s):
    lines = []
    running = [w for w in s['workers'] if w['status'] != 'done']
    lines.append(f"Workers: {len(running)} active, {len(s['workers']) - len(running)} done")
    for w in s['workers']:
        quiet = f", log quiet {w['log_quiet_minutes']}m" if w['log_quiet_minutes'] is not None else ''
        lines.append(f"  {w['status']:8} {w['name']:18} {w['role'] or '-':14} {w['model'] or '-'} {w['effort'] or ''}"
                     f" ({w['minutes']}m{quiet})")
    lines.append('Previews: ' + (', '.join(
        p['name'] if p['state'] == 'live' else f"{p['name']} (unclear)" for p in s['previews']) or 'none'))
    lines.append(f"Worktrees: {', '.join(w['path'] for w in s['worktrees']) or 'none'}")
    if s['prs'] is not None:
        lines.append('Open PRs: ' + (', '.join(f"#{p['number']}→{p['base']} {p['ci']}" for p in s['prs']) or 'none'))
    return '\n'.join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--json', action='store_true')
    p.add_argument('--prs', action='store_true', help='also list open PRs with their CI state (gh)')
    p.add_argument('--state-dir', action='append', default=[])
    a = p.parse_args()
    s = snapshot(state_dirs(a.state_dir), a.prs)
    print(json.dumps(s) if a.json else text(s))


if __name__ == '__main__':
    main()
