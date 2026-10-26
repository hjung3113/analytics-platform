#!/usr/bin/env bash
# 713f: packages/components/src chart + table branches -> folders with __tests__/ (pure move). Idempotent; MV=mv to bypass git.
# Drawer/archetype/hook branches stay at the root for 713f2. dock/, workspace/, inspector/ are never touched.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/../../..)"
MV="${MV:-git mv}"
SRC=packages/components/src
CHART="AnalysisChart analysisChartCsv analysisChartData analysisChartFrameParts analysisChartGeometry analysisChartKinds analysisChartShared AnalysisChartFrame
annotationLayout buildChartOption chartLanes chartValueLabels EChart EChartImpl LaneTimeline laneTimelineGeometry laneTimelineRenderer LegendTree topNBar
useAnnotationEditor useChartRange usePointMenu"
TABLE="PlatformDataTable columnDef tableExport tableFit tableMessages tableUrlWarning useColumnPreferences usePagedRows useTableTransfer useWorkbookExport workbook download"
# Extra test-only members: <dir>:<file under src root>
EXTRA="table:tableUrl.test.ts table:tableUrlState.test.tsx"
export SRC CHART TABLE EXTRA MV
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { SRC, CHART, TABLE, EXTRA, MV } = process.env;
const dirOf = new Map();
for (const n of CHART.split(/\s+/)) dirOf.set(n, 'chart');
for (const n of TABLE.split(/\s+/)) dirOf.set(n, 'table');
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
    if (extra) dest = path.join(SRC, extra[0], '__tests__', base);
    else if (dirOf.has(stem)) dest = path.join(SRC, dirOf.get(stem), isTest ? '__tests__' : '', base);
  } else if (f === path.join(SRC, '__tests__/test-support.ts')) dest = path.join(SRC, 'chart/__tests__/test-support.ts');
  else if (path.dirname(f) === path.join(SRC, '__fixtures__')) dest = path.join(SRC, 'chart/__fixtures__', base);
  else if (f === path.join(SRC, 'xlsxTestReader.ts')) dest = f;
  if (dest) move.set(f, dest);
}
move.set(path.join(SRC, 'xlsxTestReader.ts'), path.join(SRC, 'table/__tests__/xlsxTestReader.ts'));
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
# xlsxTestReader now sits under __tests__/, which the build exclude already covers.
sed -i '' -e 's#, "src/xlsxTestReader.ts"##' packages/components/tsconfig.build.json
# docs/research 등 역사 문서의 파일 링크(링크 검사 대상)도 새 경로로 맞춘다.
git grep -lE "packages/components/src/(AnalysisChart|AnalysisChartFrame|EChart|LegendTree)\.tsx" -- docs | xargs -r perl -pi -e 's#(packages/components/src/)(AnalysisChartFrame|AnalysisChart|EChart|LegendTree)\.tsx#$1chart/$2.tsx#g'
