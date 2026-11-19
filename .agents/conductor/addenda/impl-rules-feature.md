# Feature addendum to 00-IMPL-RULES.md (read both) — launch mode `feature`

Run every feature command from the repository root (`pnpm --filter @ap/platform-api-ops <script>`); root lint/typecheck/test/build stay conductor-owned.

1. Read `docs/agents/feature-implementation.md`, `apps/platform-api/AGENTS.md` and every module `AGENTS.md`
   you touch, plus `apps/platform-api/docs/02-domain-module-boundaries.md` §Approved cross-module
   surfaces.
2. Backend integration suites are env-gated: they skip without a DB. Your task names your own throwaway issue
   database (port 5439) and the exact command, run from the repository root:
   `PLATFORM_API_ENV_FILE=<abs worktree>/.review/env.verify pnpm --filter @ap/platform-api test:integration <files>`
   (paths relative to `apps/platform-api`). Run only the integration files you added or touched, never the full
   suite or the whole `@ap/platform-api` unit run, never another env file, never `.env`. Each run
   truncates and re-seeds that database, which is expected. The suites run as the low-priv `platform_app` role: write
   the tests so they pass under it. Report the command and its result. If your task adds a migration, the issue
   database does not have it (you cannot migrate): skip the suites that need it and say so; the conductor
   recreates the database and runs them.
3. Behaviour-preserving refactor: the error code, HTTP status and `fields[].path`/`code` of every existing failure
   path stay byte-identical.
4. Shared seed helpers live in `apps/platform-api/src/test-support/`; reuse them instead of new ad-hoc seeds.
5. You may run `pnpm --filter @ap/platform-api-ops feature:typecheck`, `pnpm --filter @ap/platform-api exec tsc --noEmit`, `pnpm --filter <@ap/platform-api|@ap/feature-screens|@ap/feature-shared> lint` for files under those packages, `ops/platform-api/node_modules/.bin/biome format --config-path=ops/platform-api --write
   <your files>` for residual-scope files only, unit tests that need no DB, and rule 2's integration files; never DB commands
   (`db:migrate`, `db:seed`, `psql`) or the full integration suite (the conductor runs that). Generate migration snapshots with `pnpm --filter @ap/platform-api db:generate`; do not
   hand-write them.
6. Hand-written migration SQL is only executed by the conductor, so copy proven patterns: a pg-boss queue insert
   lists every `pgboss.queue` column as in `0051_voc_cluster_autogen_shadow.sql`; inside a plpgsql `IF … THEN`, wrap
   any `CASE … THEN … END` in parentheses.

7. Before finishing, lint what you touched:
    - Under `apps/platform-api`, `packages/feature/screens` or `packages/feature/shared`: run that package's `pnpm --filter <pkg> lint` and fix what it reports. Never pass these files to Biome (`check` or `format`); ESLint has no formatter step. Rule correspondence with the former Biome lint: `docs/integration/platform-packages.md` §6.
