#!/usr/bin/env bash
# 713f2: packages/components/src remaining branches -> archetypes/ drawer/ filters/ state/ with __tests__/ (pure move). Idempotent; MV=mv to bypass git.
# Root keeps index/testing/styles/test-setup and what dock/·workspace/ import (pageFlow visibleArea StateView RadioGroup lazyChunk) + scrollportLabel.
# dock/, workspace/, inspector/ are never touched.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/../../..)"
MV="${MV:-git mv}"
SRC=packages/components/src
ARCH="AnalysisLayout AnalysisSectionContext ManagementLayout DrillLayout PlatformPage PageContextHead headerYield"
DRAWER="DetailDrawer RowAction AuditTimeline"
FILTERS="PageFilterBar useFilterDraft QueryBarExtension querySummary OutcomeScope useCollapsePreference"
STATE="DataTrustIndicator RecoverButton StatCard copyText useElementHeight pageFocus"
# Extra test-only members: <dir>:<file under src root> ("."=src/__tests__ for tests spanning drawer and inspector)
EXTRA="drawer:Field.test.tsx .:a11y.test.tsx"
export SRC ARCH DRAWER FILTERS STATE EXTRA MV
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { SRC, ARCH, DRAWER, FILTERS, STATE, EXTRA, MV } = process.env;
const dirOf = new Map();
for (const [list, d] of [[ARCH, 'archetypes'], [DRAWER, 'drawer'], [FILTERS, 'filters'], [STATE, 'state']]) for (const n of list.split(/\s+/)) dirOf.set(n, d);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
// Build old->new for every file currently under src (already-moved files map to themselves, which keeps the run idempotent).
const move = new Map(); // current path -> new path
const root = (p) => path.dirname(p) === SRC;
for (const f of walk(SRC)) {
  const base = path.basename(f);
  let dest = null;
  if (root(f)) {
    const stem = base.split('.')[0];
    const isTest = /\.test\.tsx?$/.test(base);
    const extra = EXTRA.split(' ').map((e) => e.split(':')).find(([, file]) => file === base);
    if (extra) dest = path.join(SRC, extra[0] === '.' ? '' : extra[0], '__tests__', base);
    else if (dirOf.has(stem)) dest = path.join(SRC, dirOf.get(stem), isTest ? '__tests__' : '', base);
  }
  if (dest) move.set(f, dest);
}
const newOf = (p) => move.get(p) ?? p;
// Resolve + rewrite specifiers while files still sit at their old paths, then move.
const resolveSpec = (from, spec) => {
  const base = path.join(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
const SKIP = ['dock', 'workspace', 'inspector'].map((d) => path.join(SRC, d) + path.sep);
for (const f of walk(SRC)) {
  if (SKIP.some((s) => f.startsWith(s)) || !/\.(ts|tsx)$/.test(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  const out = text.replace(/(['"])(\.{1,2}\/[^'"\n]*)\1/g, (m, q, spec) => {
    const target = resolveSpec(f, spec);
    if (!target) return m;
    const to = newOf(target);
    let rel = path.relative(path.dirname(newOf(f)), to);
    const ext = path.extname(spec);
    const hadExt = ext === '.json' || ext === '.css';
    if (!hadExt) rel = rel.replace(/\.tsx?$/, '');
    if (path.basename(spec) === 'index') rel = rel.replace(/\.tsx?$/, '');
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
# 문서·사이트의 파일 경로 문자열(링크 검사 대상)을 새 경로로 맞춘다. 재실행해도 접두가 이미 붙은 경로는 건드리지 않는다.
export DOCMAP="AnalysisLayout:archetypes AnalysisSectionContext:archetypes ManagementLayout:archetypes DrillLayout:archetypes PlatformPage:archetypes PageContextHead:archetypes headerYield:archetypes DetailDrawer:drawer RowAction:drawer AuditTimeline:drawer PageFilterBar:filters useFilterDraft:filters QueryBarExtension:filters querySummary:filters OutcomeScope:filters useCollapsePreference:filters DataTrustIndicator:state RecoverButton:state StatCard:state copyText:state useElementHeight:state pageFocus:state"
FILES=$( (git grep -lE "components/src/[A-Za-z]" -- docs site apps packages/*/AGENTS.md packages/kernel tooling menus || true) | grep -v '^packages/components/src/' || true)
for f in $FILES; do
  perl -pi -e 'BEGIN{ %m = map { split /:/ } split / /, $ENV{DOCMAP}; } s#(components/src/)([A-Za-z]+)(?=[.\W]|$)#exists $m{$2} ? "$1$m{$2}/$2" : "$1$2"#ge' "$f"
done
# components/AGENTS.md 파일 목록: 줄머리 `Name.ext`에 폴더 접두를 붙인다.
perl -pi -e 'BEGIN{ %m = map { split /:/ } split / /, $ENV{DOCMAP}; } s#^(- `)([A-Za-z]+)(\.tsx?)#exists $m{$2} ? "$1$m{$2}/$2$3" : "$1$2$3"#e' packages/components/AGENTS.md
# 테스트 파일 경로는 소속 폴더의 __tests__/ 아래다.
for f in $FILES; do
  perl -pi -e 's#(components/src/(?:archetypes|drawer|filters|state)/)([A-Za-z]+\.(?:[A-Za-z-]+\.)?test\.tsx?)#$1__tests__/$2#g' "$f"
done
# 중괄호로 묶어 쓴 목록(위 치환이 닿지 않는 두 곳).
perl -pi -e 's#packages/components/src/\{pageFocus,PlatformPage\}\.tsx#packages/components/src/{state/pageFocus,archetypes/PlatformPage}.tsx#' docs/integration/platform-hosting-design.md
perl -pi -e 's#packages/components/src/\{AnalysisChartFrame,AuditTimeline,DataTrustIndicator,DetailDrawer,EChart,PageFilterBar,PlatformDataTable,PlatformPage,RadioGroup,StatCard,StateView,ManagementLayout,AnalysisLayout,DrillLayout\}\.tsx#packages/components/src/{chart/AnalysisChartFrame,drawer/AuditTimeline,state/DataTrustIndicator,drawer/DetailDrawer,chart/EChart,filters/PageFilterBar,table/PlatformDataTable,archetypes/PlatformPage,RadioGroup,state/StatCard,StateView,archetypes/ManagementLayout,archetypes/AnalysisLayout,archetypes/DrillLayout}.tsx#' site/SOURCES.md
