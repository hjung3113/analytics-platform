#!/usr/bin/env bash
# 713e: packages/contracts/src flat files -> branch folders (pure move). Idempotent; MV=mv to bypass git.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/../../..)"
MV="${MV:-git mv}"
SRC=packages/contracts/src
MAP="adapter:adapter action audit audit-order response paging selection-ports correlation
menu:menu menu-query required-context
links:url return-to feedbackops-link query-history
host:host
values:period measure instant"
echo "$MAP" | while IFS=: read -r dir files; do
  mkdir -p "$SRC/$dir"
  for f in $files; do
    if [ -f "$SRC/$f.ts" ] && [ ! -f "$SRC/$dir/$f.ts" ]; then $MV "$SRC/$f.ts" "$SRC/$dir/$f.ts"; fi
  done
done
# Rewrite relative specifiers to the new layout (idempotent: only touches specifiers that no longer resolve).
MAP="$MAP" SRC="$SRC" node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const src = process.env.SRC;
const where = new Map();
for (const line of process.env.MAP.split('\n')) {
  const [dir, files] = line.split(':');
  for (const f of files.split(' ')) where.set(f, dir);
}
const all = [...where.keys(), 'index', 'guards', 'i18n'];
const fileOf = (n) => (where.has(n) ? `${where.get(n)}/${n}.ts` : `${n}.ts`);
for (const n of all) {
  const file = path.join(src, fileOf(n));
  const from = path.dirname(file);
  const text = fs.readFileSync(file, 'utf8');
  const out = text.replace(/(from\s+)'(\.{1,2}\/[^']+?)\.js'/g, (m, pre, spec) => {
    if (fs.existsSync(path.join(from, `${spec}.ts`))) return m;
    const target = path.basename(spec);
    if (!all.includes(target)) return m;
    let rel = path.relative(from, path.join(src, fileOf(target))).replace(/\.ts$/, '.js');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${pre}'${rel}'`;
  });
  if (out !== text) fs.writeFileSync(file, out);
}
JS
# vocab generator reads the moved sources.
sed -i '' -e "s#'\.\./src/menu\.ts'#'../src/menu/menu.ts'#" -e "s#'\.\./src/audit\.ts'#'../src/adapter/audit.ts'#" \
  -e "s#'\.\./src/adapter\.ts'#'../src/adapter/adapter.ts'#" -e "s#'\.\./src/response\.ts'#'../src/adapter/response.ts'#" packages/contracts/scripts/vocab.mjs
