#!/usr/bin/env python3
"""worker-hygiene.sh on a throwaway git repo: a new reason-less eslint-disable and growing suppressions fail; whitespace churn is only reported."""
import subprocess
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / 'worker-hygiene.sh'
SOURCE = '\n'.join(f'export const v{i} = {i};' for i in range(20)) + '\n'


def sup(*counts, compact=False):
    """eslint-suppressions.json content as ESLint writes it: file -> rule -> {count}; compact is one line."""
    rules = ', '.join(f'"@shadcn/lint/{chr(120 + i)}": {{ "count": {c} }}' for i, c in enumerate(counts))
    if compact:
        return '{"ui/src/a.tsx":{%s}}' % ','.join(
            f'"@shadcn/lint/{chr(120 + i)}":{{"count":{c}}}' for i, c in enumerate(counts))
    return '{\n  "ui/src/a.tsx": {\n    %s\n  }\n}\n' % rules


def git(repo, *args):
    subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *args], cwd=repo, check=True,
                   capture_output=True)


def run(repo):
    r = subprocess.run(['bash', str(SCRIPT), str(repo)], env={'HYGIENE_BASE': 'base', 'PATH': '/usr/bin:/bin'},
                       capture_output=True, text=True)
    return r.returncode, r.stdout


with tempfile.TemporaryDirectory(prefix='hygiene-test-') as tmp:
    repo = Path(tmp)
    (repo / 'apps').mkdir()
    (repo / 'packages').mkdir()
    # Base has two rules (sum 9): a second-rule-only increase must fail, and pretty vs compact
    # forms of the same rules must sum identically.
    (repo / 'packages' / 'eslint-suppressions.json').write_text(sup(2, 7))
    git(repo, 'init', '-q', '-b', 'base')
    for name in ('a.ts', 'b.ts'):
        (repo / 'apps' / name).write_text(SOURCE)
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'base')
    git(repo, 'checkout', '-qb', 'feat')

    # (edit to apps/b.ts, edit to apps/a.ts, untracked apps/c.ts, suppressions JSON, untracked JSON)
    #   -> (exit code, text that must appear)
    cases = [
        ('real edit only', None, SOURCE.replace('v3 = 3', 'v3 = 33'), None, None, None, 0, 'no new eslint-disable'),
        # The whitespace-only file is the only change: `git diff -w` prints nothing (an awk NR==FNR trap).
        ('whitespace churn only', SOURCE.replace(' = ', '  =  '), None, None, None, None, 0, 'apps/b.ts: 40 changed lines'),
        ('tracked suppression', None, SOURCE + '// eslint-disable-next-line @shadcn/lint/x\n', None, None, None, 1,
         'apps/a.ts: // eslint-disable'),
        # `--` before the directive is code, not a reason.
        ('dash in code only', None, SOURCE + "const separator = '--'; // eslint-disable-line @shadcn/lint/x\n",
         None, None, None, 1, 'apps/a.ts:'),
        ('tracked empty reason', None, SOURCE + '// eslint-disable-next-line @shadcn/lint/x --   \n', None, None, None, 1,
         'apps/a.ts:'),
        ('reasoned disable passes', None, SOURCE + '// eslint-disable-next-line @shadcn/lint/x -- crash on empty scope\n',
         None, None, None, 0, 'no new eslint-disable'),
        ('untracked suppression', None, None, '// eslint-disable @shadcn/lint/z\n', None, None, 1, 'apps/c.ts:1:'),
        ('untracked empty reason', None, None, '// eslint-disable @shadcn/lint/z -- \n', None, None, 1, 'apps/c.ts:1:'),
        ('untracked dash in code', None, None, "const sep = '--'; // eslint-disable @shadcn/lint/z\n", None, None, 1,
         'apps/c.ts:1:'),
        # Second rule grows while the first stays at 2: sum 9 -> 10 must fail (pretty and compact alike).
        ('second rule grows', None, None, None, sup(2, 8), None, 1, 'eslint-suppressions.json grew'),
        ('second rule grows compact', None, None, None, sup(2, 8, compact=True), None, 1, 'eslint-suppressions.json grew'),
        ('same sum compact passes', None, None, None, sup(2, 7, compact=True), None, 0, 'no new eslint-disable'),
        ('suppressions prune', None, None, None, sup(1, 0), None, 0, 'no new eslint-disable'),
        # A new untracked file with counts 0 and 1 sums to 1 and must fail.
        ('untracked new json', None, None, None, None, sup(0, 1, compact=True), 1, 'new eslint-suppressions.json'),
    ]
    for label, b, a, c, pkg, u, code, needle in cases:
        git(repo, 'checkout', '-q', '--', '.')
        (repo / 'apps' / 'c.ts').unlink(missing_ok=True)
        (repo / 'apps' / 'eslint-suppressions.json').unlink(missing_ok=True)
        if b is not None:
            (repo / 'apps' / 'b.ts').write_text(b)
        if a is not None:
            (repo / 'apps' / 'a.ts').write_text(a)
        if c is not None:
            (repo / 'apps' / 'c.ts').write_text(c)
        if pkg is not None:
            (repo / 'packages' / 'eslint-suppressions.json').write_text(pkg)
        if u is not None:
            (repo / 'apps' / 'eslint-suppressions.json').write_text(u)
        got, out = run(repo)
        assert got == code and needle in out, (label, got, out)
    print(f'PASS: worker-hygiene {len(cases)} cases')
