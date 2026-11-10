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
const SKIP_BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|gz|zip|snap)$/;
const MAX_FO = 72;

// Runtime message strings kept bare on purpose: file -> exact trimmed lines (a new citation in the same file still fails).
const RUNTIME_STRINGS = {
  'apps/feature-screens/src/features/admin/settings/__tests__/workspace-settings-screen.test.tsx': [
    "expect(document.body.textContent).not.toMatch(/SELF_APPROVAL|ADR-0026|∩|합집합|교집합/);",
  ],
  'apps/platform-api/src/modules/analytics-areas/analytics-area-service.ts': [
    "'parent managed_system is archived; analytics_area cannot be updated (ADR-0019 Section B Q1)',",
  ],
  'apps/platform-api/src/modules/analytics-areas/routes.ts': [
    "`${field} is immutable per ADR-0017`,",
  ],
  'apps/platform-api/src/modules/auth/oidc-auth-provider.ts': [
    "throw new Error(`AUTH_PROVIDER=oidc requires ${missing.join(', ')} (ADR-0006)`);",
    "throw new Error('OIDC_REDIRECT_URI must be an absolute URL (ADR-0006)');",
    "'OIDC_CLIENT_ID/OIDC_CLIENT_SECRET, and that the IdP is reachable (ADR-0006)',",
    "`OIDC discovery for issuer host '${issuer.host}' is unusable: ${problem} (ADR-0006)`,",
  ],
  'apps/platform-api/src/modules/core/jobs/idempotency-purge.ts': [
    "`pg-boss queue '${IDEMPOTENCY_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + F-010).`,",
  ],
  'apps/platform-api/src/modules/core/jobs/purge-unlinked-attachments.ts': [
    "`pg-boss queue '${ATTACHMENTS_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0008 + PLAN-22 C4b).`,",
  ],
  'apps/platform-api/src/modules/core/jobs/rate-limits-purge.ts': [
    "`pg-boss queue '${RATE_LIMITS_PURGE_QUEUE}' is not pre-created. Run migrations (ADR-0009 + F-018).`,",
  ],
  'apps/platform-api/src/modules/managed-systems/routes.ts': [
    "return sendError(reply, 'validation.immutable_field', 'slug is immutable per ADR-0017', {",
  ],
  'apps/platform-api/src/modules/notifications/catalogue.ts': [
    "'Current owner of the linked VOC; caller applies the ADR-0014 exclusions for releasing actor, Task assignee, Reporter, and worker actor.',",
  ],
  'apps/platform-api/src/modules/notifications/jobs/dispatch.ts': [
    "`pg-boss queue '${NOTIFICATION_DISPATCH_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/jobs/cluster-autogen-shadow.ts': [
    "`pg-boss queue '${VOC_CLUSTER_AUTOGEN_SHADOW_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/jobs/cluster-suggestions.ts': [
    "`pg-boss queue '${VOC_CLUSTER_SUGGESTIONS_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/jobs/embed-voc.ts': [
    "`pg-boss queue '${VOC_EMBED_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/jobs/embedding-backfill.ts': [
    "`pg-boss queue '${VOC_EMBEDDING_BACKFILL_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/jobs/released-review-candidates.ts': [
    "`pg-boss queue '${TASK_RELEASED_REVIEW_CANDIDATES_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/modules/voc/similarity-preview/cleanup.ts': [
    "`pg-boss queue '${VOC_SIMILARITY_PREVIEW_CLEANUP_QUEUE}' is not pre-created. Run migrations (ADR-0009).`,",
  ],
  'apps/platform-api/src/seed/index.ts': [
    "'WORKSPACE_ID env var is required. Generate a UUID and reuse it across migrate/seed/app boots so every record binds to the same Workspace per ADR-0006.',",
    "'fixture team that platform_app cannot insert per ADR-0019).',",
  ],
  'apps/platform-api/src/server.ts': [
    "'WORKSPACE_ID env var is required to build the server (ADR-0006 single seeded workspace).',",
    "'AUTH_PROVIDER=mock is not permitted in production (ADR-0006). Set AUTH_PROVIDER=oidc.',",
  ],
};

const CITE = /(?<![A-Za-z0-9-])ADR-(\d{4})\b/g;
const PREFIX = /(?:\b(?:FO|EV)|\b[Pp]latform)\s+\[?$/;
const LIST_HEAD = /(?:\b(?:FO|EV)|\b[Pp]latform)\s+\[?ADR-\d{4}[^)\n]{0,40}?(?:,|;|\/|&|\+|\band|\bor)\s*$/;

/** Returns the bare citations of one text as [{ line, num }]. */
function bareCitations(text, file = '') {
  const found = [];
  const allowed = RUNTIME_STRINGS[file] ?? [];
  const isAllowed = (line) => allowed.includes(line.trim());
  text.split('\n').forEach((line, i) => {
    CITE.lastIndex = 0;
    let m;
    while ((m = CITE.exec(line))) {
      const num = m[1];
      if (Number(num) < 1 || Number(num) > MAX_FO) continue;
      const before = line.slice(0, m.index);
      if (PREFIX.test(before) || LIST_HEAD.test(before) || isAllowed(line)) continue;
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
  const rsFile = Object.keys(RUNTIME_STRINGS)[0];
  const rsLine = RUNTIME_STRINGS[rsFile][0];
  if (bareCitations(`  ${rsLine}`, rsFile).length !== 0) { bad++; console.error('self-test FAIL: runtime string allow-list'); }
  if (bareCitations(`${rsLine}\n// ADR-0006 requires authentication`, rsFile).length !== 1) { bad++; console.error('self-test FAIL: allow-list is per line'); }
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
      .split('\0').filter((f) => f && !SKIP_BINARY.test(f) && !f.startsWith(MIGRATIONS)); // applied migrations are history; not edited
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
