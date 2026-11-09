# Backend Agent Guide

DB/role identity: `platform` database and `platform_*` roles. Fresh or uncut clusters run `ops/platform-api/scripts/db/cutover-0076-platform-identity.sh` (staged procedure: `apps/platform-api/docs/04-database-and-migrations.md`).

## Required Docs

- Before backend changes: `docs/architecture/platform-api/README.md`.
- Endpoint behavior: `docs/architecture/platform-api/03-api-contracts.md` + `docs/architecture/platform-api/api/`.
- Storage: `apps/platform-api/docs/04-database-and-migrations.md`. Access control: `05-permission-policy.md`. Links: `06-entity-linking-contract.md`.
- Before adding or moving modules: `apps/platform-api/docs/02-domain-module-boundaries.md`.
- Measured traps before editing tests or migrations: [integration tests](../../.claude/rules/feature-api-integration-tests.md), [database and migrations](../../.claude/rules/feature-db-migrations.md).

## Layer Rules

Layer boundaries live in `docs/agents/feature-implementation.md` → Implementation Boundaries. Backend additions:

- Domain services own local business rules only.
- Read models may compose approved projections but never become mutation paths.
- Core owns Managed System Registry, Analytics Areas, Actor, Role Level, audit, shared attachment governance, and default owner/reviewer resolution inputs; Task owns Task Request, Task, future Work Initiative / Project grouping, Milestone, and execution views.
- Mutation services type their handle `Tx` (`Db | DrizzleTx`, `db/tx.ts`) and run inside the caller's transaction; never re-introduce `type Tx = Db`.
- Register every new drizzle migration in `migrations/meta/_journal.json` in the same chunk — drizzle silently skips an unregistered `.sql` while `db:migrate` reports success.

## Cross-System Commands

- A cross-system command validates workspace ownership, checks permissions, writes the target object, writes required `entity_links`, appends required audit events, and returns data suitable for pending or optimistic UI.
- Source-shaped routes may parse the request; target object writes go through the target module's application command or an orchestration service documented in `apps/platform-api/docs/02-domain-module-boundaries.md`.
- Analytics Area is business context inside one Managed System, not an MVP permission boundary; Project / Work Initiative is future execution grouping only unless a later ADR changes it (Managed System invariant: `docs/agents/feature-implementation.md` → Product Invariants).

## Verification

- **Lint.** `pnpm --filter @ap/platform-api lint` = ESLint over the whole package (`featureServerPreset` from `@ap/eslint-config`, `--max-warnings 0`). Narrow test non-null assertions with `src/test-support/defined.ts`; an intended exception names its ESLint rule and reason in the comment; an unused directive fails. Correspondence: `docs/integration/platform-packages.md` §6.
- Cover, when touched: permission policy, entity-link side effects, API error codes, validation paths, audit events, transaction behavior. Never rely on frontend checks as the source of authorization truth.
- **Runtime SDK imports are bounded.**
  - Source: own feature packages and `@ap/ui`; only core-server may directly import `@ap/contract-schemas` (new port validation, ADR-0097); other SDK packages are test-only (`ops/platform-api/scripts/check-boundaries.mjs` rule 11, ADR-0073).
  - Tests may import `@ap/contracts` (generated `vocab.json` for the vocabulary drift tests), `@ap/server-conformance` and `@ap/http-adapter` (devDependencies).
  - `__tests__/platform-conformance.integration.test.ts` runs the conformance kit over the real HTTP adapter via `app.inject`; an unserved port is a skipped test (the readiness table), never a pass.
  - A test importing those packages is excluded from `tsconfig.json` and type-checked by `tsconfig.platform-tests.json`; `typecheck` runs both — list a new such test in both.
- **`test:integration` is the gate; the default `test` proves only the non-DB path.**
  - Suites use `describe.skipIf(!runIntegration)`; `runIntegration` needs `DATABASE_URL`, `DATABASE_URL_MIGRATE` and (most files) `WORKSPACE_ID` — a bare `pnpm --filter @ap/platform-api test` skips every integration suite and touches no database.
  - `pnpm --filter @ap/platform-api test:integration` (`ops/platform-api/scripts/test-integration.sh`) exports `ops/platform-api/.env` and runs the same suite with the integration path live; extra args forward to vitest. `PLATFORM_API_ENV_FILE=<path>` selects another env file.
  - Root/default `test` strips `DATABASE_URL`, `DATABASE_URL_MIGRATE` and `WORKSPACE_ID` and sets `ALLOW_SKIPPED_INTEGRATION=1`; `test:integration` clears the opt-out after loading its env file and requires all three. An opt-out run is never a gate result.
  - DB-backed verification is complete only from a `test:integration` result; `src/test-support/__tests__/integration-gate.test.ts` stays ungated and needs the integration environment unless explicitly opted out.
