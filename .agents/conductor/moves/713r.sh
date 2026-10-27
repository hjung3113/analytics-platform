#!/usr/bin/env bash
# 713r: packages/ 한 단계 묶기 (ADR-0090 최종 트리 첫 두 행). 멱등.
#   packages/{contracts,ui,kernel,components,shell}                 → packages/sdk/<이름>
#   packages/{mock-server,http-adapter,server-conformance,fo-bridge} → packages/adapters/<이름>
# 그대로: packages/fo-shared, packages/fo-ui (FeedbackOps, @fops/*), packages/AGENTS.md·CLAUDE.md.
# 패키지 이름(@ap/*)·exports·소스 내용은 바뀌지 않는다. 경로 문자열과 상대 경로 깊이만 바뀐다.
# 사용: bash .agents/conductor/moves/713r.sh   (git 없이 옮기려면 MV=mv)
# 규칙으로 안 되는 문장·테스트·설정 수정은 713r-config.patch가 맡는다(스크립트 뒤에 적용).
# docs/adr/**·docs/feedbackops/adr/**·moves/**·.review/**·archive/**·pnpm-lock.yaml은 치환하지 않는다(pnpm-lock.yaml은 pnpm install이 다시 쓴다).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

SDK='contracts ui kernel components shell'
ADAPTERS='mock-server http-adapter server-conformance fo-bridge'

# 1) 폴더 이동.
move_pkg() { # <이름> <묶음>
  local src="packages/$1" dst="packages/$2/$1"
  [ -e "$src" ] || return 0
  mkdir -p "packages/$2"
  $MV "$src" "$dst"
}
for p in $SDK; do move_pkg "$p" sdk; done
for p in $ADAPTERS; do move_pkg "$p" adapters; done

# 2) 저장소 루트 기준 경로: packages/<이름> → packages/sdk|adapters/<이름>.
#    FeedbackOps 쪽 옛 이름(`FeedbackOps packages/ui`, products/feedbackops/packages/ui)과 EV(@eqv/)·FO 옛 packages/shared 줄은 건드리지 않는다.
#    packages/{a,b,c} 묶음은 이름이 모두 한 쪽일 때만 바꾼다.
TEXT=$(git ls-files -co --exclude-standard | grep -E '(\.(md|ts|tsx|mjs|cjs|js|json|yml|yaml|sh|html|css)|(^|/)Dockerfile|(^|/)\.dockerignore)$' \
  | grep -vE '^(docs/adr/|docs/feedbackops/adr/|\.review/|\.agents/conductor/moves/|archive/|tooling/sdk/api/)' \
  | grep -vE '^(pnpm-lock\.yaml|ops/feedbackops/scripts/check-boundaries\.mjs|ops/feedbackops/scripts/gates/AGENTS\.md)$' || true)
