# Backend Agent Guide

DB/role identity: `platform` database and `platform_*` roles. Fresh or uncut clusters run `ops/platform-api/scripts/db/cutover-0076-platform-identity.sh` (staged procedure: `apps/platform-api/docs/04-database-and-migrations.md`).

## Required Docs

- Before backend changes: `docs/architecture/platform-api/README.md`.
- Endpoint behavior: `docs/architecture/platform-api/03-api-contracts.md` + `docs/architecture/platform-api/api/`.
- Storage: `apps/platform-api/docs/04-database-and-migrations.md`. Access control and link contracts: `docs/architecture/platform-api/`.
- Before adding or moving modules: `apps/platform-api/docs/02-domain-module-boundaries.md`.
- Measured traps before editing tests or migrations: [integration tests](../../.claude/rules/feature-api-integration-tests.md), [database and migrations](../../.claude/rules/feature-db-migrations.md).

## Layer Rules

Layer boundaries live in `docs/agents/feature-implementation.md` → Implementation Boundaries. Backend additions:

- Domain services own local business rules only.
- Read models may compose approved projections but never become mutation paths.

- Mutation services type their handle `Tx` (`Db | DrizzleTx`, `db/tx.ts`) and run inside the caller's transaction; never re-introduce `type Tx = Db`.
- Register every new drizzle migration in `migrations/meta/_journal.json` in the same chunk — drizzle silently skips an unregistered `.sql` while `db:migrate` reports success.
- A release's migrations only add: no `DROP TABLE`/`DROP COLUMN`, `RENAME`, `ALTER COLUMN … TYPE` or `SET NOT NULL`; the removing step goes in the next release. Reason: a rollback runs the previous backend on this schema (ADR-0177). `ops/platform-api/scripts/release/migration-additive-check.mjs` enforces it on main push; an exception carries `-- additive-check: allow <reason>`.

## Cross-System Commands

- A cross-system command validates workspace ownership, checks permissions, writes the target object, writes required `entity_links`, appends required audit events, and returns data suitable for pending or optimistic UI.
- Source-shaped routes may parse the request; target object writes go through the target module's application command or an orchestration service documented in `apps/platform-api/docs/02-domain-module-boundaries.md`.
- Analytics Area is business context inside one Managed System, not an MVP permission boundary (Managed System invariant: `docs/agents/feature-implementation.md` → Product Invariants).

## Verification

- Narrow test non-null assertions with `src/test-support/defined.ts`.
- Cover, when touched: permission policy, entity-link side effects, API error codes, validation paths, audit events, transaction behavior. Never rely on frontend checks as the source of authorization truth.

- `src/modules/platform-port/__tests__/platform-conformance.integration.test.ts` runs the conformance kit over the real HTTP adapter via `app.inject`; an unserved port is a skipped test (the readiness table), never a pass.
- A test importing those packages is excluded from `tsconfig.json` and type-checked by `tsconfig.platform-tests.json`; `typecheck` runs both — list a new such test in both. Reason: the image build installs them from their manifest only and its `tsc` would fail with TS2307, which only main push and manual runs build, never a PR. `src/__tests__/image-build-tsconfig.test.ts` reads the manifest-only packages from `Dockerfile` and fails a PR that misses either list.
- **`test:integration` is the gate; the default `test` proves only the non-DB path.**
  - Suites use `describe.skipIf(!runIntegration)`; `runIntegration` needs `DATABASE_URL`, `DATABASE_URL_MIGRATE` and (most files) `WORKSPACE_ID` — a bare `pnpm --filter @ap/platform-api test` skips every integration suite and touches no database.
  - An opt-out run is never a gate result.
  - DB-backed verification is complete only from a `test:integration` result; `src/test-support/__tests__/integration-gate.test.ts` stays ungated and needs the integration environment unless explicitly opted out.
- **The gate resets the database.** `globalSetup` (`src/test-support/global-setup.ts`) truncates every product table and re-seeds before the run, so results never depend on earlier runs (FeedbackOps #205).
  - Point `DATABASE_URL`/`DATABASE_URL_MIGRATE` at a throwaway database.
  - A bare `describe` (not `skipIf`) runs its `beforeAll` in the default gate and fails — deviating from the idiom is a bug.
- **Seeds.**
  - `SEED_MODE=scale`, throwaway preview DBs only: adds a synthetic demo cohort on top of core/personas prerequisites. Existing rows are preserved; a workspace-scoped actor marker makes the cohort atomic, and retries fill missing rows when the marker is absent.
- **How a run can lie.**
  - A narrow filter can false-PASS — gate on the whole touched module.
  - A superuser connection false-FAILs the role-grant assertions (a superuser bypasses every GRANT): run as `platform_app`, migrate as `platform_migrate`.
  - Docker down fails every suite with `mock-login failed: 500` — check `pg_isready -h localhost -p 5434` (or your throwaway port) before diagnosing code.
- **Teardown walks the FK graph into `core.actors`; `core.audit_log` needs the migrate role.**
  - Every test-actor request writes `core.audit_log`; `audit_log.actor_id` is a plain FK, so audit rows go before `delete from core.actors`. `platform_app` holds no DELETE there by design (FO ADR-0008/0019), so that statement runs through `DATABASE_URL_MIGRATE` — same for `permission.permission_requests.requester_actor_id`.
  - A failing delete aborts the whole `afterAll`: later statements silently never run and fixtures leak (FeedbackOps #205). A suite that creates fixtures and closes handles without deleting them is incomplete even if green — `db/__tests__/seed` asserts an exact managed-system list and fails on anyone's leftovers.
- Do not assert an exact set over `core.actors` — the table is shared run-wide and some suites keep an actor on purpose (the rate-limit case in `modules/voc/__tests__/post-reporter-reply` needs a fresh actor per run for a clean bucket; FeedbackOps #304).
  - Assert the set difference the suite causes (snapshot before/after, delta by `external_id`); put arity assertions after set assertions, so the failure names the actor instead of a count.
- **Throwaway DB provisioning.** `create database <name> owner platform_migrate` (a `postgres`-owned database leaves `postgres`-owned schemas, and even `platform_migrate` gets `permission denied for schema voc`), then migrate and seed with both role URLs on it.
- **Tests are real smoke tests, not ceremonial.** Integration tests hit a live Postgres as `platform_app` / `platform_migrate` — no DB mocks, no in-memory shims.
  - Boot Fastify via `buildServer`, exercise routes through `app.inject`, assert the wire envelope plus resulting DB state (audit rows, row mutations, idempotency cache, permission grants).
  - A test that passes without Postgres or without observable DB state is not a real test — convert or delete it.
  - If a DB-dependent scenario is unreachable from the harness (e.g. mid-tx concurrency), document the gap explicitly rather than substituting a mock.
