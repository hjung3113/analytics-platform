#!/usr/bin/env bash
# 713m: 공간 id analytics→mars, metrics→bravo (ADR-0090 D3)와 menus 폴더 이름. 그룹 id·권한 id·메뉴 경로·패키지 이름은 그대로. 멱등.
# 사용: bash .agents/conductor/moves/713m.sh   (git 없이 옮기려면 MV=mv)
# 문맥별 규칙만 쓴다: spaceId('…')·space: '…'·.gen-menu.json "space"·FEEDBACKOPS_MANAGED_SYSTEMS 키·menus 폴더 경로.
# 규칙으로 안 되는 문장·테스트 수정과 커널 이행 코드는 713m-config.patch가 맡는다(스크립트 뒤에 적용). docs/adr/**·moves/**·.review/**는 건드리지 않는다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

# 1) 폴더: menus/analytics/<g> → menus/mars/<g>, menus/metrics/metrics → menus/bravo/metrics.
move_group() { # <옛 공간 폴더> <새 공간 폴더> <그룹 폴더>
  local src="menus/$1/$3" dst="menus/$2/$3"
  [ -e "$src" ] || return 0
  mkdir -p "menus/$2"
  $MV "$src" "$dst"
}
for g in analytics equipment hw-time master-data; do move_group analytics mars "$g"; done
move_group metrics bravo metrics
rmdir menus/analytics menus/metrics 2>/dev/null || true

# 2) 코드·설정: 공간 id가 값으로 쓰이는 문맥만. 그룹 id(groupId('analytics'))와 권한 id는 패턴에 걸리지 않는다.
CODE=$(git ls-files -co --exclude-standard | grep -E '\.(ts|tsx|mjs|json)$' | grep -vE '^(docs/adr/|\.review/|\.agents/conductor/moves/|tooling/sdk/api/)' || true)
for f in $CODE; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  perl -pi -e "s{spaceId\\('analytics'\\)}{spaceId('mars')}g; s{spaceId\\('metrics'\\)}{spaceId('bravo')}g; s{\\bspace: 'analytics'}{space: 'mars'}g; s{\\bspace: 'metrics'}{space: 'bravo'}g; s{\"space\": \"analytics\"}{\"space\": \"mars\"}g; s{\"space\": \"metrics\"}{\"space\": \"bravo\"}g" "$f"
done

# 3) FEEDBACKOPS_MANAGED_SYSTEMS 키는 공간 id다.
FO=apps/platform-web/src/feedbackops-systems.ts
if [ -f "$FO" ]; then
  perl -pi -e "s{^  analytics: '}{  mars: '}; s{^  metrics: '}{  bravo: '}" "$FO"
fi

# 4) gen-menu 도구·테스트의 폴더 경로(menus/<공간>/…)는 공간 폴더다.
for f in $(git ls-files -co --exclude-standard tooling/gen-menu | grep -E '\.(ts|mjs)$'); do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  perl -pi -e "s{'menus', 'analytics'}{'menus', 'mars'}g; s{menus/analytics/}{menus/mars/}g;" "$f"
  perl -pi -e 's{menus\\/analytics\\/}{menus\\/mars\\/}g' "$f"
done

# 5) 문서·지침·소개 사이트·테스트 설명의 현재형 폴더 경로(잠금 파일은 pnpm install이 다시 쓴다). docs/adr/**는 과거 결정이라 건드리지 않는다.
DOCS=$(git ls-files -co --exclude-standard | grep -E '\.(md|html|ts|tsx|mjs|js)$' | grep -vE '^(docs/adr/|\.review/|\.agents/conductor/moves/)' || true)
for f in $DOCS; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  perl -pi -e 's{menus/analytics/(analytics|equipment|hw-time|master-data)\b}{menus/mars/$1}g; s{menus/metrics/metrics\b}{menus/bravo/metrics}g' "$f"
done

# 손 편집(커널 이행 코드·테스트, 문맥 치환이 안 되는 테스트, 문서 줄, API 스냅샷): 위 규칙의 결과와 검토된 결과의 차이를 patch로 둔다.
# git apply(BSD patch 아님: -R dry run이 tty 없이 미적용 트리를 '이미 적용'으로 오판한다). pnpm-lock.yaml은 pnpm install이 다시 쓴다(EV integrity 해시 6개는 origin/main 값으로 복원).
PATCH=.agents/conductor/moves/713m-config.patch
if [ -f "$PATCH" ]; then
  if git apply -p1 -R --check "$PATCH" >/dev/null 2>&1; then
    echo "713m: config patch already applied"
  else
    git apply -p1 --whitespace=nowarn "$PATCH"
    echo "713m: config patch applied"
  fi
fi
