# FeedbackOps addendum to 00-IMPL-RULES.md (read both) — launch mode `fo`

FeedbackOps is `apps/platform-api`, `apps/feature-screens`, `packages/feature-shared`, `packages/feature-ui` (apps, packages) and `docs/feedbackops/` (docs) with its tools in `ops/platform-api/` (workspace package `@ap/platform-api-ops`), part of the root pnpm workspace (root Node 26.7, pnpm 11 and lockfile; Biome
for its own lint; ADR-0066, #642). The launcher's root install already covers it. Run every FeedbackOps command **from the repository root**; its root scripts run as `pnpm --filter @ap/platform-api-ops <script>`; root lint/typecheck/test/build now cover the unified workspace, but those checks remain conductor-owned.

1. Read `docs/feedbackops/AGENTS.md`, `apps/platform-api/AGENTS.md` and every module `AGENTS.md`
   you touch, plus `docs/feedbackops/implementation/02-domain-module-boundaries.md` §Approved cross-module
   surfaces.
2. Backend integration suites are env-gated: they skip without a DB. Your task names **your own throwaway issue
   database** (port 5439) and the exact command, run from the repository root:
   `PLATFORM_API_ENV_FILE=<abs worktree>/.review/env.verify pnpm --filter @ap/platform-api test:integration <files>`
   (paths relative to `apps/platform-api`). Run **only the integration files you added or touched**, never the full
   suite, never another env file, never `.env`; the runner refuses port 5434 (the dev database). Each run
   truncates and re-seeds that database, which is expected. The suites run as the low-priv `platform_app` role: write
   the tests so they pass under it. Report the command and its result. If your task adds a migration, the issue
   database does not have it (you cannot migrate): skip the suites that need it and say so; the conductor
   recreates the database and runs them.
3. **Permission walls are design.** Do not add or widen any GRANT, do not change `platform_app`/`platform_migrate` roles, and
   do not add migrations unless the task says so. If a change seems to need a wider grant, stop and write that in
   the report instead.
4. Behaviour-preserving refactor: every existing test keeps its setup, fixtures and assertions. The error code, HTTP
   status and `fields[].path`/`code` of every existing failure path stay byte-identical.
5. Shared seed helpers live in `apps/platform-api/src/test-support/`; reuse them instead of new ad-hoc seeds.
6. You may run `pnpm --filter @ap/platform-api-ops feature:typecheck`, `pnpm --filter @ap/platform-api exec tsc --noEmit`, `ops/platform-api/node_modules/.bin/biome format --config-path=ops/platform-api --write
   <your files>`, unit tests that need no DB, and rule 2's integration files; never `git`, DB commands
   (`db:migrate`, `db:seed`, `psql`) or the full integration suite (the conductor runs that). Generate migration snapshots with `pnpm --filter @ap/platform-api db:generate`; do not
   hand-write them.
7. Hand-written migration SQL is only executed by the conductor, so copy proven patterns: a pg-boss queue insert
   lists every `pgboss.queue` column as in `0051_voc_cluster_autogen_shadow.sql`; inside a plpgsql `IF … THEN`, wrap
   any `CASE … THEN … END` in parentheses.
8. **Error envelopes (FeedbackOps routes):** validation and denial responses carry their fields under `detail`;
   assert `body.detail.fields`, not `body.fields`. Routes under `/api/v1/platform` follow ADR-0069 instead.
9. **Rate-limit keys** are `<workspace_id>:<actor_id>`.
10. Before finishing, run `ops/platform-api/node_modules/.bin/biome check --config-path=ops/platform-api --write <file> …` with the explicit path of every file you created
    or changed under `apps/platform-api`, `apps/feature-screens`, `packages/feature-shared`, `packages/feature-ui` or `docs/feedbackops/` (format and import order — the FE Biome gate fails on either: #603,
    #620, #621). Never pass a directory: `biome format --write apps/platform-api/src` rewrote 51 files the task did not
    own (#621).
