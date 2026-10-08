#!/usr/bin/env python3
"""review-plan.py <checkout> [--base origin/main] [--head HEAD] — which reviewers an issue branch triggers.

Reads `git diff <base>...<head>` (file names plus added and removed lines) and prints one JSON line:
  {"ok": true, "code": bool, "ux": "required"|"optional"|false, "perf": bool, "flags": {...}, "reasons": {...}}

Rules (conductor skill step 7, ported from FeedbackOps and adapted to this repo's paths):

- **code** (`review-final`): any change except a docs-only diff. Docs-only means every changed file is Markdown or
  under `docs/` or `.planning/`; a test-only diff still gets a code review. Docs-only diffs get no review (root
  AGENTS.md: docs run docs:links only).
- **ux** (`review-ux`):
  - `required`: a non-test `.tsx` or `.css` under `packages/{ui,components,shell}/src`, `menus/*/src` or
    `apps/platform-web/src`, or the FeedbackOps gitlink (`products/feedbackops`), whose primitives `@ap/ui` re-exports.
  - `optional`: the conductor decides with a one-line reason. Non-test `.ts` in those folders, `packages/kernel/src`,
    `packages/contracts/src` and `packages/mock-server/src`: they change what a user sees without touching a component.
- **perf** (perf lens in the code reviewer's task; `review-perf` only after a measured regression):
  - a non-test change to the Kernel query lifecycle, URL or navigation (`packages/kernel/src/{query,platform,drill,
    registry}*`), or any file whose name starts with `use`;
  - a dependency change in `apps/*/package.json` or `packages/*/package.json`;
  - added or removed query calls or options (`useMenuQuery`, `useMenuFetch`, `usePlatformQuery`, `useEntityQuery`,
    `useAdapterRequest`, `menuQuery`, `getEntity`, `fetch(`, `staleTime`, `refetchInterval`, `pollInterval`).
- **flags** (informational; they steer briefs, checks and reviewer tasks):
  - `permission`: a permission, scope, role or auth path, or a line touching `permission`, `scope`, `safeReturnTo`,
    `returnTo`, `allowedRoles` or `canAccess`. Put "no restricted data may leak" first in every reviewer task;
  - `e2e`: Kernel, shell, components or mock server changed, so run the related E2E (root AGENTS.md);
  - `contract`: `docs/06_platform_ui_contract.md`, `docs/adr/` or `packages/contracts/` changed;
  - `submodule`: the FeedbackOps gitlink changed, so run root checks with `--force` (#237);
  - `instructions`: `.agents/**`, `.claude/**`, an `AGENTS.md` or a `CLAUDE.md` changed. Reviewers read these from the
    branch, so the conductor reads that diff before launching anyone.

With the default `--head HEAD`, uncommitted changes outside `.review/` make it exit 2: the previews would serve code
the plan never saw.
"""
import argparse
import json
import re
import subprocess
import sys


def git(checkout, *args):
    result = subprocess.run(['git', '-C', checkout, *args], text=True, capture_output=True)
    if result.returncode != 0:
        print(json.dumps({'ok': False, 'error': result.stderr.strip() or 'git failed'}))
        sys.exit(2)
    return result.stdout


def is_test(path):
    return bool(re.search(r'(__tests__/|\.test\.|\.spec\.|^apps/platform-e2e/|test-support/|/fixtures/)', path))


