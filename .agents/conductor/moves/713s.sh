#!/usr/bin/env bash
# 713s: packages/sdk/shell/src root -> frame|context|routing|voc folders, board + components dock tests -> __tests__/ (pure move).
# Idempotent (moved files map to themselves); MV=mv bypasses git. Unknown files/folders (saved-view/, index.ts, styles.css, test-setup.ts, __fixtures__) stay put.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/../../..)"
MV="${MV:-git mv}"
SHELL_SRC=packages/sdk/shell/src
DOCK=packages/sdk/components/src/dock
FRAME="AppShell AppRail AppSidebar PlatformSidebar platformMenu systemSections SystemSwitcher HomeLink NotificationsBell unread reload trailingPeriod"
CONTEXT="ContextBarLayout GlobalContextBar ScopeSelector QueryBar QueryHistoryControl contextChip"
ROUTING="RouteOutlet RouteErrorBoundary ModuleScreen CommandPalette ScreenOutlet usageVia no-group-id-literals"
VOC="VocDrawer vocContext"
export SHELL_SRC DOCK FRAME CONTEXT ROUTING VOC MV
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { SHELL_SRC, DOCK, FRAME, CONTEXT, ROUTING, VOC, MV } = process.env;
const dirOf = new Map();
for (const [d, list] of [['frame', FRAME], ['context', CONTEXT], ['routing', ROUTING], ['voc', VOC]]) for (const n of list.split(/\s+/)) dirOf.set(n, d);
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const isTest = (b) => /\.test\.tsx?$/.test(b);
const move = new Map();
for (const f of fs.readdirSync(SHELL_SRC, { withFileTypes: true })) {
  if (!f.isFile()) continue;
  const stem = f.name.split('.')[0];
  const d = dirOf.get(stem);
  if (d) move.set(path.join(SHELL_SRC, f.name), path.join(SHELL_SRC, d, isTest(f.name) ? '__tests__' : '', f.name));
}
for (const f of walk(path.join(SHELL_SRC, 'board'))) {
  if (path.dirname(f) === path.join(SHELL_SRC, 'board') && isTest(path.basename(f))) move.set(f, path.join(SHELL_SRC, 'board/__tests__', path.basename(f)));
}
for (const f of fs.readdirSync(DOCK, { withFileTypes: true })) {
  if (f.isFile() && isTest(f.name)) move.set(path.join(DOCK, f.name), path.join(DOCK, '__tests__', f.name));
}
for (const [from, to] of move) if (from !== to && fs.existsSync(to)) throw new Error(`collision: ${to}`);
const newOf = (p) => move.get(p) ?? p;
const resolveSpec = (from, spec) => {
  const base = path.join(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const roots = [SHELL_SRC, DOCK];
for (const f of roots.flatMap(walk)) {
  if (!/\.(ts|tsx)$/.test(f) || fs.lstatSync(f).isSymbolicLink()) continue;
  const text = fs.readFileSync(f, 'utf8');
  const out = text.replace(/(['"])(\.{1,2}\/[^'"\n]*)\1/g, (m, q, spec) => {
    const target = resolveSpec(f, spec);
    if (!target) return m;
    let rel = path.relative(path.dirname(newOf(f)), newOf(target));
    const ext = path.extname(spec);
    if (!(ext === '.json' || ext === '.css')) rel = rel.replace(/\.tsx?$/, '');
    if (/^index\.tsx?$/.test(path.basename(target)) && !/(^|\/)index$/.test(spec)) rel = rel.replace(/\/index$/, '') || '.';
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel === spec ? m : `${q}${rel}${q}`;
  });
  if (out !== text) fs.writeFileSync(f, out);
}
for (const [from, to] of move) {
  if (from === to || !fs.existsSync(from)) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  execFileSync(...(MV === 'mv' ? ['mv', [from, to]] : ['git', ['mv', from, to]]));
}
JS
# vi.mock of a sibling package's node_modules path (unresolvable to the rewriter): the test moved one level deeper.
f=packages/sdk/shell/src/board/__tests__/BoardDock.test.tsx
[ -f "$f" ] && [ ! -L "$f" ] && perl -pi -e "s#'\.\./\.\./\.\./components/node_modules/dockview-react'#'../../../../components/node_modules/dockview-react'#" "$f"
true
# Current-tense docs and site links that name a moved shell source by path (ADRs and conductor patches are history and stay).
rewrite() { # <stem-list> <dir>
  local stems="${1// /|}" dir="$2"
  git grep -lE "packages/sdk/shell/src/($stems)\." -- . ':!docs/adr' ':!*.patch' ':!.agents/conductor/moves' 2>/dev/null | while read -r f; do
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    perl -pi -e "s#(packages/sdk/shell/src/)($stems)\.#\$1$dir/\$2.#g; s#(packages/sdk/shell/src/$dir/)([A-Za-z.-]+\.test\.tsx?)#\$1__tests__/\$2#g" "$f"
  done
}
rewrite "$FRAME" frame
rewrite "$CONTEXT" context
rewrite "$ROUTING" routing
rewrite "$VOC" voc
