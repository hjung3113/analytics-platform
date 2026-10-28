# FeedbackOps

**The trail from "what we heard" to "what we did about it", kept first-class.**

FeedbackOps is an internal, AD-authenticated operating console for a single Workspace. It closes the loop from voice-of-customer intake to documented outcome, so that the connection between a complaint and the work it caused is a stored relationship rather than something reconstructed by hand later.

Without it, intake, triage decisions, evidence collection, execution tracking, and outcome validation each live in a different tool. FeedbackOps keeps them in one place and makes the links between them queryable.

It is not a public-facing tool, not a marketing site, and not multi-tenant SaaS. Every screen serves an authenticated internal Actor working inside a known Managed System scope.

- **Using the product?** → [`docs/feedbackops/USER-MANUAL.md`](USER-MANUAL.md) — organised by what you are trying to get done.
- **Want a visual walkthrough?** → [Interactive user guide](user-guide/index.html) — Korean chapters with annotated screenshots.
- **Changing the code?** → [`AGENTS.md`](AGENTS.md) is the binding rulebook. Read it before any change.
- **Wondering why something is the way it is?** → [`docs/feedbackops/adr/`](adr/) — decisions are recorded, and an ADR supersedes any other document on the decision it made.

---

## The loop

```
  Intake  ─────►  Triage  ─────►  Evidence  ─────►  Execution  ─────►  Outcome
  (VOC)           (severity,      (Finding)         (Task Request      (Survey,
                   owner, area)                      → Task)            Public Update)
     │                                                                      │
     └──────────────── entity_links: the canonical cross-system trail ──────┘
```

Five ideas carry the product:

| Concept | What it is |
|---|---|
| **VOC** | One piece of feedback about one Managed System. Has a reporter-facing status and, separately, an internal triage state. |
| **Finding** | A judgement supported by evidence — the bridge from "people said this" to "we should do something". |
| **Task Request** | A proposal for execution work. It exists so the Task backlog never fills with unreviewed candidates. |
| **Task** | Execution work with its own state machine, deliberately independent of what the reporter is told. |
| **Entity link** | The stored relationship between any of the above. This is what makes the trail real rather than implied. |

**Two invariants worth knowing before you read anything else:**

1. **Reporter-facing status and internal status never auto-map.** A Task reaching `released` does not silently mark a VOC `resolved`. Releases create candidates; a human confirms. Implicit propagation would bypass the audit trail and produce false reassurance — "Task done" is not always "problem solved" (ADR-0005).
2. **Permission-limited content shows a path, not a blank.** A blocked panel shows an approved summary or a request-access action. Never a stack trace, never silence.

---

## Running it locally