for f in $TEXT; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  grep -q 'packages/' "$f" || continue
  perl -pi -e '
    unless (/\@eqv\/|packages\/shared/) {
      s{(?<![\w-])(?<!feedbackops/)(?<!FeedbackOps )(?<!FeedbackOps `)packages/(contracts|ui|kernel|components|shell)(?![\w-])}{packages/sdk/$1}g;
      s{(?<![\w-])(?<!feedbackops/)packages/(mock-server|http-adapter|server-conformance|fo-bridge)(?![\w-])}{packages/adapters/$1}g;
      s{(?<![\w-])packages/\{([^{}]*)\}}{
        my $l = $1;
        my @n = split /,/, $l;
        my %s = map { $_ => 1 } qw(contracts ui kernel components shell);
        my %a = map { $_ => 1 } qw(mock-server http-adapter server-conformance fo-bridge);
        (@n == grep { $s{$_} } @n) ? "packages/sdk/{$l}" : (@n == grep { $a{$_} } @n) ? "packages/adapters/{$l}" : "packages/{$l}";
      }ge;
    }' "$f"
done

# 3) 한 단계 깊어진 상대 경로(패키지 안 파일). 새 위치의 파일에만, 바꾼 줄이 다시 걸리지 않는 패턴으로 쓴다.
for p in $SDK; do
  f="packages/sdk/$p/package.json"
  [ -f "$f" ] && perl -pi -e 's{node \.\./\.\./tooling/sdk/sdk-finalize-dist\.mjs}{node ../../../tooling/sdk/sdk-finalize-dist.mjs}' "$f"
done
for f in packages/sdk/ui/turbo.json packages/adapters/fo-bridge/turbo.json; do
  [ -f "$f" ] && perl -pi -e 's{"\.\./\.\./node_modules/turbo/schema\.json"}{"../../../node_modules/turbo/schema.json"}' "$f"
done
f=packages/sdk/contracts/scripts/check-pack.mjs
[ -f "$f" ] && perl -pi -e "s{resolve\\(packageRoot, '\\.\\./\\.\\.'\\)}{resolve(packageRoot, '../../..')}" "$f"
for f in packages/sdk/ui/src/styles/removed-label-utilities.test.ts packages/sdk/ui/src/styles/tokens.test.ts; do
  [ -f "$f" ] && perl -pi -e "s{join\\(process\\.cwd\\(\\), '\\.\\./\\.\\.'\\)}{join(process.cwd(), '../../..')}" "$f"
done
FB=packages/adapters/fo-bridge
[ -f "$FB/tsconfig.json" ] && perl -pi -e 's{"\.\./\.\./apps/fo-frontend/}{"../../../apps/fo-frontend/}' "$FB/tsconfig.json"
[ -f "$FB/vitest.config.ts" ] && perl -pi -e "s{'\\.\\./\\.\\./apps/fo-frontend/src'}{'../../../apps/fo-frontend/src'}" "$FB/vitest.config.ts"
[ -f "$FB/src/styles.css" ] && perl -pi -e 's{"\.\./\.\./\.\./(apps|packages)/}{"../../../../$1/}' "$FB/src/styles.css"
[ -f "$FB/src/fo-entry-graph.test.ts" ] && perl -pi -e "s{new URL\\('\\.\\./\\.\\./\\.\\.', import}{new URL('../../../..', import}" "$FB/src/fo-entry-graph.test.ts"

# 패키지 안 문서 링크(../../docs/…, ../../DESIGN.md …)는 한 단계 더 올라간다. 이미 ../../../ 인 링크는 건드리지 않는다.
for f in $(git ls-files -co --exclude-standard 'packages/sdk/*.md' 'packages/adapters/*.md'); do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  perl -pi -e 's{\]\(\.\./\.\./(?!\.\./)}{](../../../}g' "$f"
done

# 4) 규칙 모양이 다른 곳: packages/AGENTS.md 표의 폴더 칸, conductor 의존 변경 정규식.
f=packages/AGENTS.md
[ -f "$f" ] && [ ! -L "$f" ] && perl -pi -e 's{^\| `(contracts|ui|kernel|components|shell)/` }{| `sdk/$1/` }; s{^\| `(fo-bridge|mock-server|http-adapter|server-conformance)/` }{| `adapters/$1/` }' "$f"
f=.agents/conductor/conductor.json
[ -f "$f" ] && perl -pi -e 's{\^\(apps\|packages\)/\[\^/\]\+/package\\\\\.json\$}{^(apps|packages|packages/sdk|packages/adapters)/[^/]+/package\\\\.json\$}' "$f"

# 손 편집(워크스페이스 글롭, 테스트·도구의 두 단계 가정, 문장): 위 규칙의 결과와 검토된 결과의 차이를 patch로 둔다.
# git apply(BSD patch 아님: -R dry run이 tty 없이 미적용 트리를 '이미 적용'으로 오판한다). pnpm-lock.yaml은 pnpm install이 다시 쓴다(EV integrity 해시 6개는 origin/main 값으로 복원).
PATCH=.agents/conductor/moves/713r-config.patch
if [ -f "$PATCH" ]; then
  if git apply -p1 -R --check "$PATCH" >/dev/null 2>&1; then
    echo "713r: config patch already applied"
  else
    git apply -p1 --whitespace=nowarn "$PATCH"
    echo "713r: config patch applied"
  fi
fi
