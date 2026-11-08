#!/usr/bin/env python3
# Temporary shim (conductor-engine#223): the tool lives in the engine. Removed once no running lane depends on it.
import os
import subprocess
import sys
from pathlib import Path

if not os.environ.get('CONDUCTOR_MAIN'):
    main = os.environ.get('AP_MAIN')
    if not main:
        r = subprocess.run(['git', '-C', str(Path(__file__).resolve().parent), 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                           capture_output=True, text=True)
        main = str(Path(r.stdout.strip()).parent) if r.returncode == 0 and r.stdout.strip() else ''
    if main:
        os.environ['CONDUCTOR_MAIN'] = main
tool = Path.home() / '.agents/skills/issue-wave-conductor/scripts/lanes/board.py'
os.execv(sys.executable, [sys.executable, str(tool), *sys.argv[1:]])