- **The gate resets the database.** `globalSetup` (`src/test-support/global-setup.ts`) truncates every product table and re-seeds before the run, so results never depend on earlier runs (#205).
  - Point `DATABASE_URL`/`DATABASE_URL_MIGRATE` at a throwaway database: `test:integration` refuses port 5434 (dev) unless `PLATFORM_API_ALLOW_DEV_DB=1` (guard test `ops/platform-api/scripts/test-integration.test.mjs`, CI static stage).
  - `TEST_DB_NO_RESET=1` opts back into non-reproducible counts; `NODE_ENV=production` is refused. A bare `describe` (not `skipIf`) runs its `beforeAll` in the default gate and fails — deviating from the idiom is a bug.
- **Seeds.**
  - `SEED_MODE=personas pnpm --filter @ap/platform-api db:seed` = unchanged core seed + mock Admin/User/Developer personas with test-only grants; omit `SEED_MODE` (or `core`) for the canonical core-only seed.
  - `SEED_MODE=scale`, throwaway preview DBs only: adds a synthetic demo cohort on top of core/personas prerequisites (reporters, VOCs, Tasks, Findings, Task Requests, Clusters, Milestones — counts live in the seed). Existing rows are preserved; a workspace-scoped actor marker makes the cohort atomic, and retries fill missing rows when the marker is absent.
- **How a run can lie.**
  - A narrow filter can false-PASS — gate on the whole touched module.
  - A superuser connection false-FAILs the role-grant assertions (a superuser bypasses every GRANT): run as `platform_app`, migrate as `platform_migrate`.
  - Docker down fails every suite with `mock-login failed: 500` — check `pg_isready -h localhost -p 5434` (or your throwaway port) before diagnosing code.
- **Teardown walks the FK graph into `core.actors`; `core.audit_log` needs the migrate role.**
  - Every test-actor request writes `core.audit_log`; `audit_log.actor_id` is a plain FK, so audit rows go before `delete from core.actors`. `platform_app` holds no DELETE there by design (ADR-0008/0019), so that statement runs through `DATABASE_URL_MIGRATE` — same for `permission.permission_requests.requester_actor_id`.
  - A failing delete aborts the whole `afterAll`: later statements silently never run and fixtures leak (#205). A suite that creates fixtures and closes handles without deleting them is incomplete even if green — `db/__tests__/seed` asserts an exact managed-system list and fails on anyone's leftovers.
- **Never assert an exact set over `core.actors`** — the table is shared run-wide and some suites keep an actor on purpose (the rate-limit case in `modules/voc/__tests__/post-reporter-reply` needs a fresh actor per run for a clean bucket; #304).
  - Assert the **set difference** the suite causes (snapshot before/after, delta by `external_id`); put arity assertions after set assertions, so the failure names the actor instead of a count.
- **Throwaway DB provisioning.** `create database <name> owner platform_migrate` (a `postgres`-owned database leaves `postgres`-owned schemas, and even `platform_migrate` gets `permission denied for schema voc`), then `create extension vector` as superuser, then migrate and seed with both role URLs on it.
- **Tests are real smoke tests, not ceremonial.** Integration tests hit a live Postgres as `platform_app` / `platform_migrate` — no DB mocks, no in-memory shims.
  - Boot Fastify via `buildServer`, exercise routes through `app.inject`, assert the wire envelope plus resulting DB state (audit rows, row mutations, idempotency cache, permission grants).
  - Static checks (`pnpm --filter @ap/platform-api-ops feature:typecheck`, `check:boundaries`) prove shape only. A test that passes without Postgres or without observable DB state is not a real test — convert or delete it.
  - If a DB-dependent scenario is unreachable from the harness (e.g. mid-tx concurrency), document the gap explicitly rather than substituting a mock.
