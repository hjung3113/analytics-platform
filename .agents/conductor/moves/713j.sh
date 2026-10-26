#!/usr/bin/env bash
# 713j: docs/NN_*.md 17개를 종류별 폴더로 옮기고 번호 파일명을 없앤다. 내용은 경로 문자열만 바꾼다. 멱등.
# 사용: bash .agents/conductor/moves/713j.sh   (git 없이 옮기려면 MV=mv)
# origin/main이 바뀌었으면 되돌리고 다시 돌려 rebase한다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

# 이미 옮겼으면 아무것도 하지 않는다.
if [ ! -e docs/00_overview.md ] && [ -e docs/overview/overview.md ]; then
  echo "713j: already moved"; exit 0
fi

MAP=$(cat <<'M'
00_overview.md overview/overview.md
05_roadmap_and_open_questions.md overview/roadmap-and-open-questions.md
17_platform_requirements.md product/platform-requirements.md
02_domain_menus.md product/domain-menus.md
01_architecture_and_data_contract.md architecture/architecture-and-data-contract.md
03_backend_stack.md architecture/backend-stack.md
04_frontend_ui_ux.md architecture/frontend-ui-ux.md
06_platform_ui_contract.md contract/platform-ui-contract.md
07_app_shell_wireframe.md wireframes/app-shell.md
08_operations_overview_wireframe.md wireframes/operations-overview.md
09_equipment_master_wireframe.md wireframes/equipment-master.md
11_productivity_overview_wireframe.md wireframes/productivity-overview.md
12_cycle_time_drilldown_wireframe.md wireframes/cycle-time-drilldown.md
13_metric_catalog_wireframe.md wireframes/metric-catalog.md
14_drilldown_platform.md design/drilldown-platform.md
15_multi_workspace_ui.md design/multi-workspace-ui.md
16_analysis_board.md design/analysis-board.md
M
)
export MAP

# 1) 모든 텍스트 파일의 문서 경로를 새 위치 기준으로 다시 쓴다(옮기기 전, 옛 위치 기준으로 해석).
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const map = new Map(process.env.MAP.trim().split('\n').map((l) => l.split(' ')));
const newOf = (base) => `docs/${map.get(base)}`;
const moved = new Map([...map].map(([b, n]) => [`docs/${b}`, `docs/${n}`]));

const files = execFileSync('rg', ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules', '-g', '!pnpm-lock.yaml',
  '-g', '!.review', '-g', '!*.log', '-g', '!.agents/conductor/moves/'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean);

const posix = (p) => p.split(path.sep).join('/');
const rel = (fromDir, to) => {
  const r = posix(path.relative(fromDir, to));
  return r.startsWith('.') ? r : r;
};
const unresolved = [];

for (const file of files) {
  if (fs.lstatSync(file).isSymbolicLink()) continue;
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) continue;
  const text = buf.toString('utf8');
  const oldDir = posix(path.dirname(file));
  const newFile = moved.get(file) ?? file;
  const newDir = posix(path.dirname(newFile));
  let out = text;

  // (a) 옮긴 문서 안의 상대 링크는 깊이가 바뀌니 새 위치 기준으로 다시 계산한다.
  if (moved.has(file)) {
    const fix = (target) => {
      if (/^([a-z][a-z0-9+.-]*:|#|\/|\$)/i.test(target)) return target;
      const m = target.match(/^([^#?]*)(.*)$/);
      if (!m[1]) return target;
      const abs = posix(path.normalize(path.join(oldDir, m[1])));
      const dest = moved.get(abs) ?? abs;
      let r = rel(newDir, dest);
      if (m[1].endsWith('/') && !r.endsWith('/')) r += '/';
      return r + m[2];
    };
    out = out
      .replace(/(\]\()([^)\s]+)/g, (_, a, t) => a + fix(t))
      .replace(/^(\[[^\]]+\]:\s*)(\S+)/gm, (_, a, t) => a + fix(t))
      .replace(/((?:href|src)=")([^"]+)/g, (_, a, t) => a + fix(t));
  }

  // (b) 옛 파일명이 나오는 곳을 새 경로로. 번호 약칭("06 §4")은 건드리지 않는다.
  out = out.replace(/([A-Za-z0-9_./:@~-]*?)(\d\d_[a-z_]+\.md)/g, (all, prefix, base) => {
    if (!map.has(base)) return all;
    const n = map.get(base);
    if (/^https?:/.test(prefix)) return prefix + n;
    if (/(^|\/)docs\/$/.test(prefix) && !/^\.{1,2}\//.test(prefix)) return prefix + n;
    if (prefix === '') {
      if (oldDir === 'docs') return rel(newDir, newOf(base));
      return newOf(base);
    }
    if (/^\.{1,2}\//.test(prefix)) {
      const abs = posix(path.normalize(path.join(oldDir, prefix + base)));
      if (abs !== `docs/${base}`) { unresolved.push(`${file}: ${all}`); return all; }
      return rel(newDir, newOf(base));
    }
    unresolved.push(`${file}: ${all}`);
    return all;
  });

  if (out !== text) fs.writeFileSync(file, out);
}
if (unresolved.length) console.error('713j: unresolved\n' + unresolved.join('\n'));
JS

# 2) 파일을 옮긴다.
while read -r old new; do
  mkdir -p "docs/$(dirname "$new")"
  $MV "docs/$old" "docs/$new"
done <<<"$MAP"
echo "713j: moved"
