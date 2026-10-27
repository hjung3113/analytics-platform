#!/usr/bin/env bash
# 713p3: FeedbackOps 문서(products/feedbackops/{docs/**,AGENTS,CLAUDE,DESIGN,GLOSSARY,PRODUCT,README}.md, shadcn 스킬, .gitignore)를
# docs/feedbackops/ 등 새 자리로 옮기고 경로 문자열을 고친다. products/feedbackops/를 비운다. 멱등.
# 사용: bash .agents/conductor/moves/713p3.sh   (git 없이 옮기려면 MV=mv RM="rm -rf")
# 기계 치환으로 안 되는 손 편집(설정·워크플로·게이트·문장)은 713p3-config.patch에 있고 맨 끝에서 멱등하게 적용한다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"
RM="${RM:-git rm -rfq --ignore-unmatch}"

OLD=products/feedbackops
NEW=docs/feedbackops

mvd() { # <old> <new>   (끊긴 심볼릭 링크도 옮긴다)
  if { [ -e "$1" ] || [ -L "$1" ]; } && [ ! -e "$2" ] && [ ! -L "$2" ]; then
    mkdir -p "$(dirname "$2")"
    $MV "$1" "$2"
  fi
}

# ── 이동 ────────────────────────────────────────────────────────────────────
# docs/<x> → docs/feedbackops/<x>(평탄화). 옛 docs/README.md(문서 색인)는 같은 폴더의 제품 README.md와 겹치므로 INDEX.md로 옮긴다.
if [ -d "$OLD/docs" ]; then
  for entry in $(ls -A "$OLD/docs"); do
    if [ "$entry" = README.md ]; then mvd "$OLD/docs/README.md" "$NEW/INDEX.md"; else mvd "$OLD/docs/$entry" "$NEW/$entry"; fi
  done
  rmdir "$OLD/docs" 2>/dev/null || true
fi
for f in AGENTS.md CLAUDE.md DESIGN.md GLOSSARY.md PRODUCT.md README.md; do mvd "$OLD/$f" "$NEW/$f"; done

# shadcn 스킬: 루트 .claude/skills는 ../.agents/skills로의 폴더 심볼릭 링크라 .agents/skills/shadcn 하나로 두 자리가 다 보인다.
mvd "$OLD/.agents/skills/shadcn" .agents/skills/shadcn
if [ -L "$OLD/.claude/skills/shadcn" ]; then $RM "$OLD/.claude/skills/shadcn"; fi

# .gitignore: 경로 고정 항목은 p2가 루트로 옮겼다. 남은 것 중 이 노드 뒤에도 의미가 있는 것은 docs/.llmwiki/ 하나(옛 FO 루트 기준 경로).
if [ -e "$OLD/.gitignore" ]; then
  if ! grep -qxF 'docs/feedbackops/.llmwiki/' .gitignore; then
    {
      printf '\n# FeedbackOps docs (713p3): products/feedbackops/.gitignore의 남은 항목 중 docs/.llmwiki/만 새 경로로 옮겼다.\n'
      printf '# 나머지(.claude/settings.json·.codegraph/·.playwright-mcp/·agent-workflow 심볼릭 링크·minio_data/)는 그 폴더 안에서만 뜻이 있었다.\n'
      printf 'docs/feedbackops/.llmwiki/\n'
    } >>.gitignore
  fi
  $RM "$OLD/.gitignore"
fi

# 비우기: 남은 빈 폴더를 지운다. 추적되지 않는 파일이 남아 있으면 지우지 않고 알린다.
find "$OLD" -depth -type d -empty -delete 2>/dev/null || true
rmdir products 2>/dev/null || true
if [ -e "$OLD" ]; then echo "713p3: $OLD still has files:" >&2; find "$OLD" -mindepth 1 | head >&2; fi
echo "713p3: moved"