SCREEN_DIR = re.compile(r'^(packages/(ui|components|shell)/src|menus/[^/]+/src|apps/platform-web/src)/')
DATA_DIR = re.compile(r'^packages/(kernel|contracts|mock-server)/src/')
PERF_PATH = re.compile(r'^packages/kernel/src/(query|platform|drill|registry)[\w.-]*\.tsx?$')
USE_FILE = re.compile(r'(^|/)use[A-Z][\w-]*\.tsx?$')
QUERY_OPTS = re.compile(
    r'\b(useMenuQuery|useMenuFetch|usePlatformQuery|useEntityQuery|useAdapterRequest|menuQuery|getEntity'
    r'|staleTime|refetchInterval|pollInterval)\b|\bfetch\('
)
PERMISSION_PATH = re.compile(r'(permission|scope|role|(?<![a-z])auth|grant)', re.I)
PERMISSION_LINE = re.compile(r'\b(permission|scopeId|safeReturnTo|returnTo|allowedRoles|canAccess)\b')
E2E_PATH = re.compile(r'^packages/(kernel|shell|components|mock-server)/src/')
SUBMODULE = 'products/feedbackops'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('checkout')
    parser.add_argument('--base', default='origin/main')
    parser.add_argument('--head', default='HEAD')
    args = parser.parse_args()

    if args.head == 'HEAD':
        dirty = [line for line in git(args.checkout, 'status', '--porcelain').splitlines()
                 if line[3:] and not line[3:].startswith('.review/')]
        if dirty:
            print(json.dumps({'ok': False, 'error': 'uncommitted changes outside .review/; commit first',
                              'dirty': dirty[:5]}))
            sys.exit(2)

    diff_range = f'{args.base}...{args.head}'
    files = [f for f in git(args.checkout, 'diff', '--name-only', diff_range).splitlines() if f]
    changed = []  # (file, text): added/removed lines in non-test product code (apps, packages, menus); imports skipped
    current = None
    for line in git(args.checkout, 'diff', '--unified=0', diff_range).splitlines():
        if line.startswith('--- '):
            current = line[6:] if line.startswith('--- a/') else None
            continue
        if line.startswith('+++ '):
            if line.startswith('+++ b/'):
                current = line[6:]
            continue
        if (line[:1] in '+-' and current is not None and not is_test(current)
                and current.startswith(('apps/', 'packages/', 'menus/'))):
            text = line[1:].strip()
            if text.startswith('import ') or re.match(r"^[\w{},\s]*\}?\s*from\s+['\"]", text) or re.fullmatch(r'\w+,?', text):
                continue
            changed.append((current, text))

    reasons = {'code': [], 'ux': [], 'perf': []}
    flags = {'permission': False, 'e2e': False, 'contract': False, 'submodule': False, 'instructions': False}
    docs_only = all(f.endswith('.md') or f.startswith(('docs/', '.planning/')) for f in files)
    if files and not docs_only:
        reasons['code'].append('code change')

    ux_required, ux_optional = [], []
    for f in files:
        if f.startswith(('.agents/', '.claude/')) or f.endswith(('AGENTS.md', 'CLAUDE.md')):
            flags['instructions'] = True
        if f == 'docs/06_platform_ui_contract.md' or f.startswith(('docs/adr/', 'packages/contracts/')):
            flags['contract'] = True
        if f == SUBMODULE:
            flags['submodule'] = True
        if docs_only or is_test(f):
            continue
        if f.startswith(('apps/', 'packages/', 'menus/')) and PERMISSION_PATH.search(f):
            flags['permission'] = True
        if E2E_PATH.search(f):
            flags['e2e'] = True
        if f == SUBMODULE or (SCREEN_DIR.search(f) and f.endswith(('.tsx', '.css'))):
            ux_required.append(f)
        elif SCREEN_DIR.search(f) or DATA_DIR.search(f):
            ux_optional.append(f)
        if PERF_PATH.search(f) or USE_FILE.search(f):
            reasons['perf'].append(f'query/navigation path: {f}')
        if re.search(r'^(apps|packages)/[^/]+/package\.json$', f):
            reasons['perf'].append(f'dependency change: {f}')

    if any(PERMISSION_LINE.search(text) for _, text in changed):
        flags['permission'] = True
    fetching = sorted({f for f, text in changed if QUERY_OPTS.search(text)})
    if fetching:
        reasons['perf'].append('query calls or options changed: ' + ', '.join(fetching[:3]))

    reasons['ux'] = ux_required or [f'optional: {f}' for f in ux_optional]
    ux = 'required' if ux_required else ('optional' if ux_optional else False)
    for key, values in reasons.items():
        if len(values) > 6:
            reasons[key] = values[:6] + [f'… +{len(values) - 6} more']
    print(json.dumps({
        'ok': True,
        'code': bool(reasons['code']),
        'ux': ux,
        'perf': bool(reasons['perf']),
        'flags': flags,
        'reasons': reasons,
        'files': len(files),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
