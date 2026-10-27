#!/usr/bin/env bash
# 713p2: FeedbackOps 앱·패키지를 products/feedbackops/{apps,packages}에서 루트 apps/fo-*·packages/fo-*로 옮긴다
# (패키지 이름 @fops/*는 그대로). 문서(products/feedbackops/docs·*.md)는 옮기지 않는다(p3). 멱등.
# 사용: bash .agents/conductor/moves/713p2.sh   (git 없이 옮기려면 MV=mv RM=trash)
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"
RM="${RM:-git rm -rfq --ignore-unmatch}"

OLD=products/feedbackops

mvd() { # <old> <new>
  if [ -e "$1" ] && [ ! -e "$2" ]; then $MV "$1" "$2"; fi
}
mvd $OLD/apps/backend apps/fo-backend
mvd $OLD/apps/frontend apps/fo-frontend
mvd $OLD/packages/shared packages/fo-shared
mvd $OLD/packages/ui packages/fo-ui
# 추적되지 않는 로컬 파일(설치된 node_modules, .env 등)은 git 밖에서 따라간다.
for pair in apps/backend:apps/fo-backend apps/frontend:apps/fo-frontend packages/shared:packages/fo-shared packages/ui:packages/fo-ui; do
  o="$OLD/${pair%%:*}"; n="${pair##*:}"
  if [ -d "$o" ] && [ -d "$n" ]; then
    for f in $(ls -A "$o"); do
      [ -e "$n/$f" ] || mv "$o/$f" "$n/$f"
    done
    rmdir "$o" 2>/dev/null || true
  fi
done
rmdir $OLD/apps $OLD/packages 2>/dev/null || true

# 경로 치환. 전체 경로 `products/feedbackops/{apps,packages}/…`는 어느 파일에서든 새 경로로 바뀐다(`../` 깊이는 루트 기준이라 그대로).
# 문서·잠금 파일·소개 사이트·archive는 건드리지 않는다(문서는 p3, 잠금 파일은 pnpm install).
subst_full() { # <file…>
  perl -pi \
    -e 's#products/feedbackops/apps/backend#apps/fo-backend#g;' \
    -e 's#products/feedbackops/apps/frontend#apps/fo-frontend#g;' \
    -e 's#products/feedbackops/packages/shared#packages/fo-shared#g;' \
    -e 's#products/feedbackops/packages/ui#packages/fo-ui#g;' \
    -e 's#products/feedbackops/apps/\*#apps/fo-*#g;' "$@"
}
FILES=$(git grep --untracked -lE 'products/feedbackops/(apps|packages)' -- . \
  ':!pnpm-lock.yaml' ':!*.md' ':!site' ':!archive' ':!docs' ':!.planning' ':!products/feedbackops/docs' ':!.agents/conductor/moves' ':!pnpm-workspace.yaml' \
  || true)
# shellcheck disable=SC2086
[ -z "$FILES" ] || subst_full $FILES
# 규칙 문서 네 개와 conductor 설명은 경로를 말하는 md라서 따로 고친다.
subst_full .claude/rules/fo-*.md .agents/conductor/addenda/impl-rules-fo.md .agents/conductor/PROFILE.md

# pnpm-workspace.yaml: FO 앱·패키지는 apps/*·packages/*가 이미 포함한다.
perl -ni -e 'print unless m#^\s*-\s*products/feedbackops/(apps|packages)/\*\s*$#' pnpm-workspace.yaml

echo "713p2: moved; run the per-file steps appended below"

