#!/usr/bin/env bash
# 713p1: FeedbackOps 루트 도구(package.json, biome, scripts, deploy, compose, conductor …)를 products/feedbackops/에서
# ops/feedbackops/(워크스페이스 패키지 @fops/ops)로 옮긴다. 앱·패키지·문서는 옮기지 않는다(p2·p3). 멱등.
# 사용: bash .agents/conductor/moves/713p1.sh   (git 없이 옮기려면 MV=mv RM=trash)
# 옮기기·삭제·tsconfig/Dockerfile 치환만 한다. 스크립트 내부의 경로 지도(paths.sh/paths.mjs) 치환은 이 PR의 손 편집이다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"
RM="${RM:-git rm -rfq --ignore-unmatch}"

OLD=products/feedbackops
NEW=ops/feedbackops

mvf() { # <old-relative> <new-relative>
  if [ -e "$OLD/$1" ] && [ ! -e "$NEW/$2" ]; then
    mkdir -p "$(dirname "$NEW/$2")"
    $MV "$OLD/$1" "$NEW/$2"
  fi
}

for f in package.json biome.json .oxlintrc.json tsconfig.base.json scripts deploy \
  docker-compose.dev.yml docker-compose.release.yml .env.example .env.release.example; do
  mvf "$f" "$f"
done
mvf .claude/conductor conductor

# 추적되지 않는 로컬 파일은 git 밖에서 따라간다(.env, 설치된 node_modules). 상대 심볼릭 링크 깊이가 같아 그대로 유효하다.
for f in .env .env.release node_modules; do
  if [ -e "$OLD/$f" ] && [ ! -e "$NEW/$f" ]; then
    mkdir -p "$NEW"
    mv "$OLD/$f" "$NEW/$f"
  fi
done

# 삭제: git 훅, MCP 설정, 스크래치 .gitignore.
for f in .githooks .mcp.json .review/.gitignore; do
  if [ -e "$OLD/$f" ]; then $RM "$OLD/$f"; fi
done
rmdir "$OLD/.review" 2>/dev/null || true

# 앱·패키지 tsconfig가 새 tsconfig.base.json을 가리키게 한다(앱·패키지는 p2까지 제자리).
for d in apps/backend apps/frontend packages/shared packages/ui; do
  f="$OLD/$d/tsconfig.json"
  if [ -f "$f" ]; then
    perl -pi -e 's#"\.\./\.\./tsconfig\.base\.json"#"../../../../ops/feedbackops/tsconfig.base.json"#' "$f"
  fi
done

# Dockerfile 두 개: 루트 패키지와 tsconfig.base.json은 ops/feedbackops에서 복사한다.
for d in apps/backend apps/frontend; do
  f="$OLD/$d/Dockerfile"
  if [ -f "$f" ]; then
    perl -pi \
      -e 's#^COPY products/feedbackops/package\.json \./products/feedbackops/package\.json$#COPY ops/feedbackops/package.json ./ops/feedbackops/package.json#;' \
      -e 's#^COPY products/feedbackops/tsconfig\.base\.json \./products/feedbackops/tsconfig\.base\.json$#COPY ops/feedbackops/tsconfig.base.json ./ops/feedbackops/tsconfig.base.json#;' "$f"
  fi
done
echo "713p1: done"