# ── 경로 치환 ───────────────────────────────────────────────────────────────
# 규칙: 파일을 읽어 파일마다 perl 한 번. 이미 고친 문자열은 다시 맞지 않는다(멱등).
DOCS_SUB='design-prototype|adr|agents|design|frontend|implementation|tech-stack|user-guide'
FO_ROOT6="$NEW/AGENTS.md $NEW/CLAUDE.md $NEW/DESIGN.md $NEW/GLOSSARY.md $NEW/PRODUCT.md $NEW/README.md"

# (1) FO 코드·도구 안의 주석·문서·허용 목록: 옛 FO 루트 기준 docs/<x> → docs/feedbackops/<x>. 마이그레이션은 내용 불변(drift gate가 해시)이라 건드리지 않는다.
CODE_FILES=$(find apps/fo-backend apps/fo-frontend packages/fo-shared packages/fo-ui ops/feedbackops -type f \
  -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.turbo/*' -not -path 'apps/fo-backend/migrations/*' \
  -not -path '*/baselines/*' -not -path '*/test-results/*' -not -name 'routeTree.gen.ts' -not -name '*.png' \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' -o -name '*.jsx' -o -name '*.json' -o -name '*.md' -o -name '*.css' \
  -o -name '*.sh' -o -name '*.yml' -o -name '*.txt' -o -name '*.sql' -o -name 'Dockerfile' \) -print)
echo "$CODE_FILES" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  perl -pi \
    -e "s#(?<![\\w/.-])docs/($DOCS_SUB)(?![\\w-])#docs/feedbackops/\$1#g;" \
    -e 's#(?<![\w/.-])docs/(code-index|USER-MANUAL)\.md#docs/feedbackops/$1.md#g;' \
    -e 's#(?<![\w/.-])docs/README\.md#docs/feedbackops/INDEX.md#g;' "$f"
done

# (2) FO 문서 여섯 개(루트 문서): `docs/…` 상대 링크는 같은 폴더 기준으로, 본문의 `docs/<x>`는 저장소 루트 기준 docs/feedbackops/<x>로.
for f in $FO_ROOT6; do
  [ -f "$f" ] || continue
  perl -pi \
    -e 's#\]\(docs/#](#g;' \
    -e 's#^(\s*(?:sharedTypography|sharedPrimitives|consumptionContract):\s*)docs/#$1#;' \
    -e "s#(?<![\\w/.-])docs/($DOCS_SUB)(?![\\w-])#docs/feedbackops/\$1#g;" \
    -e 's#(?<![\w/.-])docs/(code-index|USER-MANUAL)\.md#docs/feedbackops/$1.md#g;' \
    -e 's#(?<![\w/.-])docs/README\.md#docs/feedbackops/INDEX.md#g;' "$f"
done

# (3) FO 문서(ADR 제외)와 여섯 문서: 코드 위치 표기 apps/backend|frontend, packages/shared|ui → apps/fo-*·packages/fo-*(p2가 못 고친 문서 쪽 잔여).
#     ADR 본문은 결정 당시의 사실이라 그대로 둔다. packages/ui는 FO UI(@fops/ui)다; 워크플로 트리거(feedbackops.yml) 줄의 packages/ui/**와 `tag sdk-v…`가 붙은 줄의 packages/ui는 플랫폼 @ap/ui다.
find "$NEW" -type f -name '*.md' -not -path "$NEW/adr/*" -not -path '*/node_modules/*' -print | while IFS= read -r f; do
  perl -pi \
    -e 's#(?<![\w/.-])apps/backend(?![\w-])#apps/fo-backend#g;' \
    -e 's#(?<![\w/.-])apps/frontend(?![\w-])#apps/fo-frontend#g;' \
    -e 's#(?<![\w/.-])packages/shared(?![\w-])#packages/fo-shared#g;' \
    -e 's#^(\d+\. )docs/README\.md$#$1docs/feedbackops/INDEX.md#;' \
    -e 'next if /feedbackops\.yml|tag `sdk-v/; s#(?<![\w/.-])packages/ui(?![\w-])#packages/fo-ui#g;' "$f"
done

# (4) FO 문서 안 링크 깊이. docs/feedbackops/ 안 파일의 폴더 깊이를 d라 하면 저장소 루트까지 `../`가 d+2번이다(옛 products/feedbackops/docs/는 d+3).
#     - 저장소 루트 docs/(플랫폼 문서)를 가리키던 `../`×(d+3): d+2로.
#     - 옛 FO 루트의 도구 파일(deploy, docker-compose.dev.yml, .env.example, scripts)을 가리키던 `../`×(d+1): ops/feedbackops/ 아래로.
#     - 문서 루트 파일(INDEX·USER-MANUAL·code-index)이 같은 폴더가 된 FO 루트 문서를 가리키던 `../X.md`: X.md로.
find "$NEW" -type f -name '*.md' -not -path '*/node_modules/*' -print | while IFS= read -r f; do
  rel=${f#"$NEW"/}
  d=$(printf '%s' "$rel" | awk -F/ '{print NF-1}')
  case "$f" in "$NEW"/AGENTS.md|"$NEW"/CLAUDE.md|"$NEW"/DESIGN.md|"$NEW"/GLOSSARY.md|"$NEW"/PRODUCT.md|"$NEW"/README.md) continue ;; esac
  old_up=$(printf '../%.0s' $(seq 1 $((d + 3))))
  new_up=$(printf '../%.0s' $(seq 1 $((d + 2))))
  tool_old_up=$(printf '../%.0s' $(seq 1 $((d + 1))))
  OLD_UP="$old_up" NEW_UP="$new_up" TOOL_OLD_UP="$tool_old_up" D="$d" perl -pi -e '
    my ($o, $n, $t) = ($ENV{OLD_UP}, $ENV{NEW_UP}, $ENV{TOOL_OLD_UP});
    s#\]\(\Q$o\Edocs/#](${n}docs/#g;
    s#\]\(\Q$t\E(deploy/|docker-compose\.dev\.yml|\.env\.example|scripts/)#](${n}ops/feedbackops/$1#g;
    if ($ENV{D} eq "0") { s#\]\(\.\./(AGENTS|CLAUDE|DESIGN|GLOSSARY|PRODUCT|README)\.md#]($1.md#g; }
  ' "$f"
done

# (5) 현재 경로를 말하는 루트 문서·도구 문서: products/feedbackops/<x> → 새 자리. 과거 사실을 적은 곳(ADR 본문, archive, 옛 worktree 주의, 이동 스크립트)은 목록에 없다.
#     문장으로 남는 나머지(저장소 구조 표, 루트 AGENTS의 FeedbackOps 절 …)는 713p3 보고서의 「손 편집」이다.
ROOT_FILES="AGENTS.md README.md DESIGN.md GLOSSARY.md docs/INDEX.md docs/AGENTS.md docs/agents/domain.md docs/agents/operations.md \
  docs/architecture/frontend-ui-ux.md docs/contract/platform-ui-contract.md packages/ui/AGENTS.md site/SOURCES.md site/index.html \
  .planning/backlog.md .agents/conductor/LANES.md .agents/conductor/PROFILE.md .agents/conductor/addenda/impl-rules-fo.md \
  ops/feedbackops/scripts/gates/AGENTS.md apps/platform-web/src/rich-content-allowlist-parity.test.ts \
  docs/integration/feedbackops-deeplink.md docs/integration/feedbackops-merge-design.md docs/integration/framework-unification-plan.md \
  docs/integration/platform-hosting-design.md docs/integration/platform-packages.md docs/integration/real-server-checklist.md \
  docs/integration/repository-layout.md"
for f in $ROOT_FILES .claude/rules/fo-*.md; do
  [ -f "$f" ] || continue
  perl -pi \
    -e 's#products/feedbackops/docs/#docs/feedbackops/#g;' \
    -e 's#products/feedbackops/(AGENTS|CLAUDE|DESIGN|GLOSSARY|PRODUCT|README)\.md#docs/feedbackops/$1.md#g;' \
    -e 's#products/feedbackops/apps/backend(?![\w-])#apps/fo-backend#g; s#products/feedbackops/apps/frontend(?![\w-])#apps/fo-frontend#g;' \
    -e 's#products/feedbackops/packages/shared(?![\w-])#packages/fo-shared#g; s#products/feedbackops/packages/ui(?![\w-])#packages/fo-ui#g;' \
    -e 's#(ADR-0043(?:, `| · ))products/feedbackops/package\.json#$1apps/fo-frontend/package.json#g;' \
    -e 's#products/feedbackops/package\.json#ops/feedbackops/package.json#g; s#products/feedbackops/scripts/#ops/feedbackops/scripts/#g;' \
    -e 's#products/feedbackops/\.claude/conductor#ops/feedbackops/conductor#g;' "$f"
done

# 플랫폼 docs/ 안의 문서에서 docs/feedbackops/를 가리키는 상대 링크는 docs/를 되짚지 않고 바로 간다(`../docs/feedbackops/` → `feedbackops/`).
find docs -type f -name '*.md' -not -path 'docs/feedbackops/*' -print | while IFS= read -r f; do
  k=$(printf '%s' "${f#docs/}" | awk -F/ '{print NF-1}')
  up=$(printf '../%.0s' $(seq 1 $((k + 1))))
  back=""; [ "$k" -eq 0 ] || back=$(printf '../%.0s' $(seq 1 "$k"))
  UP="$up" BACK="$back" perl -pi -e 's#\]\(\Q$ENV{UP}\Edocs/feedbackops/#](${\ $ENV{BACK}}feedbackops/#g' "$f"
done

# (6) 경로 읽는 법 한 줄: FO 문서 안의 본문 `docs/<x>`는 옛 FO 루트 기준이라 그대로 두었다(ADR 포함). AGENTS.md에 규칙으로 적는다.
NOTE='- Paths written as `docs/<x>` inside FeedbackOps docs name this tree (`docs/feedbackops/<x>`), and "root `AGENTS.md`" means this file. FeedbackOps code lives in `apps/fo-backend`, `apps/fo-frontend`, `packages/fo-shared`, `packages/fo-ui`; its tools in `ops/feedbackops/`; the repository root `AGENTS.md` is the platform'"'"'s.'
if [ -f "$NEW/AGENTS.md" ] && ! grep -qF 'Paths written as `docs/<x>` inside FeedbackOps docs' "$NEW/AGENTS.md"; then
  NOTE="$NOTE" perl -0pi -e 's#(new product features go to the platform\.\n)#$1$ENV{NOTE}\n#' "$NEW/AGENTS.md"
fi

echo "713p3: substituted"

# ── 손 편집(설정·워크플로·게이트·문장) ─────────────────────────────────────
# 위 규칙으로 만든 결과와 검토된 결과의 차이를 patch로 두었다(paths.{sh,mjs}, fe-biome-gate.mjs의 FO_ALLOWLIST_PREFIX 삭제, 허용 목록 접두·추가분,
# 두 워크플로, 링크 검사기, hookify 규칙, 두 conductor.json, 루트·docs 문서 문장 …). 이미 적용돼 있으면(역방향 적용이 되면) 건너뛴다.
PATCH=.agents/conductor/moves/713p3-config.patch
if [ -f "$PATCH" ]; then
  if patch -p1 -R --dry-run --silent <"$PATCH" >/dev/null 2>&1; then
    echo "713p3: config patch already applied"
  else
    patch -p1 -N --no-backup-if-mismatch <"$PATCH"
    echo "713p3: config patch applied"
  fi
fi
