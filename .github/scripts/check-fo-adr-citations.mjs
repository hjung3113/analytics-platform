#!/usr/bin/env node
// check-fo-adr-citations.mjs — dependency-free check that FeedbackOps-origin code and guides never cite a
// historical FeedbackOps ADR as a bare `ADR-00NN`. Root script: `pnpm docs:adr-citations`. CI runs it before install.
//
// Why: the platform ADR numbers (docs/adr/0001..) overlap the FeedbackOps ones (docs/adr/history/feedbackops/0001..0072),
// so a bare `ADR-0006` reaches an unrelated platform ADR. Rule: docs/AGENTS.md "ADR numbering".
//
// Usage:  node check-fo-adr-citations.mjs [--self-test]
//
// Scope: git-tracked text files (.md .ts .tsx .js .mjs .json .sh .yml .sql, symlinks skipped) under
//   apps/platform-api, apps/feature-screens, packages/feature-shared, packages/feature-ui, ops/platform-api.
//   Numbers above 0072 only exist in the platform space and are never checked.
//
// A bare `ADR-NNNN` (NNNN 0001..0072) is accepted only when it is
//   (a) written `FO ADR-NNNN` (FeedbackOps) or `EV ADR-NNNN` (equipment visualization),
//   (b) written `Platform ADR-NNNN` / `platform ADR-NNNN` (platform ADR), also `platform [ADR-NNNN](…)`,
//   (c) a Markdown link text `[ADR-NNNN](…/NNNN-….md)` whose target is a platform ADR file (not under history/),
//   (d) in a list continuing an accepted citation on the same line: `FO ADR-0011, ADR-0012`, `platform ADR-0070 decision 8, ADR-0071`
//       (separator `,` `;` `/` `&` `+` `and` `or` within 40 characters and no `)` in between), or
//   (e) listed in RUNTIME_STRINGS below: a runtime message that tests or operators may match verbatim.
//
// Exit status: 0 = clean, 1 = at least one bare citation, 2 = usage / git error.

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';

const SCOPE = ['apps/platform-api', 'apps/feature-screens', 'packages/feature-shared', 'packages/feature-ui', 'ops/platform-api'];
const MIGRATIONS = 'apps/platform-api/migrations/';
const EXT = /\.(md|ts|tsx|js|mjs|json|sh|yml|sql)$/;
const MAX_FO = 72;

// Runtime message strings kept bare on purpose: file -> numbers.
const RUNTIME_STRINGS = {
  'apps/feature-screens/src/features/admin/settings/__tests__/workspace-settings-screen.test.tsx': ['0026'],
  'apps/platform-api/src/modules/analytics-areas/analytics-area-service.ts': ['0019'],
  'apps/platform-api/src/modules/analytics-areas/routes.ts': ['0017'],
  'apps/platform-api/src/modules/auth/oidc-auth-provider.ts': ['0006'],
  'apps/platform-api/src/modules/core/jobs/idempotency-purge.ts': ['0008'],
  'apps/platform-api/src/modules/core/jobs/purge-unlinked-attachments.ts': ['0008'],
  'apps/platform-api/src/modules/core/jobs/rate-limits-purge.ts': ['0009'],
  'apps/platform-api/src/modules/managed-systems/routes.ts': ['0017'],
  'apps/platform-api/src/modules/notifications/catalogue.ts': ['0014'],
  'apps/platform-api/src/modules/notifications/jobs/dispatch.ts': ['0009'],
  'apps/platform-api/src/modules/voc/jobs/cluster-autogen-shadow.ts': ['0009'],
  'apps/platform-api/src/modules/voc/jobs/cluster-suggestions.ts': ['0009'],
  'apps/platform-api/src/modules/voc/jobs/embed-voc.ts': ['0009'],
  'apps/platform-api/src/modules/voc/jobs/embedding-backfill.ts': ['0009'],
  'apps/platform-api/src/modules/voc/jobs/released-review-candidates.ts': ['0009'],
  'apps/platform-api/src/modules/voc/similarity-preview/cleanup.ts': ['0009'],
  'apps/platform-api/src/seed/index.ts': ['0006', '0019'],
  'apps/platform-api/src/server.ts': ['0006'],
};

