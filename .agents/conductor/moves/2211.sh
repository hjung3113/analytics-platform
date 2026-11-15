#!/usr/bin/env bash
# #2211: feature code becomes one folder, packages/feature/. Idempotent.
#   apps/feature-screens                  -> packages/feature/screens   (@ap/feature-screens)
#   packages/feature-shared               -> packages/feature/shared    (@ap/feature-shared)
#   packages/adapters/feature-bridge      -> packages/feature/bridge    (@ap/feature-bridge)
#   packages/feature-ui/src/**            -> packages/feature/screens/src/ui/**   (@ap/feature-ui is merged into feature-screens)
#   packages/feature-ui/__tests__/**      -> packages/feature/screens/src/ui/__tests__/**
# Package names of the three kept packages, exports and sources do not change. The `@/` alias of feature-screens and every
# `@ap/feature-ui` import become relative specifiers (2211-rewrite-imports.mjs). Rewrites repo-root path strings in tracked
# text files (untracked files are never touched). Not rewritten: docs/adr/** (history), docs/integration/history/**, .review/**,
# archive/**, tooling/sdk/api/** (snapshots), this folder, pnpm-lock.yaml (pnpm install rewrites it). Package manifests, workspace
# globs, lint presets and the remaining feature-ui files (package.json, configs, AGENTS.md) are hand edits in the same PR.
# Usage: bash .agents/conductor/moves/2211.sh   (MV=mv to move without git)
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"
HERE=.agents/conductor/moves

map() {
  sed -E \
    -e 's#^apps/feature-screens/#packages/feature/screens/#' \
    -e 's#^packages/feature-shared/#packages/feature/shared/#' \
    -e 's#^packages/adapters/feature-bridge/#packages/feature/bridge/#' \
    -e 's#^packages/feature-ui/src/#packages/feature/screens/src/ui/#' \
    -e 's#^packages/feature-ui/__tests__/#packages/feature/screens/src/ui/__tests__/#'
}

# The file list is taken from the index BEFORE moving (tracked files only) and mapped to the new paths.
TEXT=$(git ls-files | grep -E '(\.(md|ts|tsx|mjs|cjs|js|json|yml|yaml|sh|html|css)|(^|/)Dockerfile|(^|/)\.dockerignore)$' \
  | grep -vE '^(docs/adr/|docs/integration/history/|\.review/|\.agents/conductor/moves/|archive/|tooling/sdk/api/)' | grep -vE '^pnpm-lock\.yaml$' \
  | map || true)

mkdir -p packages/feature
[ -e apps/feature-screens ] && $MV apps/feature-screens packages/feature/screens
[ -e packages/feature-shared ] && $MV packages/feature-shared packages/feature/shared
[ -e packages/adapters/feature-bridge ] && $MV packages/adapters/feature-bridge packages/feature/bridge
mkdir -p packages/feature/screens/src/ui
if [ -d packages/feature-ui/src ]; then
  for e in packages/feature-ui/src/*; do $MV "$e" "packages/feature/screens/src/ui/$(basename "$e")"; done
fi
if [ -d packages/feature-ui/__tests__ ]; then
  mkdir -p packages/feature/screens/src/ui/__tests__
  for e in packages/feature-ui/__tests__/*; do $MV "$e" "packages/feature/screens/src/ui/__tests__/$(basename "$e")"; done
fi

for f in $TEXT; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  grep -qE 'apps/feature-screens|packages/feature-shared|packages/adapters/feature-bridge|packages/feature-ui/(src|__tests__)' "$f" || continue
  perl -pi -e '
    s{(?<![\w-])apps/feature-screens(?![\w-])}{packages/feature/screens}g;
    s{(?<![\w-])packages/feature-shared(?![\w-])}{packages/feature/shared}g;
    s{(?<![\w-])packages/adapters/feature-bridge(?![\w-])}{packages/feature/bridge}g;
    s{(?<![\w-])packages/feature-ui/src(?![\w-])}{packages/feature/screens/src/ui}g;
    s{(?<![\w-])packages/feature-ui/__tests__(?![\w-])}{packages/feature/screens/src/ui/__tests__}g;
  ' "$f"
done

node "$HERE/2211-rewrite-imports.mjs" packages/feature/screens
