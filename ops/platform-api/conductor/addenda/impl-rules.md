## FeedbackOps addendum

Overrides and additions to the numbered rules above.

- Rule 1 checks (Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`): frontend — `cd apps/feature-screens && npx
  vitest run <the test files you touched or added>` and, from the repo root, `pnpm --filter @fops/ops gate:fe-typecheck`; backend — `pnpm --filter @fops/backend exec tsc
  --noEmit`; then `ops/platform-api/node_modules/.bin/biome check --config-path=ops/platform-api <every file you touched>` from the repo root, fixing only diagnostics on
  lines you changed (the conductor fixed introduced format errors in four PRs of s81).
- Backend integration suites run only as `.review/00-IMPL-RULES-BE.md` allows (your own issue database, the exact
  command your task names). Still **never** run DB commands (`db:migrate`, `db:seed`, `psql`), the full
  integration suite, or any other env file.
- An offline install emptied a worktree's node_modules in s70.
- **Formatting: biome only** (`ops/platform-api/biome.json`: lineWidth 100, 2-space indent, single quotes). Never run Prettier.
- TypeScript uses `exactOptionalPropertyTypes`: omit an optional prop rather than passing `undefined`.
- Read first: root `AGENTS.md`, `apps/feature-screens/AGENTS.md`, the owning feature's `AGENTS.md`, and
  `.claude/rules/frontend-tests.md` (jsdom/Radix traps) before writing any test.
- A fix item never widens into fetch, cache, placeholder or UI-state behaviour (React Query `placeholderData` /
  `keepPreviousData`, query keys, `staleTime`/`gcTime`, optimistic overlays, retained selection) unless the item
  names that change; such a change is not a "small" UX fix (s81 #1177: one cost a 31-minute FIX2). If the finding
  seems to need one, stop and say so in the report.
- User-facing copy: reuse `apps/feature-screens/src/lib/copy/*` and the screen's existing wording (ADR-0060). UI chrome is
  Korean; domain nouns (VOC, Finding, Task, Task Request, Survey, Cluster, Managed System, Analytics Area,
  Milestone, Evidence, Triage) and Task workflow statuses stay English (ADR-0057 A2, amended by #675).