Requires Node 26.7 (root `.nvmrc`), [pnpm](https://pnpm.io/), and Docker (or your own PostgreSQL with the `pgvector` extension).

### Existing MinIO data when relocating the ops directory (#1098 b)

Before starting the relocated compose file, existing users must stop their own MinIO instance. Its ignored `./minio_data` bind mount was relative to `ops/feedbackops/`; moving tracked files does not move that data. Move the existing `ops/feedbackops/minio_data` directory to `ops/platform-api/minio_data` only after confirming that the destination does not exist; never overwrite an existing destination or start a fresh empty store in its place. If both exist, stop and resolve which data belongs to the instance before proceeding.

Verify that the relocated compose file resolves `./minio_data` to the moved directory and, after starting, inspect the MinIO container's `/data` mount and confirm that the expected bucket and objects remain. The dev compose project is explicitly `feedbackops`, preserving the named Postgres volume prefix. Container names, volumes, DB/role/schema names, realm, bucket, ports and environment identity remain unchanged. The host must check and record whether local ignored data exists before performing this migration; the folder relocation worker does not move local data or launch compose.

```bash
pnpm install
docker compose -f ops/platform-api/docker-compose.dev.yml up -d   # Postgres with pgvector on :5434, plus MinIO
cp ops/platform-api/.env.example ops/platform-api/.env              # already points at the compose database
set -a; . ./ops/platform-api/.env; set +a                          # nothing loads .env for you
```

`ops/platform-api/.env.example` carries working `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and `WORKSPACE_ID` values for the compose database. Neither app reads `.env` itself, so export it in every shell you run the commands below from (`pnpm --filter @ap/platform-api test:integration` sources it on its own).

Create the schema and load demo data:

```bash
pnpm --filter @ap/platform-api db:migrate
SEED_MODE=personas pnpm --filter @ap/platform-api db:seed
```

`SEED_MODE=personas` gives you six login personas across all three role levels with realistic permission grants — the fastest way to see how the product behaves for someone who is *not* an admin. See the User Manual's persona table for who can do what.

Run both apps:

```bash
pnpm --filter @ap/platform-api-ops feature:dev --env-mode=loose   # frontend on :3010, backend on :3011
```

`--env-mode=loose` is needed because Turborepo runs in strict env mode and would otherwise hide the exported `.env` variables from the backend. The backend port comes from `PORT` (`ops/platform-api/.env.example` sets `3011`; the code default is `3001`), and the Vite proxy targets `3011`.

`turbo.json` passes `VITEST_MAX_FORKS`/`VITEST_MIN_FORKS` (and the `_THREADS`/`_WORKERS` variants) through strict mode, so exporting them caps `pnpm test` workers on a memory-constrained machine. Set each MAX/MIN pair together: vitest 2.x rejects a max below its default min (ncpu − 1) with `minThreads and maxThreads must not conflict`.

The standalone route tree and its generator are retired (#597); the frontend package has no route generation step.

Sign in from `/login`. Authentication is mock in local development; pick a persona by its external id (`mock-admin-1`, `mock-developer-1`, `mock-user-1`, …).

> **Serving to other machines on your network?** The backend binds `0.0.0.0` (`HOST`), but the Vite dev server listens on localhost only; start it with `pnpm --filter @ap/feature-screens exec vite --host` for a colleague to reach it by IP. That origin is not a *secure context*, and browsers withhold `crypto.randomUUID` and `navigator.clipboard` there. Both are handled, but any new browser API you reach for should be checked against that constraint, because it will never reproduce on `localhost`.

---

## Layout

```
apps/platform-api      Fastify + Drizzle. Domain modules own their own permission checks.
apps/feature-screens     React + TanStack Router/Query + Vite.
packages/feature-shared   Zod contracts shared by both. The API's actual shape lives here.
packages/feature-ui       Design-system components. No domain imports.
docs/             Design, ADRs, implementation contracts, and the original prototype (reference).
```

Two rules explain most of the structure:

- **The backend is authoritative on permissions.** Frontend permission state is a display hint. A domain module decides access, and the advisory `GET /me/permissions/check` endpoint mirrors that decision so the UI cannot claim something the enforcing route would refuse.
- **The shipped UI is the UI authority.** Existing screens, `apps/feature-screens/src/lib/copy/*`, and the committed visual baselines decide layout and copy (ADR-0060). `docs/feedbackops/design-prototype/` is the original rendered prototype, kept as a reference for surfaces not built yet.

---

## Verification

| Gate | Command |
|---|---|
| Backend unit + integration | `pnpm --filter @ap/platform-api test:integration` |
| Frontend unit | `pnpm --filter @ap/feature-screens test` |
| Frontend visual regression | `pnpm --filter @ap/feature-screens test:visual` |
| Typecheck (whole monorepo) | `pnpm --filter @ap/platform-api-ops feature:typecheck` |
| Frontend typecheck gate | `pnpm --filter @ap/platform-api-ops gate:fe-typecheck` |
| Lint gate (changed files) | `pnpm --filter @ap/platform-api-ops gate:fe-lint --base origin/main` |
| Design-system lint (warning cap) | `pnpm --filter @ap/platform-api-ops lint:design` |
| Module boundaries | `pnpm --filter @ap/platform-api-ops check:boundaries` |
| Migration drift | `pnpm --filter @ap/platform-api-ops gate:db-migration-drift` |

Backend integration tests need `DATABASE_URL`, `DATABASE_URL_MIGRATE`, and `WORKSPACE_ID`, and **the global setup resets and reseeds the database** — do not run them against data you care about.

The visual suite compares against committed baselines. A new screen needs its fixture, spec, and baseline added together.

---

## Contributing

`AGENTS.md` at the repository root is binding, and each package has its own `AGENTS.md` narrowing the rules for that scope. Read the one closest to what you are changing. `CLAUDE.md` files are pointer stubs to the same content; if they ever disagree, `AGENTS.md` wins and the `CLAUDE.md` line is the bug.
