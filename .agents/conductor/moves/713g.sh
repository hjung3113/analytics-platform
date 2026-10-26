#!/usr/bin/env bash
# 713g: mock-server·http-adapter src를 갈래 폴더 + __tests__/로 옮긴다(순수 이동). 멱등.
# 사용: bash .agents/conductor/moves/713g.sh   (git 없이 옮기려면 MV=mv)
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

# 이미 옮겼으면 아무것도 하지 않는다.
if [ -d packages/mock-server/src/access ] && [ ! -e packages/mock-server/src/access.ts ]; then
  echo "713g: already moved"; exit 0
fi

# old(src 기준, 확장자 없음) -> new
MAP=$(cat <<'M'
mock-server access access/access
mock-server context-validation access/context-validation
mock-server access.test access/__tests__/access.test
mock-server audit audit/audit
mock-server audit-fixtures audit/audit-fixtures
mock-server annotations audit/annotations
mock-server audit.test audit/__tests__/audit.test
mock-server annotations.test audit/__tests__/annotations.test
mock-server actions actions/actions
mock-server jobs actions/jobs
mock-server actions.test actions/__tests__/actions.test
mock-server endpoints query/endpoints
mock-server selection-ports query/selection-ports
mock-server selection-ports.test query/__tests__/selection-ports.test
mock-server adapter.test __tests__/adapter.test
mock-server client-error.test __tests__/client-error.test
mock-server default-latency.test __tests__/default-latency.test
mock-server entity.test __tests__/entity.test
mock-server explicit-empty.test __tests__/explicit-empty.test
mock-server menu-permission.test __tests__/menu-permission.test
mock-server menu-query.test __tests__/menu-query.test
mock-server open-vocabulary.test __tests__/open-vocabulary.test
mock-server paging.test __tests__/paging.test
mock-server time-domain.test __tests__/time-domain.test
mock-server usage.test __tests__/usage.test
http-adapter session session/session
http-adapter bootstrap session/bootstrap
http-adapter session.test session/__tests__/session.test
http-adapter bootstrap.test session/__tests__/bootstrap.test
http-adapter calls calls/calls
http-adapter correlation calls/correlation
http-adapter transport calls/transport
http-adapter conversion.test __tests__/conversion.test
http-adapter menu-action.test __tests__/menu-action.test
http-adapter methods.test __tests__/methods.test
http-adapter validation.test __tests__/validation.test
http-adapter test-support __tests__/test-support
M
)
export MAP

# 1) 옛 위치에서 상대 import·재export 문자열을 새 위치 기준으로 고친다.
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const rows = process.env.MAP.trim().split('\n').map((l) => l.split(' '));
for (const pkg of ['mock-server', 'http-adapter']) {
  const src = path.resolve('packages', pkg, 'src');
  const map = new Map(rows.filter((r) => r[0] === pkg).map((r) => [path.join(src, r[1]), path.join(src, r[2])]));
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.ts'))) {
    const oldBase = path.join(src, f.replace(/\.ts$/, ''));
    const newBase = map.get(oldBase) ?? oldBase;
    const newDir = path.dirname(newBase);
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    const out = text.replace(/(from\s+|import\(\s*|vi\.mock\(\s*)'(\.{1,2}\/[^']*)'/g, (m, pre, spec) => {
      const js = spec.endsWith('.js');
      const target = path.resolve(src, js ? spec.slice(0, -3) : spec);
      const nt = map.get(target) ?? target;
      let rel = path.relative(newDir, nt).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      return `${pre}'${rel}${js ? '.js' : ''}'`;
    });
    if (out !== text) fs.writeFileSync(path.join(src, f), out);
  }
}
JS

# 2) 파일을 옮긴다.
while read -r pkg old new; do
  from="packages/$pkg/src/$old.ts"; to="packages/$pkg/src/$new.ts"
  [ -e "$from" ] || continue
  mkdir -p "$(dirname "$to")"
  $MV "$from" "$to"
done <<<"$MAP"
