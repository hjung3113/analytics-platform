#!/usr/bin/env python3
"""test-review-plan.py — the review-plan.py rule table on a throwaway git repo. Run: python3 test-review-plan.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

PLAN = Path(__file__).with_name('review-plan.py')

# (name, {path: content}, expected subset of the plan)
CASES = [
    ('docs only', {'docs/06_platform_ui_contract.md': 'x', '.planning/README.md': 'x'},
     {'code': False, 'ux': False, 'perf': False, 'flags.contract': True}),
    ('test only', {'packages/kernel/src/query.test.ts': 'x'}, {'code': True, 'ux': False, 'perf': False}),
    ('component tsx', {'packages/components/src/DrillLayout.tsx': 'export const A = 1;'},
     {'code': True, 'ux': 'required', 'flags.e2e': True}),
    ('menu screen', {'menus/analytics/src/pages/ProductivityOverview.tsx': 'x'}, {'ux': 'required', 'flags.e2e': False}),
    ('menu manifest ts', {'menus/analytics/src/index.ts': 'x'}, {'ux': 'optional'}),
    ('kernel query', {'packages/kernel/src/query.ts': 'export const q = useMenuQuery();'},
     {'ux': 'optional', 'perf': True, 'flags.e2e': True}),
    ('use hook file', {'packages/shell/src/useRecent.ts': 'x'}, {'perf': True}),
    ('dependency', {'apps/platform-web/package.json': '{}'}, {'perf': True}),
    ('permission line', {'packages/kernel/src/platform.tsx': 'const t = safeReturnTo(x);'},
     {'ux': 'optional', 'flags.permission': True}),
    ('permission path', {'menus/admin/src/pages/RoleDirectory.tsx': 'x'}, {'ux': 'required', 'flags.permission': True}),
    ('instructions', {'.agents/skills/x/SKILL.md': 'x', 'packages/ui/src/index.ts': 'x'},
     {'code': True, 'flags.instructions': True}),
    ('e2e spec only', {'apps/platform-e2e/tests/contracts.spec.ts': 'x'}, {'code': True, 'ux': False}),
]


def run(cmd, cwd):
    subprocess.run(cmd, cwd=cwd, check=True, capture_output=True)


def get(plan, key):
    for part in key.split('.'):
        plan = plan[part]
    return plan


def main():
    failures = 0
    for name, files, expected in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            run(['git', 'init', '-q', '-b', 'main'], tmp)
            run(['git', '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], tmp)
            run(['git', 'branch', 'base'], tmp)
            for path, content in files.items():
                target = Path(tmp, path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content + '\n')
            run(['git', 'add', '-A'], tmp)
            run(['git', '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'change'], tmp)
            out = subprocess.run([sys.executable, str(PLAN), tmp, '--base', 'base'], capture_output=True, text=True)
            plan = json.loads(out.stdout)
            bad = {k: (v, get(plan, k)) for k, v in expected.items() if get(plan, k) != v}
            status = 'ok' if not bad else f'FAIL {bad}'
            failures += bool(bad)
            print(f'{name}: {status}')
    print(f'{len(CASES) - failures}/{len(CASES)} passed')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
