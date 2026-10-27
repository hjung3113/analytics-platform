#!/usr/bin/env bash
# 713l: SDK 도구 tooling/scripts/sdk-* → tooling/sdk/, 스냅샷 tooling/sdk-api → tooling/sdk/api. 경로 문자열만 바꾼다. 멱등.
# 사용: bash .agents/conductor/moves/713l.sh   (git 없이 옮기려면 MV=mv)
# origin/main이 바뀌었으면 되돌리고 다시 돌려 rebase한다. docs/adr/** 본문과 moves/는 건드리지 않는다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

mkdir -p tooling/sdk/api
for f in tooling/scripts/sdk-*.mjs; do
  [ -e "$f" ] && $MV "$f" "tooling/sdk/$(basename "$f")"
done
for f in tooling/sdk-api/*.api.txt; do
  [ -e "$f" ] && $MV "$f" "tooling/sdk/api/$(basename "$f")"
done
rmdir tooling/sdk-api 2>/dev/null || true

# 절대 경로 치환(sdk-api 먼저: scripts/sdk-api-snapshot 과 겹치지 않는다).
FILES="package.json turbo.json packages/*/package.json packages/*/tsconfig.build.json
tooling/sdk/sdk-api-snapshot.mjs tooling/AGENTS.md docs/integration/platform-packages.md
.agents/conductor/LANES.md .agents/conductor/PROFILE.md .planning/backlog.md
site/SOURCES.md site/index.html"
for f in $FILES; do
  [ -f "$f" ] || continue
  perl -pi -e 's{tooling/sdk-api}{tooling/sdk/api}g; s{tooling/scripts/sdk-}{tooling/sdk/sdk-}g' "$f"
done
perl -pi -e 's{node --test tooling/scripts/\*\.test\.mjs}{node --test tooling/sdk/*.test.mjs}' package.json
# tooling/AGENTS.md 의 폴더 상대 경로.
perl -pi -e 's{`scripts/sdk-}{`sdk/sdk-}g' tooling/AGENTS.md
# LANES 소유 경로 표: 두 항목을 하나로.
perl -pi -e 's{`tooling/sdk/api`, `tooling/sdk/sdk-\*`}{`tooling/sdk/`}' .agents/conductor/LANES.md

# 새 위치 한 문장(마커로 멱등).
if ! grep -q 'SDK 도구와 스냅샷은 `tooling/sdk/`' tooling/AGENTS.md; then
  perl -0pi -e 's{(- `sdk/sdk-pack\.mjs`[^\n]*\n)}{$1- SDK 도구와 스냅샷은 `tooling/sdk/`(스냅샷은 `tooling/sdk/api/`)에 있고, `tooling/scripts/`에는 비SDK 도구만 남는다(713l).\n}' tooling/AGENTS.md
fi
ADR=docs/adr/0090-repo-structure-by-branch.md
if ! grep -q 'tooling/sdk/`(713l)' "$ADR"; then
  perl -pi -e 's{^(\| `tooling/` 비패키지[^\n]*)$}{$1\n| `tooling/` 결과(713l) | SDK 도구 `tooling/scripts/sdk-*`·스냅샷 `tooling/sdk-api` → `tooling/sdk/`(713l) |}' "$ADR"
fi