# 이동한 FO 앱·패키지 안의 짧은 경로(`apps/backend/…`, `packages/shared/…`)를 새 이름으로. 마이그레이션은 내용 불변(drift gate가 해시)이라 건드리지 않는다.
# `packages/ui`는 FO UI(@fops/ui)와 플랫폼 @ap/ui가 섞여 있어 아래에서 파일별로 고친다.
FOFILES=$(find apps/fo-backend apps/fo-frontend packages/fo-shared packages/fo-ui -type f \
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.turbo/*' -not -path 'apps/fo-backend/migrations/*' \
  -not -path '*/baselines/*' \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' -o -name '*.json' -o -name '*.md' \
  -o -name '*.css' -o -name '*.sh' -o -name '*.yml' -o -name '*.conf' -o -name 'Dockerfile' \) -print)
echo "$FOFILES" | while IFS= read -r f; do
  perl -pi \
    -e 's#(?<![\w/.-])apps/backend\b#apps/fo-backend#g;' \
    -e 's#(?<![\w/.-])apps/frontend\b#apps/fo-frontend#g;' \
    -e 's#(?<![\w/.-])packages/shared\b#packages/fo-shared#g;' "$f"
done

# ── 파일별 규칙 ──────────────────────────────────────────────────────────────
# 깊이: apps/fo-*·packages/fo-*는 저장소 루트에서 두 단계다(옛 products/feedbackops/apps/*는 네 단계).
for f in apps/fo-backend/tsconfig.json apps/fo-frontend/tsconfig.json packages/fo-shared/tsconfig.json packages/fo-ui/tsconfig.json; do
  perl -pi -e 's#"\.\./\.\./\.\./\.\./ops/feedbackops/tsconfig\.base\.json"#"../../ops/feedbackops/tsconfig.base.json"#' "$f"
done
perl -pi -e 's#"rootDir": "\.\./\.\./\.\./\.\."#"rootDir": "../.."#' apps/fo-backend/tsconfig.platform-tests.json
perl -pi -e 's#\.\./\.\./\.\./\.\./ops/feedbackops/scripts#../../ops/feedbackops/scripts#' apps/fo-backend/package.json apps/fo-frontend/package.json
perl -pi -e "s#'\.\./\.\./\.\./\.\./\.\./\.\./ops/feedbackops/\.env\.example'#'../../../../ops/feedbackops/.env.example'#" \
  apps/fo-backend/src/__tests__/env-example-loads.test.ts apps/fo-backend/src/__tests__/env-example-completeness.test.ts
# 테스트들의 REPO_ROOT는 이제 저장소 루트다(깊이 그대로, retired-codes gate도 5단계 그대로). `join(…, 'apps', 'backend')`형을 고친다.
perl -pi \
  -e "s#'apps', 'backend'#'apps', 'fo-backend'#; s#'apps', 'frontend'#'apps', 'fo-frontend'#;" \
  -e "s#'packages', 'shared'#'packages', 'fo-shared'#; s#'packages', 'ui'#'packages', 'fo-ui'#;" \
  packages/fo-shared/src/errors/__tests__/retired-codes-gate.test.ts
# FO UI(@fops/ui)를 가리키는 packages/ui → packages/fo-ui (플랫폼 @ap/ui의 packages/ui는 그대로).
perl -pi -e "s#'packages/ui/src'#'packages/fo-ui/src'#" apps/fo-frontend/src/__tests__/unregistered-tailwind-classes.test.ts
perl -pi -e "s#/packages/ui/package\.json#/packages/fo-ui/package.json#" apps/fo-frontend/src/__tests__/token-class-coverage.test.ts
perl -pi -e "s#\\.\\./\\.\\./\\.\\./packages/ui/src#../../../packages/fo-ui/src#" apps/fo-frontend/src/styles.css
perl -pi -e 's#\.\./\.\./apps/frontend/src/styles\.css#../../apps/fo-frontend/src/styles.css#' packages/fo-ui/components.json
# FO UI를 말하는 주석·문서(@ap/ui가 아닌 쪽)
perl -pi -e 's#(?<![\w/.-])packages/ui\b#packages/fo-ui#g' \
  apps/fo-frontend/AGENTS.md apps/fo-frontend/src/features/tasks/AGENTS.md \
  apps/fo-frontend/tests/visual/home.visual.spec.ts \
  apps/fo-frontend/src/features/tasks/components/MilestoneStatusBadge.tsx \
  apps/fo-frontend/src/features/tasks/components/MilestoneIdentity.tsx \
  apps/fo-frontend/src/features/voc/components/detail/__tests__/ComposerDirtyConfirmation.test.tsx \
  apps/fo-frontend/src/lib/layout/AppFrame.tsx apps/fo-frontend/src/routes/__root.tsx \
  apps/fo-frontend/src/components-test-pickers.test.tsx \
  packages/fo-ui/__tests__/pickers.test.tsx \
  packages/fo-ui/src/rich-content/__tests__/allowlist-drift.test.ts \
  packages/fo-ui/src/rich-content/allowlist-local.ts \
  packages/fo-ui/src/styles/__tests__/token-fidelity.test.ts

# Dockerfile 두 개: FO 경로는 새 이름으로, 플랫폼 packages/ui는 그대로.
for f in apps/fo-backend/Dockerfile apps/fo-frontend/Dockerfile; do
  perl -pi \
    -e 's#products/feedbackops/apps/backend#apps/fo-backend#g; s#products/feedbackops/apps/frontend#apps/fo-frontend#g;' \
    -e 's#products/feedbackops/packages/shared#packages/fo-shared#g; s#products/feedbackops/packages/ui#packages/fo-ui#g;' "$f"
done

# .oxlintrc.json: FO UI 소스 override와 안내 문구.
perl -pi -e 's#\*\*/packages/ui/src/\*\*#**/packages/fo-ui/src/**#; s#New tokens go in packages/ui/src/styles#New tokens go in packages/fo-ui/src/styles#' ops/feedbackops/.oxlintrc.json

# .dockerignore: 빌드 컨텍스트는 FO 앱·패키지 네 곳(플랫폼 !packages/ui는 프런트 이미지가 쓴다).
perl -0pi \
  -e 's#^!products/feedbackops\n#!apps/fo-backend\n!apps/fo-frontend\n!packages/fo-shared\n!packages/fo-ui\n#m;' \
  -e 's#^products/feedbackops/\.(review|claude)\n##mg; s#^products/feedbackops/docs\n##m;' .dockerignore

# conductor: prefix 목록에 apps/fo-·packages/fo-를 더하고, 앱 위치를 말하는 문장을 맞춘다.
perl -0pi -e 's#("prefix": \[\n(\s+)"products/feedbackops/",\n)(?!\s+"apps/fo-")#$1$2"apps/fo-",\n$2"packages/fo-",\n#g' .agents/conductor/conductor.json
perl -pi \
  -e 's#FeedbackOps apps and packages live in products/feedbackops/ and its tools#FeedbackOps apps and packages live in apps/fo-* and packages/fo-* and its tools#;' .agents/conductor/scripts/fo-prepare.sh
perl -pi \
  -e 's#FeedbackOps `products/feedbackops/`도 루트#FeedbackOps(`apps/fo-*`·`packages/fo-*`)도 루트#;' \
  -e 's#FeedbackOps\(앱·패키지 `products/feedbackops/`, 도구#FeedbackOps(앱·패키지 `apps/fo-*`·`packages/fo-*`, 도구#;' \
  -e 's#`products/feedbackops/\*\*`, `ops/feedbackops/\*\*`, `packages/\{ui,#`products/feedbackops/**`, `apps/fo-*/**`, `packages/fo-*/**`, `ops/feedbackops/**`, `packages/{ui,#;' \
  -e 's#`flags.submodule`\(`products/feedbackops/`·`ops/feedbackops/` 변경\)#`flags.submodule`(`products/feedbackops/`·`apps/fo-*`·`packages/fo-*`·`ops/feedbackops/` 변경)#;' \
  -e 's#FeedbackOps 화면\(`products/feedbackops/\*\*`\)#FeedbackOps 화면(`apps/fo-frontend/**`)#;' \
  -e 's#products/feedbackops/node_modules apps/fo-\*/node_modules products/feedbackops/packages/\*/node_modules#products/feedbackops/node_modules apps/fo-*/node_modules packages/fo-*/node_modules#;' \
  -e 's#`products/feedbackops/\*\*`의 관련 없는 파일#`products/feedbackops/**`·`apps/fo-*`의 관련 없는 파일#;' .agents/conductor/PROFILE.md
perl -pi \
  -e 's#FeedbackOps is `products/feedbackops/` \(apps, packages, docs\)#FeedbackOps is `apps/fo-backend`, `apps/fo-frontend`, `packages/fo-shared`, `packages/fo-ui` (apps, packages) and `products/feedbackops/` (docs)#;' \
  -e 's#(?<=or changed under )`products/feedbackops/`#`apps/fo-*`, `packages/fo-*` or `products/feedbackops/`#;' .agents/conductor/addenda/impl-rules-fo.md

# ops/feedbackops/conductor: 옛 FO 저장소 기준 경로를 새 이름으로.
OPSC=$(find ops/feedbackops/conductor -type f \( -name '*.json' -o -name '*.md' -o -name '*.sh' -o -name '*.mjs' -o -name '*.py' \) -not -path '*/node_modules/*')
echo "$OPSC" | while IFS= read -r f; do
  perl -pi \
    -e 's#(?<![\w/.-])apps/backend\b#apps/fo-backend#g; s#(?<![\w/.-])apps/frontend\b#apps/fo-frontend#g;' \
    -e 's#(?<![\w/.-])packages/shared\b#packages/fo-shared#g; s#(?<![\w/.-])packages/ui\b#packages/fo-ui#g;' "$f"
done
# ops/feedbackops/scripts 의 주석·문서 속 옛 이름(동작 코드는 paths.mjs를 쓴다).
perl -pi -e 's#(?<![\w/.-])apps/frontend\b#apps/fo-frontend#g; s#(?<![\w/.-])apps/backend\b#apps/fo-backend#g; s#(?<![\w/.-])packages/ui(?=/components\.json|/src)#packages/fo-ui#g' ops/feedbackops/scripts/gates/AGENTS.md

# fe-biome-gate allowlist: 키(줄 첫 토큰)만 새 접두로. `docs/...` 키는 문서가 p3까지 제자리라 FO_ALLOWLIST_PREFIX(products/feedbackops/)가 그대로 벗겨 준다.
perl -pi \
  -e 'next if /^#/; s#^apps/backend/#apps/fo-backend/#; s#^apps/frontend/#apps/fo-frontend/#; s#^packages/shared/#packages/fo-shared/#; s#^packages/ui/#packages/fo-ui/#;' \
  ops/feedbackops/scripts/gates/frontend-biome-allowlist.txt

# .claude/rules: 본문 경로와 "relative to" 문장.
perl -pi \
  -e 's#(?<![\w/.-])apps/backend\b#apps/fo-backend#g; s#(?<![\w/.-])apps/frontend\b#apps/fo-frontend#g;' \
  -e 's#(?<![\w/.-])packages/ui\b#packages/fo-ui#g; s#"products/feedbackops/scripts/db/\*\*"#"ops/feedbackops/scripts/db/**"#;' \
  -e 's#^Paths below are relative to `products/feedbackops/` \(moved from#Paths below are relative to the repository root (FeedbackOps moved from#;' .claude/rules/fo-*.md

# FeedbackOps CI: 새 경로에서도 돌린다(products/feedbackops/**는 문서가 있어 p3까지 유지). 소개 사이트 데모는 FO 프런트 소스를 번들한다.
perl -0pi -e "s#( +)- 'products/feedbackops/\*\*'\n(?! +- 'apps/fo-)#\$1- 'products/feedbackops/**'\n\$1- 'apps/fo-*/**'\n\$1- 'packages/fo-*/**'\n#g" .github/workflows/feedbackops.yml
perl -pi -e 's#\|products/feedbackops\)/\x27#|apps/fo-frontend|products/feedbackops)/\x27#; s#\^\(menus\|packages\|apps/platform-web\|site#^(menus|packages|apps/fo-frontend|apps/platform-web|site#; s#\|apps/fo-frontend\|products#|products#' .github/workflows/ci.yml

# 경로 지도(paths.sh/paths.mjs): 네 값이 새 위치. 허용 목록 접두(products/feedbackops/)는 docs 키(p3까지 제자리) 때문에 그대로다.
perl -pi -e 's#^(FO_(?:BACKEND|FRONTEND|SHARED|UI))=products/feedbackops/(?:apps|packages)/(\w+)$#my %n=(backend=>"apps/fo-backend",frontend=>"apps/fo-frontend",shared=>"packages/fo-shared",ui=>"packages/fo-ui"); "$1=$n{$2}"#e' ops/feedbackops/paths.sh
perl -pi -e "s#^(export const FO_(?:BACKEND|FRONTEND|SHARED|UI) = )'products/feedbackops/(?:apps|packages)/(\\w+)';#my %n=(backend=>'apps/fo-backend',frontend=>'apps/fo-frontend',shared=>'packages/fo-shared',ui=>'packages/fo-ui'); \"\$1'\$n{\$2}';\"#e" ops/feedbackops/paths.mjs
perl -pi -e 's#^\# Step 713p2 moves the apps and packages by changing the four FO_\* values \(and paths.mjs\) only\.#\# 713p2 moved the apps and packages to apps/fo-* and packages/fo-* (the four FO_* values); the docs stay until 713p3.#' ops/feedbackops/paths.sh
perl -pi \
  -e 's#^// Step 713p2 moves the apps and packages by changing the FO_\* values \(and paths.sh\) only\.#// 713p2 moved the apps and packages to apps/fo-* and packages/fo-* (the four FO_* values); the docs stay until 713p3.#;' \
  -e 's#^// The allowlist \(scripts/gates/frontend-biome-allowlist.txt\) still names files relative to the old FeedbackOps root;#// The allowlist (scripts/gates/frontend-biome-allowlist.txt) names apps and packages by their repository path and the docs#;' \
  -e 's#^// 713p2 changes this prefix together with the allowlist lines\.#// by the old FeedbackOps root (this prefix); 713p3 moves the docs and retires the prefix.#;' ops/feedbackops/paths.mjs
perl -pi -e 's#// Allowlist lines name files relative to the old FeedbackOps root; 713p2 moves that prefix with the files\.#// Allowlist lines name apps and packages by repository path and docs relative to the old FeedbackOps root (713p3 moves the docs).#' ops/feedbackops/scripts/gates/fe-biome-gate.mjs

# .gitignore: products/feedbackops/.gitignore의 경로 고정 항목은 앱 이동 뒤 앱에 닿지 않으므로 루트 .gitignore로 옮긴다(멱등: 표지 줄로 판단).
if ! grep -q '^# FeedbackOps (713p2)' .gitignore; then
  cat >> .gitignore <<'GI'

# FeedbackOps (713p2): products/feedbackops/.gitignore의 경로 고정 항목 (앱이 apps/fo-*로 이동)
# TanStack Router generated route tree
apps/fo-frontend/src/routeTree.gen.ts
# Pre-bundled Drizzle schema consumed by drizzle-kit (apps/fo-backend/scripts/bundle-schema.mjs)
apps/fo-backend/.drizzle-schema/
# Unanchored entries of the old file, kept at every depth under the FO apps and packages (the platform has its own rules)
apps/fo-*/**/.vite
apps/fo-*/**/report/
apps/fo-*/**/coverage
apps/fo-*/**/build
apps/fo-*/**/*.log
apps/fo-*/**/smoke-*.png
apps/fo-*/**/visual-*.png
packages/fo-*/**/.vite
packages/fo-*/**/report/
packages/fo-*/**/coverage
packages/fo-*/**/build
packages/fo-*/**/*.log
# The bridge entry `@fops/frontend/operator-screens/coverage` (#762 c) is source, not a test-coverage report.
!apps/fo-frontend/src/operator-screens/coverage/
# .env files of the old file, at every depth under the FO apps and packages (.env.example stays tracked)
apps/fo-*/**/.env
apps/fo-*/**/.env.local
apps/fo-*/**/.env.*.local
apps/fo-*/**/.env.release
packages/fo-*/**/.env
packages/fo-*/**/.env.local
packages/fo-*/**/.env.*.local
packages/fo-*/**/.env.release
GI
fi

# fo-bridge 그래프 테스트: FO 기준 디렉터리가 저장소 루트가 된다.
perl -pi \
  -e "s#new URL\\('\\.\\./\\.\\./\\.\\./products/feedbackops', import\\.meta\\.url\\)#new URL('../../..', import.meta.url)#;" \
  -e "s#join\\(FO, 'apps/frontend/src'\\)#join(FO, 'apps/fo-frontend/src')#; s#join\\(FO, 'packages/ui/src/index\\.ts'\\)#join(FO, 'packages/fo-ui/src/index.ts')#;" \
  -e "s#join\\(FO, 'packages/shared/src/index\\.ts'\\)#join(FO, 'packages/fo-shared/src/index.ts')#; s#toContain\\('packages/shared/src/notifications\\.ts'\\)#toContain('packages/fo-shared/src/notifications.ts')#;" \
  packages/fo-bridge/src/fo-entry-graph.test.ts
# 남은 설명 문구
perl -pi -e 's#FO `apps/frontend/package\.json`#FO `apps/fo-frontend/package.json`#' .agents/conductor/LANES.md .agents/conductor/PROFILE.md
perl -pi -e 's#(?<![\w/.-])apps/backend\b#apps/fo-backend#g' .agents/conductor/addenda/impl-rules-fo.md ops/feedbackops/scripts/db/init.sql ops/feedbackops/scripts/gates/db-migration-drift-gate.mjs
# products/feedbackops/.gitignore: 루트 .gitignore로 옮긴 경로 고정 항목을 지운다(나머지는 p3).
perl -ni -e 'print unless m{^(!apps/frontend/src/operator-screens/coverage/|apps/frontend/src/routeTree\.gen\.ts|apps/backend/\.drizzle-schema/)$} || m{^# (The bridge entry `\@fops/frontend/operator-screens/coverage`|TanStack Router generated route tree|Pre-bundled Drizzle schema consumed by drizzle-kit)}' products/feedbackops/.gitignore

# check-boundaries.mjs: 앱 간 import 규칙이 형제 앱 폴더 이름을 경로 지도에서 읽게 한다(멱등: siblingImport 유무로 판단).
CB=ops/feedbackops/scripts/check-boundaries.mjs
if ! grep -q 'const siblingImport' "$CB"; then
  perl -0pi -e 's#(const BACKEND_MODULES = [^\n]*\n)#$1// An app reaches its sibling app as `../../<folder>/…` (both live under apps/), so the pattern names the sibling by its\n// folder in the path map.\nconst siblingImport = (dir) => new RegExp(`from\\\\s+[\x27"]\\\\.\\\\./\\\\.\\\\./\${basename(dir)}/`);\n#; s#/from\\s\+\[\x27"\]\\\.\\\.\\/\\\.\\\.\\/backend\\/\/#siblingImport(FO_BACKEND)#; s#/from\\s\+\[\x27"\]\\\.\\\.\\/\\\.\\\.\\/frontend\\/\/#siblingImport(FO_FRONTEND)#; s#must not import apps/backend\x27#must not import apps/fo-backend\x27#; s#must not import \@fops/ui or apps/frontend\x27#must not import \@fops/ui or apps/fo-frontend\x27#' "$CB"
fi
