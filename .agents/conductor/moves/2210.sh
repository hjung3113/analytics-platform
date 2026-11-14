#!/usr/bin/env bash
# #2210: release unit 2 (ADR-0143) becomes one folder, packages/host/. Idempotent.
#   packages/app-host                                              -> packages/host/app-host (one level deeper)
#   packages/adapters/{mock-server,http-adapter,server-conformance} -> packages/host/<same name>
# Stays: packages/adapters/feature-bridge (moves in #2211). Package names (@ap/*), exports and sources do not change.
# Rewrites repo-root path strings in tracked text files. Not rewritten: docs/adr/** (history), .review/**, archive/**,
# tooling/sdk/api/** (snapshots), this folder, pnpm-lock.yaml (pnpm install rewrites it). Globs such as
# packages/adapters/* and relative paths inside app-host are hand edits in the same PR.
# Usage: bash .agents/conductor/moves/2210.sh   (MV=mv to move without git)
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MV="${MV:-git mv}"

mkdir -p packages/host
[ -e packages/app-host ] && $MV packages/app-host packages/host/app-host
for p in mock-server http-adapter server-conformance; do
  [ -e "packages/adapters/$p" ] && $MV "packages/adapters/$p" "packages/host/$p"
done

TEXT=$(git ls-files -co --exclude-standard | grep -E '(\.(md|ts|tsx|mjs|cjs|js|json|yml|yaml|sh|html|css)|(^|/)Dockerfile|(^|/)\.dockerignore)$' \
  | grep -vE '^(docs/adr/|\.review/|\.agents/conductor/moves/|archive/|tooling/sdk/api/)' | grep -vE '^pnpm-lock\.yaml$' || true)
for f in $TEXT; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  grep -qE 'packages/(app-host|adapters/(mock-server|http-adapter|server-conformance))' "$f" || continue
  perl -pi -e '
    s{(?<![\w-])packages/app-host(?![\w-])}{packages/host/app-host}g;
    s{(?<![\w-])packages/adapters/(mock-server|http-adapter|server-conformance)(?![\w-])}{packages/host/$1}g;
  ' "$f"
done
