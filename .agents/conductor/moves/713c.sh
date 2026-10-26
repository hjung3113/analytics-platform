#!/usr/bin/env bash
# 713c: packages/kernel/src를 갈래 폴더 + __tests__/로 옮기고 상대 import·재export를 고친다 (ADR-0090). 멱등.
# 다른 흐름이 kernel 파일을 먼저 바꿨으면 rebase 뒤 이 스크립트를 다시 돌린다 (새로 생긴 평평한 파일은 MAP에 한 줄 더한다).
# MV=mv 로 돌리면 git 없이 옮긴다 (기본은 git mv).
set -euo pipefail
cd "$(dirname "$0")/../../.."
export MV="${MV:-git mv}"
node --input-type=module - <<'JS'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SRC = 'packages/kernel/src';
const DIRS = {
  registry: ['registry', 'module', 'module-host', 'metric-init'],
  context: ['paneContext', 'location', 'pageNavigation', 'paletteFocus', 'drill', 'drillReset', 'equipmentAxes'],
  links: ['return-to'],
  scope: ['selection-ports', 'selection-port-cache'],
  audit: ['cursor-pages'],
  query: ['query', 'query-engine', 'query-history', 'query-draft', 'draft-state', 'condition-preset', 'refresh-epochs', 'action'],
  platform: ['platform'],
};
// file name (without src/) -> new path under src/
const MAP = new Map();
for (const [dir, names] of Object.entries(DIRS)) for (const n of names) {
  for (const ext of ['.ts', '.tsx']) MAP.set(n + ext, `${dir}/${n}${ext}`);
}
// tests: <name>.test.ts(x) beside its subject goes to <dir>/__tests__/. Others are listed explicitly.
const TESTS = {
  'registry/__tests__': ['registry.test.ts', 'module.test.ts', 'module-host.test.tsx', 'menu-vocab.types.test.ts'],
  'context/__tests__': ['paneContext.test.ts', 'location.test.tsx', 'pageNavigation.test.ts', 'paletteFocus.test.ts', 'drill.test.tsx', 'drillReset.test.ts', 'equipmentAxes.test.ts'],
  'scope/__tests__': ['selection-ports.test.tsx', 'selection-port-cache.test.ts'],
  'audit/__tests__': ['entity-audit.test.tsx'],
  'query/__tests__': ['query-engine.test.tsx', 'query-history.test.tsx', 'query-draft.test.tsx', 'condition-preset.test.ts', 'action.test.tsx', 'adapter.test.tsx', 'menu-query.test.tsx'],
  'error/__tests__': ['contract-error-copy.test.ts', 'error-guidance.test.ts', 'invalid-value.test.ts'],
  '__tests__': ['testing.test.ts'],
};
for (const [dir, files] of Object.entries(TESTS)) for (const f of files) MAP.set(f, `${dir}/${f}`);
for (const f of readdirSync(SRC)) if (/^platform\..*\.test\.tsx?$/.test(f)) MAP.set(f, `platform/__tests__/${f}`);

const mv = process.env.MV;
for (const [from, to] of MAP) {
  const a = path.join(SRC, from), b = path.join(SRC, to);
  if (!existsSync(a)) continue;
  mkdirSync(path.dirname(b), { recursive: true });
  execSync(`${mv} '${a}' '${b}'`, { stdio: 'inherit' });
}

// inverse: new path -> old path (files not in MAP stay)
const oldOf = new Map([...MAP].map(([o, n]) => [n, o]));
const stripExt = (p) => p.replace(/\.(tsx?|js)$/, '');
const oldKeys = new Map([...MAP.keys()].map((k) => [stripExt(k), k]));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
let changed = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file);
  const oldRel = oldOf.get(rel) ?? rel;
  const oldDir = path.dirname(oldRel);
  const newDir = path.dirname(rel);
  const text = readFileSync(file, 'utf8');
  const out = text.replace(/(\bfrom\s+|\bimport\s*\(\s*)'(\.{1,2}\/[^']*)'/g, (m, pre, spec) => {
    if (oldDir !== '.') return m; // all old files were flat; anything deeper is already rewritten
    const target = path.normalize(path.join(oldDir, spec)); // old location, relative to src
    if (target.startsWith('..')) return m;
    const mapped = oldKeys.get(target);
    const dest = mapped ? stripExt(MAP.get(mapped)) : target;
    let r = path.relative(newDir, dest);
    if (!r.startsWith('.')) r = './' + r;
    return `${pre}'${r}'`;
  });
  if (out !== text) { writeFileSync(file, out); changed++; }
}
console.log(`713c: rewrote imports in ${changed} files`);
JS