const CITE = /(?<![A-Za-z0-9-])ADR-(\d{4})\b/g;
const PREFIX = /(?:\b(?:FO|EV)|\b[Pp]latform)\s+\[?$/;
const LIST_HEAD = /(?:\b(?:FO|EV)|\b[Pp]latform)\s+\[?ADR-\d{4}[^)\n]{0,40}?(?:,|;|\/|&|\+|\band|\bor)\s*$/;

/** Returns the bare citations of one text as [{ line, num }]. */
function bareCitations(text, file = '') {
  const found = [];
  const allowed = RUNTIME_STRINGS[file] ?? [];
  text.split('\n').forEach((line, i) => {
    CITE.lastIndex = 0;
    let m;
    while ((m = CITE.exec(line))) {
      const num = m[1];
      if (Number(num) < 1 || Number(num) > MAX_FO) continue;
      const before = line.slice(0, m.index);
      if (PREFIX.test(before) || LIST_HEAD.test(before) || allowed.includes(num)) continue;
      // [ADR-NNNN](…/NNNN-….md): a platform ADR file link (history/ links are FeedbackOps and need the prefix)
      const after = line.slice(m.index + m[0].length);
      const link = after.match(/^\]\(([^)\s]*)\)/);
      if (link && new RegExp(`/?${num}-[^/]*\\.md`).test(link[1]) && !/history\//.test(link[1])) continue;
      found.push({ line: i + 1, num });
    }
  });
  return found;
}

function selfTest() {
  const cases = [
    ['// see FO ADR-0006', 0],
    ['// see ADR-0006', 1],
    ['// see Platform ADR-0070 decision 8', 0],
    ['// platform ADR-0071, ADR-0081', 0],
    ['// FO ADR-0011, ADR-0012', 0],
    ['// FO ADR-0034/0035 and ADR-0036', 0],
    ['// ADR-0011, ADR-0012', 2],
    ['// FO ADR-0011 (x); ADR-0012', 1],
    ['see [ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)', 0],
    ['see [ADR-0052](../../docs/adr/history/feedbackops/0052-x.md)', 1],
    ['see [ADR-0052](other.md)', 1],
    ['platform [ADR-0050](../../docs/adr/0050-x.md)', 0],
    ['EV ADR-0010 and ADR-0073 and ADR-0100', 0],
    ['x-ADR-0006 ADR-00061 ADR-0000', 0],
    ['(ADR-0006)', 1],
  ];
  let bad = 0;
  for (const [text, want] of cases) {
    const got = bareCitations(text).length;
    if (got !== want) { bad++; console.error(`self-test FAIL: ${JSON.stringify(text)} expected ${want}, got ${got}`); }
  }
  if (bareCitations('x ADR-0006', 'apps/platform-api/src/server.ts').length !== 0) { bad++; console.error('self-test FAIL: runtime string allow-list'); }
  if (bareCitations('x ADR-0007', 'apps/platform-api/src/server.ts').length !== 1) { bad++; console.error('self-test FAIL: allow-list is per number'); }
  console.log(bad ? `self-test: ${bad} failed` : `self-test: ${cases.length + 2} ok`);
  process.exit(bad ? 1 : 0);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  if (args.length) { console.error(`unknown argument: ${args[0]}`); process.exit(2); }
  let files;
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    process.chdir(root);
    files = execFileSync('git', ['ls-files', '-z', '--', ...SCOPE], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      .split('\0').filter((f) => f && EXT.test(f) && !f.startsWith(MIGRATIONS)); // applied migrations are history; not edited
  } catch (e) { console.error(`git error: ${e.message}`); process.exit(2); }
  let total = 0; let checked = 0;
  for (const f of files) {
    if (lstatSync(f).isSymbolicLink()) continue;
    checked++;
    for (const { line, num } of bareCitations(readFileSync(f, 'utf8'), f)) {
      total++;
      console.log(`${f}:${line}: bare ADR-${num} — write "FO ADR-${num}" (FeedbackOps) or "platform ADR-${num}" (docs/adr/${num}-*)`);
    }
  }
  console.log(`\nchecked ${checked} files: ${total} bare ADR-0001..00${MAX_FO} citations`);
  process.exit(total ? 1 : 0);
}

main();
