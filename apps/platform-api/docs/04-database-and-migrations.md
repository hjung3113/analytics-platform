# Database And Migrations

## Purpose

This document is the implementation-facing database contract. It supersedes schema drafts in system design docs when implementation begins.

Do not duplicate full table field lists here. Canonical design-level fields
live in `docs/product/features/15-data-contracts.md` until replaced by migrations.
Applied migrations are the final database authority.

## General Rules

```text
- All domain records include workspace_id unless explicitly global.
- VOC, Finding, Task Request, Task, and Survey records include managed_system_id in MVP.
- Prefer archive over hard delete for referenced objects.
- Cross-system optional relationships use core.entity_links.
- Direct cross-system convenience columns are denormalized projections, not canonical history.
- Migrations must be reversible when practical.
- Sensitive decisions append audit log entries.
- Inline images are stored as governed attachment records and referenced from rich content; never store base64 body images.
- Survey response and answer tables remain outside direct `platform_app` read
  access. Aggregate projections use narrow `SECURITY DEFINER` functions owned
  by `platform_survey_aggregate_owner`. The `survey.read_approved_result_excerpts_personal`,
  `survey.read_my_survey_response_history`, and `survey.read_my_answerable_surveys`
  functions are narrow
  `SECURITY DEFINER` projections owned by `platform_survey_evidence_reader_owner`:
  the first returns `response_id` with approved excerpts; the API projects
  `response_id` and writes the per-row personal-read audits only for
  `survey.read_personal_responses` holders (an app-layer gate, not a SQL-level
  one — `platform_app` holds EXECUTE),
  the second returns only `survey_id`, Survey title, `submitted_at`, and
  `identity_protected` for the session Actor's responses after the Surveys
  service supplies the session `workspace_id` and `actor_id`, and does
  not return a response ID. The third returns only Survey IDs for open Surveys
  in the session Workspace that have no response from the session Actor. The
  app reads respondent-safe Survey metadata and question counts through its
  existing `survey.surveys` and `survey.survey_questions` access, then applies
  `opened_at DESC, survey_id DESC` ordering and cursor pagination. This split
  keeps the response table hidden from `platform_app` without adding column grants
  to the definer owner. None of these functions return answer bodies or
  respondent Actor IDs.
- `survey.survey_response_excerpt_approvals` grants `platform_app` `INSERT`, column-level
  `SELECT` on every column except `response_id`, and column-level `UPDATE ("revoked_at")`
  (0057; before 0057 the `SELECT` was table-wide). The **direct table join** on
  `survey_response_excerpt_approvals.response_id` is therefore denied to `platform_app`;
  this is not SQL-level unlinkability: app-executable Survey definers remain
  composable. The historical audit/Finding/highlight/link direct-read residuals
  are superseded by FO ADR-0064 and must close in the coordinated #739/#740 cutover;
  every per-response binding read — highlight projections, the stored-highlight
  active check, and the revoke binding check — runs through the
  `survey.read_approved_response_excerpts` and `survey.read_response_excerpt_approval`
  `SECURITY DEFINER` readers owned by `platform_survey_evidence_reader_owner`.
```

### Database and role identity (#1100 a, ADR-0097; migration 0076)

The final identity is database `platform` and nine roles `platform_*`: `platform_migrate`, `platform_app`,
`platform_survey_aggregate_owner`, `platform_survey_evidence_reader_owner`,
`platform_survey_provenance_mutator_owner`, `platform_entity_links_view_owner`,
`platform_entity_links_survey_mutator_owner`, `platform_survey_derived_finding_reader_owner` and
`platform_core_audit_reader_owner`. Migrations `0000`–`0075` are immutable history and keep the old `fops_*`
role names byte for byte; this document names a role by its final name whenever it describes current privileges.

- **History replays first.** A fresh install runs `scripts/db/init.sql`, which creates database `platform` directly
  (no migration names the database) and the nine `fops_*` roles as *replay bootstrap only* with the final
  development/CI passwords (`platform_migrate` / `platform_app`; production sets its own). Init does **not** create
  any `platform_*` role. They are not runtime aliases: the runtime guard (`src/db/runtime-role.ts`) accepts only
  plain `platform_app`, and a plain `db:migrate` as `platform_migrate` fails on a fresh volume until the cutover ran.
- **Every advertised fresh entry point runs the cutover.** Dev: `docker-compose.dev.yml` Usage (script run from the
  host against the published port 5434, `CUTOVER_ALLOW_DEV_DB=1`). CI and `verify-db.sh`: `gate.sh integration` and
  the template step call the script. Release: the Postgres service has no published host port, so the stack has a
  job-only `cutover` service (compose profile `cutover`, same image as `migrate`, which ships `psql`, the script and
  `pg-target.mjs`); `scripts/release/image-smoke.sh` runs `docker compose run --rm cutover` after Postgres is up and
  before the `migrate` service. The superuser URL exists only in that one-off container; `migrate` and `backend`
  never receive it, and afterwards `migrate` runs as plain `platform_migrate`.
- **One ops entry point.** `ops/platform-api/scripts/db/cutover-0076-platform-identity.sh [all|history|rename|migrate]`
  handles every install that is not yet cut over (fresh, CI, `verify-db.sh`, existing). Stages:
  `history` replays `0000`–`0075` from a byte-identical staged copy of the migration folder as `fops_migrate`
  (`drizzle-kit migrate` has no target version); `rename` uses an admin connection to the `postgres` database to
  rename the nine roles in one transaction, then renames the database in a separate statement outside any
  transaction (PostgreSQL forbids renaming the database or login you are connected to); `migrate` is the ordinary
  `db:migrate` as `platform_migrate` and applies `0076` and everything after it. From then on migrations run
  without any admin credential.
- **Admin credential stays out of the backend.** Only the script reads `CUTOVER_ADMIN_URL`
  (`postgres://<superuser>[:<pw>]@host:port/postgres`; never the database being renamed or a renamed role). The password may be left out of the URL and given as libpq `PGPASSWORD` instead, which is how the release `cutover` job passes an existing password that contains URL-reserved characters; the script keeps `PGPASSWORD` for psql.
  `CUTOVER_OLD_MIGRATE_URL` (existing installs, `fops_migrate` against the current database) defaults to the final
  bootstrap password. `DATABASE_URL_MIGRATE` is the `platform_migrate` URL used by `migrate`. Port 5434 needs
  `CUTOVER_ALLOW_DEV_DB=1`. The database names are fixed (`feedbackops` → `platform`); `CUTOVER_OLD_DB` /
  `CUTOVER_NEW_DB` are refused unless they repeat those names, so no name is ever interpolated into admin SQL.
- **The effective target is validated before any connection.** `scripts/db/pg-target.mjs` reduces every URL
  (`CUTOVER_ADMIN_URL`, `CUTOVER_OLD_MIGRATE_URL`, `DATABASE_URL_MIGRATE`, and `CI_PG_ADMIN_URL` in `gate.sh
  integration`) to one canonical form: `postgres://` or `postgresql://`, one plain host, an explicit user and
  database, a port that is explicit or comes from `PGPORT` (so `?port=5434`, `PGPORT=5434` and `05434` are all
  port 5434), no fragment, and no query parameters except `sslmode` (`disable`, `require`, `verify-ca`,
  `verify-full`), `sslrootcert`, `sslcert` and `sslkey`. `host`, `hostaddr`, `port`, `user`, `dbname`, `options`
  and every other parameter are refused, because libpq lets them override the URL authority. The admin database
  must be `postgres`. The PG* target variables are removed from the environment before psql, `pg` or drizzle-kit
  run, so they connect where the checks looked. A refusal exits with code 2 before the first connection.
- **Preconditions and refusals (nothing is changed when it refuses).** Backend and jobs stopped; all nine roles
  old or all nine new (mixed fails closed); exactly one of databases `feedbackops` / `platform` (both or neither
  fails); the ledger holds exactly `0000`–`0075` before the role rename; no MD5 password hashes (a role rename
  clears them, so reset them to SCRAM first with `SET password_encryption = 'scram-sha-256'; ALTER ROLE <name>
  PASSWORD '<new>'`); no session on the old roles or database. The script never terminates sessions. Passwords,
  ownership, ACLs, memberships, role OIDs, NOLOGIN/NOINHERIT, the app DDL ban, audit append-only and raw survey
  privacy are untouched because roles are renamed in place.
- **Resumable.** State is read from the catalog: old roles → history/rename pending; new roles with `feedbackops` →
  only the database rename is pending; new roles with `platform` → `migrate` applies what is missing. Repeat
  `all` after any failure; finished stages are no-ops.
- **What 0076 repairs.** A rename cannot update role names written as text inside function bodies. `0076`
  asserts the nine new roles exist and no `fops_*` role remains, then rebuilds exactly three delete guards
  (`voc.guard_cluster_suggestion_bucket_delete`, `voc.guard_similarity_preview_request_delete`,
  `voc.guard_similarity_preview_budget_delete`; origin `0062` and `0070`) with `CREATE OR REPLACE`, keeping OID,
  owner, ACL and trigger bindings. The guards no longer name a role: only the table owner (`pg_class.relowner`)
  may delete rows that are still live, so any other role, including `platform_app`, fails closed. It finishes by
  failing if any other persisted function still names a `fops_` role (only the message text of
  `pgboss.create_queue` is allow-listed; the pgboss schema is untouched).
- **Readiness fails closed.** Between the rename and `0076` the old guards would never fire. `src/index.ts` runs
  `assertPlatformIdentityReady` (`src/db/identity-readiness.ts`) after the role guard and before pg-boss or HTTP:
  it refuses unless the three guards carry the `0076` comment and an owner-based body. The runtime role cannot read
  the ledger and is not granted it; the comments are the catalog-visible attestation committed in the same
  transaction as the new bodies.
- **Later migrations** `0077` and after grant to `platform_*`; a later PR that merges after another migration
  renumbers to the next free slot and regenerates its journal entry; existing entries are never edited.
- **Tests.** Unit: `runtime-role.test.ts`, `identity-readiness.test.ts`, `ops/platform-api/scripts/db/cutover-0076.test.mjs`
  (hostile URLs, `PGPORT`, zero-padded ports and injected database names are refused with a private `psql` shim
  recording that no connection was made; also covers `gate.sh integration`), `identity-cutover.guard.test.ts`
  (rehearsal target and stage-gate refusals), `apps/platform-e2e/tests-real/database-safety.test.ts`. Integration (needs a cut-over database):
  `identity-final-state.integration.test.ts`. Host rehearsal on an exclusive 5449 cluster:
  `identity-cutover.rehearsal.test.ts` (seeded upgrade, MD5/session/conflict refusals, a forced database-rename
  failure that leaves roles renamed / database old and a retry that resumes, rename invariants by OID, readiness
  refusal before `0076` and success after, repeat runs, and a migration appended after `0076` in a private copy of
  the migration folder that applies as plain `platform_migrate`). Its `beforeAll` accepts only
  `postgres://postgres:<pw>@localhost:5449/postgres` with no query string on an empty cluster and otherwise stops
  the suite before any mutation; stages run only after their predecessor passed.

### Local developer database recreation (explicit opt-in; nothing here runs automatically)

An existing local volume (for example the development database on port 5434) still holds database `feedbackops`
and the `fops_*` roles. Pick one path; neither is done for you.

1. **Keep the data: cut it over in place.** Stop the backend and jobs and close every `psql` session. Back up
   first (`pg_dump -Fc` of `feedbackops`, and a copy of the Docker volume `feedbackops_feedbackops-db-data`, which
   keeps its name: the compose file pins it, #1100 b). Then, with the container running:

   ```sh
   # The admin URL and the dev opt-in apply to this one command only (a subshell), so later seed/server commands
   # do not inherit the superuser credential. A password with URL-reserved characters goes in PGPASSWORD instead.
   (
     export CUTOVER_ADMIN_URL='postgres://postgres:postgres@localhost:5434/postgres'
     export CUTOVER_ALLOW_DEV_DB=1
     export DATABASE_URL_MIGRATE='postgres://platform_migrate:<migrate password>@localhost:5434/platform'
     # existing local roles had the passwords fops_migrate / fops_app: keep them (they are not changed); history logs in with this URL
     export CUTOVER_OLD_MIGRATE_URL='postgres://fops_migrate:fops_migrate@localhost:5434/feedbackops'
     bash ops/platform-api/scripts/db/cutover-0076-platform-identity.sh all
   )
   ```

   Then point your ignored local `.env` at `platform_app` / `platform_migrate` and database `platform`. The
   passwords stay what they were. Production sets and rotates them with `scripts/db/set-role-passwords.sh` (see
   [DB role passwords](../../../ops/platform-api/docs/release/oidc-and-images.md#db-role-passwords)); for a local database use
   `ALTER ROLE platform_app PASSWORD '...'` as an admin and update `.env` to match. If the script refuses (MD5 hash, active session, conflicting names) fix that and run the
   same command again.
2. **Start fresh.** Keep the old volume as a backup (never `docker compose down -v`, never delete it). Start an
   empty pgvector Postgres 16 with `scripts/db/init.sql` mounted into `/docker-entrypoint-initdb.d/` on a free port
   (a container and volume of your own, or the compose `db` service after you have moved the old volume aside by
   hand), then replay and cut over:

   ```sh
   # The final non-admin URLs stay in your shell for the cutover's migration, the seed and later migrations.
   export DATABASE_URL='postgres://platform_app:platform_app@localhost:<port>/platform'
   export DATABASE_URL_MIGRATE='postgres://platform_migrate:platform_migrate@localhost:<port>/platform'
   (
     # only the admin URL (and, for port 5434, CUTOVER_ALLOW_DEV_DB=1) is scoped to this subshell
     export CUTOVER_ADMIN_URL='postgres://postgres:postgres@localhost:<port>/postgres'
     bash ops/platform-api/scripts/db/cutover-0076-platform-identity.sh all
   )
   pnpm --filter @ap/platform-api db:seed
   ```

   The dev compose project is now `platform-api` and the containers are `platform-db|minio|keycloak|mailpit` (#1100 b).
   The data volume keeps its old name `feedbackops_feedbackops-db-data`: it is pinned in `docker-compose.dev.yml`
   (override with `PLATFORM_API_DB_VOLUME`), so the renamed `db` service mounts the existing database. Stop the old
   container first (`docker stop feedbackops-db feedbackops-minio`; stopping removes no data) because it holds ports
   5434 and 9000, then `docker compose -f docker-compose.dev.yml up -d`. The MinIO data is the bind mount
   `ops/platform-api/minio_data`, unchanged. Local env files use `PLATFORM_API_ENV_FILE` and `PLATFORM_API_ALLOW_DEV_DB`
   (the `FEEDBACKOPS_*` names are no longer read).

Order for both paths: backup → stop services → cutover (or fresh volume then cutover) → update `.env` →
start the backend (readiness refuses until `0076` is committed) → run `db:seed` only on throwaway data. Recovery: a
failed run is resumed by running `all` again; to abandon, restore the dump or the saved volume.

### Database prerequisite: pgvector (FO ADR-0034 D1)

`voc.voc_embeddings` stores vectors, so every database that runs migrations
must already have the `vector` extension installed. pgvector is not a trusted
extension: `CREATE EXTENSION vector` requires superuser, and `platform_migrate`
deliberately is not one. Bootstrap owns it — `scripts/db/init.sql` installs it
when the volume is first created, and migration 0042 only asserts it is
present, failing with a directive message when it is not.

An existing database created before this change needs a one-time superuser
`CREATE EXTENSION vector;`, because `init.sql` runs only on a fresh volume. The
dev image is `pgvector/pgvector:pg16` (`docker-compose.dev.yml`); the older
`postgres:16-alpine` does not carry the extension at all.

### Database prerequisite: pg_trgm (log knowledge search)

The log knowledge search index (`knowledge.search_document`, design
[`log-knowledge-search`](../../../docs/design/features/log-knowledge-search/README.md) §3.2) uses trigram indexes, so every
database that runs migrations must have the `pg_trgm` extension. It ships with the postgres image (contrib).
Bootstrap owns it like `vector`: `scripts/db/init.sql` installs it on a fresh volume and the search index migration only
asserts it is present, with a directive message when it is not. An existing database needs a one-time
`CREATE EXTENSION IF NOT EXISTS pg_trgm;` (superuser or the database owner; the extension is trusted).

The shared `platform-verify` template (`platform` database) created before this prerequisite lacks the extension, so every `verify-db.sh create` clone fails `pg-trgm.integration.test.ts`. One-time fix, safe while other lanes test (it only adds the extension; clones made earlier are untouched; do not drop or recreate the template): `PGPASSWORD=postgres psql -h localhost -p 5439 -U postgres -d platform -c "CREATE EXTENSION IF NOT EXISTS pg_trgm"`, then recreate only the clones that need it.

## Schema Namespaces

Schema namespace does not always imply module ownership. `core.entity_links` is
stored in the `core` schema for shared relational access, but link behavior,
relation validation, and visibility enforcement are owned by the Entity Linking
module.

```text
core
- workspaces
- actors
- sessions
- teams
- managed_systems
- analytics_areas
- entity_links
- audit_log
- notifications
- rate_limits
- idempotency_keys
- display_counters
- workspace_settings
- saved_views

voc
- vocs
- voc_embeddings (versioned pgvector rows; workspace scope is denormalized for active-version scans)
- voc_recommendation_decisions
- voc_cluster_autogen_shadow_candidates (non-domain pairwise measurements; FO ADR-0054)
- voc_cluster_suggestions (retained suggestion lifecycle; FO ADR-0068, #1097)
- voc_cluster_suggestion_counters / voc_cluster_suggestion_admissions / voc_cluster_suggestion_cursors (admission/scan state; FO ADR-0068, #1097)
- voc_public_updates
- public_update_review_candidates
- voc_reporter_replies
- voc_internal_comments
- voc_attachments
- reporter_facing_status_transitions
- voc_permission_decisions_seed_fixture (seed-only fixture, not a production permission cache)

voc_cluster
- voc_clusters
- voc_cluster_members

finding
- findings
- evidence_highlights
- finding_comments (Finding progress notes; `docs/adr/history/feedbackops/0049-finding-task-progress-notes.md`)

task
- tasks
- task_comments (Task progress notes; `docs/adr/history/feedbackops/0049-finding-task-progress-notes.md`)
- milestones
- work_initiatives / projects when future execution grouping is introduced

task_request
- task_requests

survey
- surveys
- survey_questions
- survey_responses
- survey_response_answers
- survey_response_excerpt_approvals
- survey_results (computed read projection; not a table)
- outcome_recovery_identities / outcome_recovery_history / outcome_recovery_presentations (56-H private response projections)
- outcome_follow_up_decisions (FO ADR-0055 follow-up decision state; one current row per response, column-scoped UPDATE, no DELETE)

dashboard
- recovery_identities / recovery_history / recovery_presentations (56-H owner-derived projections)

permission
- permission_requests
- permission_grants
- permission_denies

knowledge (log knowledge hub, migration 0080, #1193, ADR-0107)
- vendor / process_category / equipment_model / software_version (typed `code` + module-computed `code_key`; `row_version`; `active` — deactivate only, `platform_app` has SELECT, INSERT, UPDATE and no DELETE)
- model_process (model–process mapping; `platform_app` also has DELETE: a mapping is not a catalog object)
- external_identity_map (source identity to catalog target; `proposed`/`accepted`/`rejected`; no DELETE)
- migration 0082 (#1197, ADR-0109): knowledge_item, knowledge_item_revision, item_revision_evidence, item_assessment_event, item_link, item_counter. Owner XOR, append-only tables and the restricted UPDATE grant: see ADR-0109 and the storage description in [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md). The audit projection continues in migrations 0081 and 0083.

improvement (improvement items, migration 0093, #1328 a, ADR-0106 amendment 2)
- item (`item_no` unique per workspace, `problem`, `action`, `action_date date`, `status`, one `assignee_id`, Quest id + title snapshot, `origin_menu_id` + `origin_context`, effect check columns, `drop_reason`, `row_version`)
- item_target (equipment or process by external key + display name snapshot; unique per item/kind/key; index `(workspace_id, kind, external_key)` for the per-equipment history)
- item_event (append-only history; `seq` identity; `changes` before/after object)
- item_counter (`IM-<n>` allocator; `platform_app` updates `last_item_no` through it)
- the data-table grants include the migration 0094 writes (`INSERT` on item, item_target, item_event, `DELETE` on item_target only, column-limited `UPDATE` on item); the authoritative grant restrictions: §Improvement item writes below and [api/improvement-items.md](../../../docs/architecture/platform-api/api/improvement-items.md)
log_lifecycle (log lifecycle, #1444 c, design docs/design/features/log-lifecycle/README.md §3)
- development_project (`model_id`/`software_id` plain uuids, `kind`, `stage`, `owner_actor_id`, `target_date date`, `row_version`; partial unique index one open project per model)
- development_event (append-only history; `seq` per project 1..n, `kind`, `before`/`after` objects, `reason`)
- validation_round (`seq` per project, `stage`, `status`, `sample_set`, `sample_manifest_digest`, `spec_pin`, `note`, `row_version`; partial unique index one open round per project)
- round_evidence_ref (evidence locations handed to a round, #1474: `seq` per round 1..n, `file_ref`, `line`, `file_sha256`, `note`, `status`, `origin_kind`, `origin_id`, `handed_off_by`, `at`; append-only; unique per round on `(file_ref, line, file_sha256)`)
log_rules (validation catalog report, #1491 R-a, migration 0106, design docs/design/features/log-rules/README.md §3)
- catalog_report (`source_system`, `reported_by_actor_id`, `validator_version`, `report_digest` unique per workspace, `outcome` accepted|rejected, `reject_reason`, `superseded_at` + `superseded_by_report_id`; partial unique index: one current accepted report per source)
- rule_set_revision (`rule_set_key`, `revision`, `result_ref` = reported value or `revision`, `revision_digest`, `status`, `supersedes`; unique per report on `(rule_set_key, revision)` and on `(rule_set_key, result_ref)`)
- rule (`rule_key`, `title`, `summary`, `support`, `scope` jsonb, `required_default`, `rule_digest`; unique per revision on `rule_key`)
- rule_target (`position`, `format`, `target` verbatim, `requirement_ids text[]`)
- execution_request, execution_attempt, rule_result, rule_result_excerpt, queue_settings, excerpt_reader (validation request queue, #1445 d; see §Validation request queue)

log_datasets (log test datasets, #1477 D-a, design docs/design/features/log-test-datasets/README.md §3)
- dataset (`share_scope` private|workspace, `model_ids uuid[]` plain ids, `scenario_tags text[]` closed set, `status`, `synthetic`, `row_version`)
- dataset_revision (immutable; `seq` per dataset, `sample_set`, `sample_manifest_digest` unique per dataset, `input_meta`, `note`)
- dataset_candidate (`origin` manual|round_evidence, `source_ref`, `proposal`, `status` draft|approved|rejected, `reviewer_actor_id`, `reason`, `dataset_id`, `row_version`)
- rule_result_evidence (normalized evidence locations of a rule result, #1470; see §Rule result evidence)
- attempt_opinion (opinions on attempt items, #1778; see §Attempt opinions)
- expected_baseline (#1478 D-b; per `dataset_revision_id`, `seq`, `status` draft|approved|superseded, `profile_pin`, `expected_scope`, `expectations`, `parser_golden_ref` location+digest only, `author_actor_id`, `approved_by_actor_id`, `approved_at`, `superseded_at`, `row_version`; at most one approved per revision)
- regression_suite (#1479 D-c; `items` jsonb 1–20, `engine_profile_ref`, `required_pin`, `row_version`), suite_run (immutable; `suite_id`, `requested_by_actor_id`, `idempotency_key` unique per suite and actor, snapshot of profile and pin), suite_run_item (immutable; pinned `dataset_revision_id`, `baseline_id`, digests, `baseline_stale`, `request_id` plain id) — no stored run state
- suite_review_label (#1480 D-d; append-only result review labels: `suite_run_id`, `rule_id`, `dataset_revision_id`, `label` false_positive|false_negative|accepted_change|needs_review, `reason` 1–2000, `actor_id`, `at`; composite same-workspace FKs to `suite_run` and `dataset_revision`)
- baseline_event (#1478 D-b; append-only: `baseline_id`, `kind` created|updated|approved|superseded, `before`, `after`, `reason`, `actor_id`, `self_approved`, `at`)
```

`core.attachments` does not exist as a shared attachment table as of Slice 6;
attachments are domain-scoped, such as `voc.voc_attachments`. `role_levels`,
`customers`, and `contacts` are not present in the current schema. `task_request`
is the Slice 6 review-buffer namespace, with no migration that folds it back
into `task`.

## Enum Strategy

Use application-level string enums unless the database requires stronger constraints for query integrity.
MVP migrations should prefer `text` or `varchar` columns with application-level
validation. Add database `CHECK` constraints only for values that protect core
invariants or query integrity. Do not introduce native database enum types
without a dedicated migration decision.

Required enums:

```text
reporter_facing_voc_status
task_status
task_request_status
finding_status
survey_type
permission_request_status
entity_link_relation_type
entity_link_visibility
voc_source_context
severity
priority
confidence
```

Reporter-facing VOC status, VOC triage state, and Task status are separate
state machines and must use separate columns/enums. Task status changes may
create review candidates, but they must not directly overwrite reporter-facing
VOC status.

## Managed System Data Rules

```text
- core.managed_systems is the MVP registry for scope, filters, defaults, and Developer permission grants.
- core.analytics_areas rows require managed_system_id.
- Analytics Area uniqueness should be scoped to workspace_id plus managed_system_id as needed.
- Analytics Area archive preserves historical references.
- core.analytics_areas is the MVP source of truth; external BI menu keys are optional metadata, not sync ownership.
- analytics_areas.owner_team_id is a routing/defaulting hint only; permission grants remain Managed System scoped.
- project_id columns in existing drafts are transitional only; new MVP migrations should use managed_system_id for scoped records.
- Work Initiative / Project tables must not be required for VOC, Finding, Task Request, Task, Survey, Dashboard, or permission MVP scope.
```

## Adding a Field to an Owned Entity

Update the owning Drizzle table in `apps/platform-api/src/db/schema/<schema>.ts`, and update the wire contract separately: use `packages/feature-shared/src/<entity>/` where that shared schema exists; otherwise update the module's `routes.ts` request schemas and the frontend `apps/feature-screens/src/lib/api/<entity>.ts` request types/response DTO. Generate the SQL migration and Drizzle metadata with `pnpm --filter @ap/platform-api db:generate`; if SQL is hand-written, follow [Migration Naming](#migration-naming) for the journal registration and snapshot refresh—never hand-edit `apps/platform-api/migrations/meta/*.json`—and run `pnpm gate:db-migration-drift`. If the table uses column-level privileges, add the new column to the corresponding column-level grant for `platform_app` in the same migration; do not widen it to a table-level grant. Then update the owning service and required audit detail, the consuming UI, and the affected design/API docs in the same change. For example, `apps/platform-api/src/db/schema/core.ts` defines the Drizzle table, `apps/platform-api/migrations/0005_slice2_registry.sql` creates `core.managed_systems`, `apps/platform-api/src/modules/managed-systems/routes.ts` defines its request schemas, `apps/feature-screens/src/lib/api/managed-systems.ts` defines its wire DTO, `apps/platform-api/src/modules/managed-systems/managed-system-service.ts` persists and audits it, `packages/feature-shared/src/audit/managed-system.ts` defines the audit detail schema (a column missing there is silently dropped from the audit snapshot), and `apps/feature-screens/src/features/admin/managed-systems/ManagedSystemsScreen.tsx` exposes it. Amend an ADR when recording a compatible addition that leaves its decision in force; reopen the decision with a new ADR when changing or reversing it. For `managed_systems`, adding a column requires a dated amendment to FO ADR-0017 that updates the column list and audit detail; changing the semantics of `id`, `slug`, or `external_key` requires a new ADR reopening FO ADR-0017.

## Rich Content And Attachments

```text
- Rich content may be stored as structured editor JSON or sanitized HTML plus a format/version column.
- Inline images are attachment references inside the rich content document.
- Attachment rows record workspace_id, owning entity, visibility, content type, size, storage key, and audit metadata.
- External image URLs may be stored as normal links but must not render inline in MVP.
- Rich Table support is spike-gated in MVP; when enabled, rich tables are stored as structured rich content with backend size limits.
- Large spreadsheet-like data belongs in attachments, not oversized rich-content tables.
```

### Archive over delete on `voc.voc_attachments` (migration 0016)

Migration `0016_voc_attachments_grants.sql` grants `DELETE ON voc.voc_attachments TO platform_app`. The grant exists strictly to let the **hourly `core.attachments_purge` worker** reclaim unlinked attachment rows older than 24h (rows with `voc_id IS NULL AND comment_id IS NULL`). It is **not** a relaxation of the project-wide "archive over hard delete" rule:

- **User-initiated paths** (Triage Console "remove attachment", EditDescriptionModal, etc.) MUST go through the service-layer archive: set `archived_at = now()`, `archived_by_actor_id = caller`. They never issue a `DELETE`.
- **The purge worker** is the only legitimate row-deleter, and only against truly orphaned uploads that were never linked to a parent VOC or comment.

The archive-over-delete invariant is enforced in `apps/platform-api/src/modules/attachments/service.ts` (and surrounding tests), not by withholding the DB grant. Adding new code paths that issue `DELETE FROM voc.voc_attachments` requires explicit ADR-level justification — the purge worker is the lone exception.

## Index Requirements

```text
- All workspace-scoped tables index workspace_id.
- List views index workspace_id plus primary filter status.
- entity_links indexes:
  - workspace_id, source_type, source_id
  - workspace_id, target_type, target_id
  - workspace_id, relation_type
  - workspace_id, source_type, source_id, relation_type
- core.audit_log indexes: (workspace_id, created_at DESC), (workspace_id, subject_type, subject_id, created_at DESC), (workspace_id, actor_id, created_at DESC), and (workspace_id, event_type, created_at DESC).
- notifications index workspace_id, actor_id, read_at, created_at DESC.
```

## Migration Naming

```text
NNNN_slug.sql            # drizzle-kit 4-digit sequence + slug (generated or custom)
```

Examples:

```text
0022_voc_clusters.sql
0025_task_domain.sql
0027_display_id_scheme.sql
```

`drizzle-kit generate` assigns the 4-digit sequence. Timestamp prefixes are not
used in the current migrations directory.

`apps/platform-api/migrations/meta/*.json` files are Drizzle-generated metadata and
must not be hand-edited. Commit them with their generated SQL migration. The
root `pnpm gate:db-migration-drift` gate mechanically verifies that every
`migrations/*.sql` file has exactly one `_journal.json` registration (and vice
versa), runs `drizzle-kit check` against the committed migration history, then
diffs the live TS schema against a throwaway copy of the committed migrations:
`check` only validates migration-history/journal consistency — it does **not**
diff the schema, so the gate also runs `db:generate` with its output redirected
to the throwaway copy (via `DRIZZLE_OUT`) and fails if generate would add or
rewrite any SQL/journal/snapshot file. (`db:generate` first bundles
`src/db/schema/index.ts` with esbuild to the gitignored
`.drizzle-schema/schema.cjs` because drizzle-kit 0.30.1's CJS loader cannot
resolve the NodeNext `.js` specifiers the schema's cross-file imports require.)

`drizzle-kit generate` diffs against the newest snapshot under `migrations/meta`
(only the newest one matters). Hand-written migrations may land without
snapshots, so #422 added the first TS-derived baseline snapshot, generated from
the TS schema and checked against a database built by applying all migrations
then present (tables, columns and nullability match; `voc.workspace_display_counters`,
created by raw SQL in 0017, is intentionally not modeled in the TS schema).
The gate does not require a snapshot for every migration: it fails only when
`db:generate` would add or rewrite files. When it fails and the newest journal
entry has no snapshot, refresh the newest snapshot, but only after the
migration and the TS schema agree: apply all migrations to a
scratch database and compare it with the TS-derived snapshot (tables, columns,
nullability, defaults, indexes, FKs) *before* adopting a newly generated snapshot
as the baseline — otherwise a TS change the migration never applied is silently
blessed. Then run `pnpm --filter @ap/platform-api db:generate` into a scratch copy, keep
only the new meta snapshot renamed to the latest journal index, and discard the
generated SQL/journal change. The gate prints this instruction when it detects
drift and the newest journal entry has no snapshot.

Known limits of the TS-derived baseline: constraint and index *names* in
hand-written migrations (for example unnamed `REFERENCES`, which PostgreSQL names
`<table>_<column>_fkey`) differ from the names drizzle derives, and the TS schema
does not model every SQL-only object. These are intentionally SQL-only (#433):
functional `COALESCE` unique indexes on `permission.permission_grants|denies|requests`
(drizzle cannot express them), the 14 hand-written FKs on `permission.*`, the extra
indexes on those tables, and `voc.workspace_display_counters` (migration 0017).
`core.saved_views` is modeled: its unique is the 4-column
`saved_views_workspace_actor_surface_name_uq` constraint, exactly as named in 0045. A generated
`DROP CONSTRAINT`/`DROP INDEX` for such an object must be hand-checked against
the real name before use.

## Issue #165: released Task review candidates

`voc.public_update_review_candidates` is a VOC-owned durable queue of human
review obligations. Its permanent `(workspace_id, release_event_id, voc_id)`
unique key makes pg-boss retries safe; its partial pending Task/VOC key prevents
two unresolved obligations for the same Task/VOC. `platform_app` has SELECT and
INSERT plus column-scoped UPDATE only for `status`, resolver/timestamp, dismissal
reason, and actioned Public Update fields (migration 0033); it has no DELETE,
TRUNCATE, or table-wide UPDATE. Migration `0032_task_released_review_candidates.sql` also
pre-creates the Task release queue with FO ADR-0009 retry defaults. Its resolution
CHECK validates pending/dismissed/actioned fields, and its terminal-immutability
trigger rejects every rewrite of an actioned or dismissed candidate. A later
Task release must create a new candidate row; it must never reopen or mutate a
terminal decision.

## Issue #512: VOC cluster shadow measurements

Migration `0051_voc_cluster_autogen_shadow.sql` pre-creates the hourly
`voc.cluster_autogen_shadow` queue with FO ADR-0009 retry defaults and creates
`voc.voc_cluster_autogen_shadow_candidates` as a separate non-domain measurement
table. Rows are unique by workspace, sorted VOC pair, and embedding version;
`platform_app` has `SELECT`, `INSERT`, and `UPDATE`, with no `DELETE`. The shadow
handler never writes cluster, membership, recommendation-decision, VOC, or audit
rows; see FO ADR-0054 for its eligibility and reporting rules.

## Issue #510: outcome follow-up decisions

Migration `0052_outcome_follow_up_decisions.sql` creates
`survey.outcome_follow_up_decisions` (FO ADR-0055 storage option (b): state row
plus `core.audit_log` history) and the `SECURITY DEFINER` classifier
`survey.read_outcome_follow_up_state`, and replaces
`survey.count_negative_outcome_without_followup` in place with the FO ADR-0055
predicate: low rating band via the IMMUTABLE `survey.rating_band_for_value`
helper (parity-tested against `getRatingBandForValue`), closed outcome
surveys only, workspace `survey_anonymity_threshold` respected, resolution
only by an active `generated_finding` link to a `draft`/`active`/`converted`
Finding or a current `no_follow_up` decision. `platform_app` holds `SELECT`,
`INSERT`, and `UPDATE` scoped to `state`, `reason`, `decided_by_actor_id`,
`updated_at`, with no `DELETE`; `platform_survey_aggregate_owner` gained only the
column grants the new predicate reads (`surveys.status`,
`survey_questions.rating_max`, `entity_links.relation_type`/`target_id`,
`finding.findings(id, workspace_id, status)` plus schema `USAGE`,
`core.workspace_settings(workspace_id, survey_anonymity_threshold)`, and
column-scoped `SELECT` on the decision table).

Migration `0053_outcome_follow_up_read.sql` adds the part C read surface as
two more `SECURITY DEFINER` functions owned by `platform_survey_aggregate_owner`
(chosen over the evidence-reader owner because its grants already cover the
whole FO ADR-0055 classifier predicate; the items reader crosses no raw-text or
excerpt boundary): `survey.read_outcome_follow_up_survey_state` returns only
the two survey-grain booleans (`classifiable`, `follow_up_needed`) for any
`survey.read` caller, and `survey.read_outcome_follow_up_items_personal`
returns the per-poor-response review rows — response id, 1-based submission
ordinal, low-band answers with question label and bounds, resolution, the
qualifying Finding (earliest-created live `generated_finding`, returned with
its primary Managed System so the service can apply the caller's Finding read
scope), and the
current decision — only for callers that already crossed the
personal-response seam. Both reuse `survey.rating_band_for_value` and the
same predicate as `read_outcome_follow_up_state`. The owner gained only the
display columns the review list needs: `survey_responses.submitted_at`,
`survey_questions.prompt`/`sort_order`,
`outcome_follow_up_decisions.reason`/`updated_at`, and
`finding.findings.created_at`/`display_id`/`primary_managed_system_id`.

## Issue #509: notification inbox and dispatch

Migration `0054_notifications.sql` creates `core.notifications` with a
workspace and recipient Actor foreign key, a UUID `correlation_id`, and the
unique idempotency key `(workspace_id, actor_id, event_type, subject_id,
correlation_id)`. The table intentionally has no database CHECK on
`event_type`; the application catalogue owns that allowlist. Its inbox index
is `(workspace_id, actor_id, read_at, created_at DESC)`. `platform_app` has
`SELECT`, `INSERT`, and column-scoped `UPDATE` on `read_at`, `archived_at`, and
`email_sent_at`, with no `DELETE` or table-wide `UPDATE`; `platform_migrate` retains
`ALL` on the table.

The same migration pre-creates the `notifications.dispatch` pg-boss queue
with FO ADR-0009 retry defaults (5 retries, 30 second delay, backoff enabled).
Notification jobs are enqueued in the caller's transaction. The handler is
inbox-first: it commits the actor-scoped inbox row (idempotent on the unique
key above) in its own short transaction, then sends the email outside any
transaction, then stamps `email_sent_at` with a guarded update. A failed send
leaves the committed row and a null stamp, so the pg-boss retry sends again.
Email delivery is at-least-once: a crash after a successful send but before the
stamp, or two overlapping handlers that both read a null stamp, can send twice.

## Issue #182: conversion-link visibility backfill

Migration `0035_voc_task_conversion_summary_visible.sql` changes only
`core.entity_links.visibility`. Its audit-provenance predicate requires an
active `(voc, task, evidence_of)` link whose exact ID is present in the
matching `task_created_from_request` audit row's `detail.preserved_links`
array. This covers direct-VOC and Finding-propagated conversion links while
leaving manually created same-endpoint links `internal_only`. Audit payloads
without preserved-link IDs are deliberately outside backfill coverage;
provenance is never inferred from endpoint or Task Request shape. The update
is idempotent because it targets only currently `internal_only` rows.

## Seed Data

The seed is a separate, idempotent command (`pnpm --filter @ap/platform-api db:seed`,
`apps/platform-api/src/seed/index.ts`), not part of a migration. It seeds:

```text
- one workspace (WORKSPACE_ID)
- actors: mock-admin-1 (admin), mock-user-1 (user), system (admin, system actor)
- managed systems: Tableau and Power BI, default owner mock-admin-1
- 5 analytics areas: Permission Management, Usage Analytics, and Dashboard Catalog under Tableau; Permission Management and Usage Analytics under Power BI
- one fixture team, "[seed] VOC owner team", inserted through the platform_migrate URL because platform_app cannot insert core.teams (FO ADR-0019)
- 12 deterministic VOC fixtures (display_id VOC-SEED-*) with three conversation rows each, and two permission-decision fixtures (apps/platform-api/src/seed/voc-fixtures.ts)
- SEED_MODE=personas or scale: mock-admin-2, mock-user-2, mock-developer-1, mock-developer-2, and permission grants for the two developers
```

Core/personas modes do not seed Findings, Evidence Highlights, Task Requests, Tasks, Surveys, or Dashboard rows.

- `SEED_MODE=bootstrap` creates only the Workspace (`WORKSPACE_ID`, `WORKSPACE_NAME`) and the `system` Actor: no mock actors, Managed Systems, Analytics Areas, team, VOCs or knowledge fixtures. It is idempotent. Operator data uses only `bootstrap`; `core`, `personas` and `scale` are for development, test and preview databases. The first admin is then promoted with the `set-actor-role` CLI ([first-admin-bootstrap.md](../../../ops/platform-api/docs/release/first-admin-bootstrap.md)).

- `SEED_MODE=scale pnpm --filter @ap/platform-api db:seed` is for throwaway preview DBs only. It includes personas and adds 40 reporters, 5,000 VOCs, 5,000 Tasks, 300 Findings, 250 Task Requests, 60 Clusters and 25 Milestones across Tableau/Power BI, with five years of history, evidence links and memberships. Existing baseline/preview rows survive. The cohort and reserved `fops-preview-scale-complete` actor marker commit atomically; stable IDs and per-group deduplication permit partial-cohort retries when the marker is absent. Scale creates no Survey data; it inserts one VOC Evidence Highlight per `evidence_of` VOC, so `evidence_count` equals both the link count and the highlight-row count.

## Permission close-out migration contract (FO ADR-0066; migration 0058 applied)

Migration `0058_permission_request_revision.sql` adds the request revision and
`cancelled` status without altering the open-request unique index; it is applied.
Its SQL contains a history-preserving rollback note; never adopt a
TS-derived snapshot without comparing actual migrated SQL as described above.

No migration is applied by the docs decision. Implementation adds positive integer
permission.permission_requests.revision NOT NULL DEFAULT 1 and extends the existing
text status CHECK with cancelled, retaining every old status. Every successful
mutation advances revision/updated_at. Preserve permission_requests_active_uq over
the full COALESCE requester/capability/scope/source tuple and open predicate
pending/needs_more_info; cancelled falls outside it, preserving history.

Migration `0063_permission_grant_reissue.sql` (#1085) adds nullable
permission.permission_grants.superseded_at. Generated journal/snapshot accompany
it; the SQL preserves the historical expression scope columns. Apply before the
writers; migration numbering and combined metadata verification belong to the conductor. Atomic expired exact-tuple
reissue sets only that predecessor marker and inserts a new ID. Preserve original
expiry/grantor/time/revoke metadata. permission_grants_active_uq keeps every existing
COALESCE scope column, changing only its predicate to revoked_at IS NULL AND
superseded_at IS NULL. Never now(); expiry remains enforced at runtime. Checks,
scope resolution, active lists, revoke validation and seed existence checks exclude
superseded rows. Register generated SQL/journal/snapshot under the existing rules;
verify SQL-only indexes against real applied SQL, not a shortened Drizzle definition.

Inventory legacy non-null object scope requests and unsuperseded grants; retain
historical fields, reject unsupported request writes/approval, and resolve legacy
grant disposition explicitly before release without automatic widening/revocation.
Schema precedes writers; API/shared/frontend expected_revision consumers roll out
together with stale-client refresh. After cancelled/superseded rows exist, restoring
the old CHECK/unique predicate blindly is unsafe. Rollback requires explicit data
handling preserving history or a forward fix; document irreversible state in the
implementation migration plan and test audit-failure rollback of reissue.

## Close-out storage (FO ADR-0067; applied)

The new responsibility fields/settings and logical Dashboard projection shapes are in
`docs/product/features/15-data-contracts.md`. Shipped nullable Finding owner, Task Request assigned-reviewer,
Task team-assignee, Managed System reviewer pairs and Coverage thresholds with registered
SQL/generated metadata/grants in implementation chunks. Preserve existing null assignments,
completed reviewer attribution and Survey operator behavior; no provenance/assignment backfill.
XOR-or-both-null constraints and service workspace/active-team/Actor eligibility apply.

56-H registered `dashboard.recovery_identities`, `dashboard.recovery_history` and
`dashboard.recovery_presentations`, plus Survey-owned `survey.outcome_recovery_identities`,
`survey.outcome_recovery_history` and `survey.outcome_recovery_presentations`. Runtime identity
and presentation grants are SELECT/INSERT/UPDATE; histories are SELECT/INSERT only. The
journaled migration precreates `dashboard.recovery_reconcile` (5 retries, 30 seconds, backoff)
and adds narrow Survey definer readers using the existing protected owner column grants.
No existing table grants widen. Owner source/Actor/System IDs in these projections are
durable logical references, preserving evidence across owner lifecycle; only workspace
references are physical FKs. The generated follow-up migration removes the initial owner
reference FKs without deleting projection data. Index workspace/scope/category,
history `(workspace_id, resolved_at, id)`, source/Actor identity. Exact transitions commit
with source/link mutations via an injected recorder; pg-boss discovery/reconciliation is
idempotent and marks observation-only evidence honestly. Seed current identities without
inventing past repairs. Read history from the inclusive first instant of the current UTC month minus two calendar
months, ordered by resolution time/UUID and filtered by current permission before count/LIMIT; pruning never deletes
`core.audit_log` or stable/current-occurrence identity needed to prevent preference drift.
Survey response presentation/history remains a personal-gated Survey-owned adapter and
retains FO ADR-0055 state/definer/grant protections, not duplicated Dashboard resolution state.

## Analytics Area report storage boundary (FO ADR-0069; implemented #1077–#1079)

No report tables, lifecycle storage, Area backfill, mandatory classification or Task Request Area
column are introduced. Grouped owner reads and metadata batching produce the API projection.
Survey classification remains behind protected owner readers; `platform_app` gains no direct response/answer
read grant. If batching requires a new protected reader, register it
in `apps/platform-api/migrations/meta/_journal.json`, narrowly grant the owner's
needed columns, fix `search_path = pg_catalog`, revoke PUBLIC and preserve existing capability gates.
Measure grouped query plans around 5k VOCs/5k Tasks before proposing an index; no preemptive materialized cache.

## Survey provenance cutover — FO ADR-0064 (shipped #739/#740)

#739 adds generated/journaled migration `0059_survey_finding_provenance.sql`,
protected `survey.finding_response_bindings` and `survey.highlight_response_bindings`,
and scoped reader/mutator seams. Existing-DB owner prerequisites, constraints,
function signatures, cache inventory, standalone legacy-upgrade procedure and #740
coordination are in [the #739 cutover contract](../../../docs/architecture/platform-api/history/survey-provenance-cutover-739.md).
The cutover shipped (#739/#740). The cutover contract holds the verification procedure and the
standing gap: no standalone legacy-upgrade harness exists yet.

- Survey-owned protected Finding and highlight extensions retain
  workspace-qualified response/approval bindings and historical generated text.
  Fields, NULL conditions and consistency rules are in `docs/product/features/15-data-contracts.md`.
  `platform_app` has no SELECT/INSERT/UPDATE/DELETE on these extensions; use scoped
  functions with least-privileged NOLOGIN reader/separate mutator owners,
  `search_path=pg_catalog`, qualified tables, no dynamic SQL, PUBLIC EXECUTE
  revoked and explicit app EXECUTE only. Do not widen existing owner writes.
- Public Survey Finding `source_id` is NULL; title/summary contain deterministic
  allowlisted metadata only. Public Survey highlight `source_id`,
  `approved_excerpt_id` and `quote_or_summary` are NULL. Ordinary provenance/text
  remains readable under existing rules; conditional constraints enforce the split.
- Proposed/new owner-backed, explicitly column-listed `security_barrier` updatable
  link view excludes either `survey_response` endpoint in every status, with
  `WITH CHECK OPTION`. App SELECT/INSERT/UPDATE use this view, no DELETE; revoke
  raw `core.entity_links` SELECT/INSERT/UPDATE and surviving column/inherited grants.
  Survey link mutations use an Entity Links-owned narrow definer. Verify real
  conflict/RETURNING/UPDATE paths rather than assuming table SQL works on the view.
- `core.audit_log`: revoke raw app SELECT, retain INSERT/no UPDATE/DELETE. Preserve
  Actor/subject/detail identifiers and history; controlled migrate/operator reads
  supply verification. No broad app audit reader. Inventory consumers before cutover.
- Backfill/reconcile active and archived Findings, zero-highlight creations, revoked
  approvals and all link statuses; reject orphan/workspace/approval-response mismatches.
  Preserve original UUIDs, timestamps, counters and detach metadata. Sanitize only
  confirmed Survey-derived legacy mutation cache copies under FO ADR-0015's dated
  exception, preserving keys/hashes/status and exactly-once effects.
- Update application/repositories/DTOs with schema and grants in one coordinated
  release; old binaries are incompatible. Generate/review SQL, journal and snapshots
  through existing migration discipline. Neither #739 nor #740 alone proves delivery.
  Index private workspace+parent/response/approval paths and batch hydration; no audit
  JSON scan in request paths. Verify actual app ACL denial and operator history.
- This closes direct-table paths, not SQL-level unlinkability against stolen app
  credentials: permitted definers remain trusted application tools.

## Close-out assistance storage (FO ADR-0068; suggestions shipped #1096/#1097, preview shipped #1099)

Generated migration `0062_cluster_suggestion_storage.sql` (journal + snapshot) adds
`voc.voc_cluster_suggestions`, the three VOC-owned counter/cursor tables in
`docs/product/features/15-data-contracts.md`, and the default-off workspace policy. No Cluster
schema or Admin editor is added by storage #1096. Item 2 (#1097) adds the
bounded hourly queue and human review commands.
Shadow measurements and saved recommendations stay separate and unchanged.

DB checks enforce sorted/distinct pairs, positive revision/version/dimensions,
required nonempty scoring/hash metadata and exact lifecycle field combinations.
The pair unique key excludes version/state, so retained terminal identities suppress
recreation across model changes. NO ACTION FKs retain VOC/Actor/Cluster references;
write guards check workspace/MS integrity without adding domain Cluster columns or
keys, freeze initial identity/timestamp and make confirmed rows immutable. Source
archive/text/MS changes require application current-eligibility checks. Freshness,
disjoint/cap admission, revision advancement, legal review transitions and five-minute
restore belong to item 2's shipped commands, not the storage guards.

`platform_app` has SELECT/INSERT/UPDATE on suggestions, occupancy and cursors, and
SELECT/INSERT/UPDATE/DELETE on hourly admissions. An invoker guard permits app DELETE
only after the hour ends. No app TRUNCATE or durable suggestion DELETE is granted;
`platform_migrate` retains operator teardown privileges. Policy changes serialize under
the existing settings singleton, preserve Coverage/other settings, audit boolean
effective diffs only and never spend counters or advance cursors. The conductor
owns migration numbering/reconciliation and actual app/migrate throwaway-DB checks.

Paid preview requests/budgets ship in `0070_voc_similarity_preview.sql` (#1099):
no raw prose or cached candidate IDs/titles, vectors at most ten minutes,
tombstones 24h, budget buckets until UTC window expiry. Non-null scope keys
make workspace bucket conflicts atomic. The precreated VOC cleanup queue runs
every ten minutes unconditionally; UPDATE nulls expired vectors without changing
vector expiry, and invoker retention triggers restrict app DELETE to expired
24h tombstones/ended counters. SELECT/INSERT/UPDATE/DELETE is granted only on
these two operational tables, never Cluster, member or audit tables. Provider
I/O remains outside short reservation/completion transactions.

Migration `0071_voc_cluster_suggestion_generation.sql` (Drizzle journal/snapshot)
adds `(workspace_id, embedding_version, updated_at, voc_id)` on embeddings and
precreates `voc.cluster_suggestions` with the existing pg-boss retry policy.
No grants change.

Generation uses watermark freshness as a SQL prefilter and TypeScript derived
hash checks before admitting/refreshing. Pair provider/model/dimensions/version
must match the active provider identity and embedding version; dimensions are
filtered before `<=>`. The independent
`VOC_CLUSTER_SUGGESTION_CUT = 0.85` does not alter saved recommendation cuts.
Each workspace/MS transaction scans up to 200 incremental embedding sources
ordered by `(updated_at, voc_id)` and 200 reconciliation sources ordered by UUID.
The active version resets both cursor positions; initial watermark is year 0001
with the zero UUID and reconciliation starts before the first UUID. Empty
incremental pages retain their last position. A short/empty reconciliation page
wraps to the start and stamps `reconciled_at`; late old-watermark embeddings are
therefore recovered on a later sweep. Timestamp cursor strings preserve database
microseconds. Sorted pairs are deduplicated before score DESC/UUID greedy admission.

Neighbour queries apply SQL scope/archive/watermark/metadata/membership/dismissal/
terminal-pair/other-eligible-pair vetoes before distance ordering and LIMIT 10.
TypeScript hashes are checked before retaining at most ten neighbours per source;
up to ten bounded candidate pages recover peers behind stale hashes. Thus at most
400 sources, 40,000 candidate rows and 4,000 retained pairs are considered per MS
transaction. Statement timeout starts at 30s, shrinking with remaining transaction
time at scan/admission boundaries; lock timeout is at most 5s. Workspace occupancy
is recomputed over all pending rows, in pages, without actor visibility/read-ceiling
truncation. Read and occupancy keysets order by score DESC, sorted VOC UUIDs ASC,
then suggestion ID ASC, preserving ties across Managed Systems. The read ceiling
counts only rows passing elevated Finding scope and both canonical VOC visibility
predicates in SQL. Timeout rollback leaves cursors/counters/admissions unchanged.
New admission caps are five/MS/UTC hour and twenty eligible pending/workspace;
pending metadata refresh and identical retries spend no slot. Generation writes
no domain audit, Cluster/member, saved decision or Entity Link.


## Responsibility storage (#1089 / FO ADR-0067 56-D)

Migration `0060_responsibility_defaults.sql` adds nullable Finding owner, Task Request
assigned-reviewer, Task team-assignee and Managed System reviewer columns with FKs and
XOR-or-both-null checks. It performs no source UPDATE/backfill and leaves actual decision
Actor/provenance and Survey operator fields intact. Existing table grants already cover
these columns; no table-wide privilege widening or bootstrap-role change is needed.
The new Core diagnostic input table has runtime SELECT/INSERT only; `core.teams` stays
SELECT-only and `core.audit_log` immutable. Generated SQL/journal/snapshot ship together.
Workspace/active-team and Actor eligibility checks apply to explicit registry defaults;
Task Request creation and Task conversion/edit validation/routing are implemented by #1091;
VOC/Finding creation remains #1090. No additional migration or grant widening is required. The failure-input/read contract is
`docs/architecture/platform-api/api/core.md`.

## FO ADR-0064 #740 canonical read cutover

`core.entity_links` remains canonical and supplies FK/history identity. Runtime ordinary
SQL uses `core.entity_links_app`, an explicitly column-listed owner-backed simple
updatable security-barrier view with cascaded CHECK OPTION. Both Survey-response
endpoints are excluded in all statuses. App SELECT/INSERT/UPDATE are granted only on
the view; no DELETE. Raw table and column ACLs are revoked, including PUBLIC; the
migration fails closed on inherited raw grants rather than changing memberships.
App audit INSERT stays without RETURNING; raw audit SELECT is revoked, while controlled
migrate/operator history retains Actor, subject and detail. The narrow scoped Core
question/configuration projections replace the two existing audit readers.

The coordinated rollout, new owner-role prerequisite and consumer inventory are
recorded in `docs/architecture/platform-api/history/survey-link-audit-cutover-740.md`. Trusted permitted-definer
composition is the accepted limit; stolen-app-credential unlinkability is not claimed.

### #621 platform audit projection (0074)

`0074_platform_audit_projection.sql` adds `core.platform_audit_events(...)`, a `SECURITY DEFINER`
function owned by `platform_core_audit_reader_owner` (`platform_app` holds EXECUTE only). The owner gains
column SELECT on `core.audit_log(actor_id)` and `core.actors(id, external_id, actor_type)` and
nothing else; `platform_app` still has no SELECT on `core.audit_log`. The allowlist (23 subject types go out of 36 listed in `0121_eqv_layouts.sql`: `knowledge_*`, `eqv_*`
and the lifecycle owner types are never released; no `survey_response*` rows, no `entity_link` whose
`detail.source/target.type` is missing or `survey_response` or `validation_round`, permission rows only for the non-sensitive `detail.capability` list (pinned to
`CAPABILITY_META` by a test), no `detail.sensitive = true`, no `summary`/`detail` output) is in the
function body. `p_offset` is `bigint` so a far page returns no rows and the true total. Callers: `modules/core/audit/platform-audit-projection.ts` (`platformAuditEvents`, and `platformEntityAuditPage` for the `entityAudit` keyset pages, #857), used by
`modules/platform-port` (platform ADR-0069 decision 6).

### #1109 approved Survey attachment extension (0066)

`apps/platform-api/migrations/0066_survey_evidence_attachment.sql` and its generated
`meta/0066_snapshot.json`/journal extend the existing Survey provenance and Entity
Links mutator functions. No storage table changes, new owners, app table grants or
reader-owner widening are introduced. Exact column privileges and their purposes
are recorded in [the #1109 cutover section](../../../docs/architecture/platform-api/history/survey-link-audit-cutover-740.md#1109-approved-attachment-extension-0066).
The new approval-addressed response lock has PUBLIC EXECUTE revoked and app EXECUTE
only. Ownership-transfer schema CREATE is temporary and revoked before commit.
Deferred 0059 checks allow another response on a target only with its same-transaction
active internal-only `evidence_of`; generated lineage and original history stay intact.

## Issue #1226: VOC no-follow-up decisions

Migration `0072_normal_captain_marvel.sql` adds VOC-owned
`voc.no_follow_up_decisions` with composite workspace/VOC primary key, required
bounded reason, deciding Actor/time, creation/update timestamps and nullable
`withdrawn_at`. The row is re-used for subsequent decisions; source audit is
append-only history. `platform_app` has SELECT/INSERT and UPDATE only on decision,
reason, actor and transition timestamps, with no DELETE or key updates. Existing
table grants are unchanged. Drizzle-generated journal/snapshot accompany the SQL.

### #1106 platform notices (0079)

`platform.notices` (drizzle `db/schema/platform.ts`, owner `modules/platform-notices`) holds one row per notice:
UUID id, workspace, server-stamped `author_actor_id`, `created_at`/`updated_at` (never returned), integer `revision`
(`v<revision>` on the wire), bilingual title/content with `char_length` checks (200/10000), nullable `scope_id`
(targeting, not an access boundary) and `until` as a naive `timestamp` (Asia/Seoul wall clock, compared at second
precision). Index `(workspace_id, until)`. Grants: `platform_app` `SELECT, INSERT, UPDATE, DELETE` (hard delete; a
delete replays from `core.idempotency_keys`), `platform_migrate` ALL. Reserved slot `0079`: it ships after `0077`
(#1104) and `0078` (#1105); the journal and snapshot are generated when those are merged, never faked ahead of
them, and a later merger renumbers to the next free slot. Integration teardown deletes `platform.notices` and the
actor's `core.idempotency_keys` rows before `core.actors`.

### #622 platform port usage and client errors (0075)

`0075_platform_usage_client_errors.sql` creates the schema `platform` (drizzle `db/schema/platform.ts`;
not in the `drizzle.config.ts` `schemaFilter`, like `dashboard`) owned by `modules/platform-port`
(platform ADR-0069 decision 1). `platform.usage_events` holds menu entry/dwell events: identity fields only,
server actor and `received_at`, client `at`/`entered_at` kept but never read for the summary. A dwell
merges into the earlier one of the same stay through two partial unique indexes — keyed by `stay_id`
when present, else by `(workspace, actor, session, menu, entered_at)` — and the route picks the
matching `ON CONFLICT … WHERE` per row. `platform.client_errors` holds the five report fields plus
actor and the server request id. Grants: `platform_app` has `INSERT, SELECT, UPDATE` on `usage_events` and
`INSERT` only on `client_errors` (plus, from 0090, column-level `SELECT` on `workspace_id, correlation_id, menu_id, path,
name, received_at` for the VOC trace-id lookup, #606; never `actor_id` / `request_id`); `USAGE` on the schema for `platform_app` and `platform_migrate`. There is no
retention job (usage is unlimited with a manual delete path, docs/05; client-error retention is in
`.planning/backlog.md`) and no annotation table.

## DB time budgets (#1266)

The runtime app pool (`createDb(DATABASE_URL, { budgets, onPoolError })` in `src/index.ts`) bounds how long
a request can hold a connection or wait for one. Operator pools (`seed`, migrations, tests calling
`createDb(url)` without options) keep the server defaults, so long migrations are never cut.

| Env | Default | Effect |
| --- | --- | --- |
| `DB_POOL_MAX` | 10 | Max connections in the app pool |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | 5000 | Wait for a free connection (pool `connectionTimeoutMillis`) |
| `DB_STATEMENT_TIMEOUT_MS` | 15000 | Session `statement_timeout` (SQLSTATE `57014`) |
| `DB_LOCK_TIMEOUT_MS` | 5000 | Session `lock_timeout` (`55P03`) |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | 30000 | Session `idle_in_transaction_session_timeout` (`25P03`) |
| `HTTP_REQUEST_TIMEOUT_MS` | 30000 | Fastify `requestTimeout` (time to receive a complete request) |

- The session timeouts are pg client options on the pool, so the self-approval pool (`server.ts`, built from
  `dbHandle.pool.options`) inherits them; it overrides only `max` and the acquire timeout.
- A timeout error reaches the client as HTTP 503 `service.unavailable` (new shared code, closed enum in
  `@ap/feature-shared`; the `service.` prefix maps to 503 in `lib/errors.ts`). Both error handlers map it
  (`src/lib/db-timeout.ts`): the root handler and the plugin-scoped platform/menu-query transport. The warn log
  carries the request id, the kind and the SQLSTATE; never SQL text, parameters or the driver message.
- The transaction of `runIdempotentCommand` rolls back on a timeout, so the idempotency claim is released and a
  retry with the same key runs normally.
- Background work shares the app pool and therefore the defaults. Jobs that need longer set their own
  budget with `SET LOCAL statement_timeout` inside their transaction (`voc/jobs/cluster-autogen-shadow.ts`,
  `voc/jobs/cluster-suggestions.ts`), which overrides the session value. pg-boss keeps its own pool and settings.
- Every runtime pool has an `'error'` listener that logs the error name and code and continues; a failed idle
  client never ends the process.
- Shutdown (`src/lib/shutdown.ts`): the first SIGTERM/SIGINT flips a draining flag;
  the probe response is owned by [Core / Health](../../../docs/architecture/platform-api/api/core.md). Order stays pg-boss (at most 30 s) → Fastify → pool, all within 40 s; past the
  deadline the process logs and exits 1. The compose `stop_grace_period` (45 s) must stay above 40 s.

## Session purge, list indexes (#1266 b5a, migration 0084)

- **Retention.** The daily job `core.sessions_purge` (cron `30 3 * * *`, queue created by the migration because
  the runtime role cannot do pg-boss DDL) deletes `core.sessions` rows whose `expires_at` or `revoked_at` is
  older than 7 days. Active and recently dead sessions are never touched. Nothing references `core.sessions`
  (`audit_log` has no session FK), and no audit row is deleted. Deletes run 1000 rows per statement until a
  batch comes back short, so no statement approaches `DB_STATEMENT_TIMEOUT_MS`; a rerun on a clean table is a
  no-op. Code: `src/modules/core/jobs/sessions-purge.ts`.
- **No session index.** The purge is a cross-workspace maintenance query, and FO ADR-0015 requires every
  workspace-scoped index to start with `workspace_id`, so no `expires_at` / `revoked_at` index exists. With
  7-day retention the table stays in the low thousands of rows (~100 users), so the batched delete is cheap.
- **Indexes** (plain `CREATE INDEX`, not `CONCURRENTLY`; they take a write lock on the table while building, so
  apply them in the maintenance window documented with the deployment runbook): `tasks_workspace_updated_idx`
  `(workspace_id, updated_at DESC, id DESC)` and `task_requests_workspace_created_idx`
  `(workspace_id, created_at DESC, id DESC)`, matching the keyset `ORDER BY` of the Task and Task Request lists.
- **Item history.** The knowledge item detail read selects only `revisionNo, title, publishedBy, publishedAt,
  changeNote` for its revision list; the response shape is unchanged.

## Usage via pane values (#605, migration 0089)

`usage_events_via_check` on `platform.usage_events` adds `paneOpen` and `paneReplace` to the allowed `via` values (the closed set
`UsageVia`); no column, index or row changes. A server older than 0089 rejects a board `entry` that carries one of them and answers
`accepted: 0` for the whole batch, so the server is upgraded before clients that send pane values.

## VOC trace id (#606, migration 0090)

`voc.vocs.trace_id text NULL` holds the client correlation id a reporter attached to a VOC, with index
`vocs_trace_id_idx (workspace_id, trace_id)`. `platform.client_errors` gains `client_errors_workspace_correlation_idx
(workspace_id, correlation_id)` for the operational lookup, and the app role gets the column-level `SELECT` above. Existing
rows keep `trace_id = NULL`.

## Model spec tables and software release order (#1196 a, migration 0091)

Adds `knowledge.model_spec_revision`, `spec_module`, `spec_event`, `spec_event_relation` (design v0.6 §15.2; reads and grants in `docs/architecture/platform-api/api/log-knowledge.md` §Model spec reads) and `knowledge.software_version.release_order integer NOT NULL DEFAULT 0` with `CHECK (release_order >= 1)` and the index `(workspace_id, model_id, release_order)` (not unique). The migration backfills existing rows `1..n` per model by `created_at, id` before the CHECK is added; a `BEFORE INSERT` trigger turns a `0` (the default) into the model's max + 1 under a per-model advisory lock. `platform_app` gets `SELECT, INSERT` on the four spec tables only; a second trigger keeps children insert-only on `draft` revisions. No seed rows.

## Model spec writes (#1196 b1, migration 0092)

Adds `model_spec_revision.row_version integer NOT NULL DEFAULT 1` (the draft's compare-and-set version) and `reject_reason text` (`CHECK` ≤ 500), and the partial unique index `model_spec_revision_open_draft_uq (workspace_id, model_id) WHERE state = 'draft'` (one open draft per model). `platform_app` gets a column-limited `UPDATE (state, content_sha256, published_by, published_at, row_version, reject_reason, source_doc_ref)` on `model_spec_revision`; no DELETE grant exists on any of the four spec tables. A `BEFORE UPDATE` trigger `model_spec_revision_guard` refuses (`23514`) any update unless `OLD.state = 'draft'`, any change of `id`, `workspace_id`, `model_id`, `revision_no`, `schema_version`, `created_by`, `created_at`, and a draft-to-draft update that does not raise `row_version`. `spec_child_requires_draft()` now reads the revision `FOR SHARE`, so a child insert and a publish serialise. `core.platform_audit_events` is redefined from the 0085 body plus the subject type `knowledge_model_spec` and the capability `knowledge.spec.publish` (temporary `CREATE` grant, `SET ROLE platform_core_audit_reader_owner`, revoked as in 0083/0085). Actions and rules: `docs/architecture/platform-api/api/log-knowledge.md` §Model spec write actions.

## Improvement items (#1328 a, migration 0093)

Adds the `improvement` schema (`platform_app` and `platform_migrate` get USAGE) with `item`, `item_target`, `item_event` and `item_counter`. Every improvement-to-improvement reference is a composite `(workspace_id, …)` foreign key `ON DELETE RESTRICT`; actor columns (`assignee_id`, `created_by`, `updated_by`, `item_event.actor_id`) are plain foreign keys to `core.actors(id)` as in 0082, because `core.actors` has no `(workspace_id, id)` key. Cumulative status CHECKs, the same-origin compare-link CHECK and the origin-or-target rule (a deferred constraint trigger since 0094) are described in [api/improvement-items.md](../../../docs/architecture/platform-api/api/improvement-items.md) §Storage. `platform_app` gets `SELECT` on `item`, `item_target`, `item_event` and `SELECT, INSERT, UPDATE (last_item_no)` on `item_counter` (0093; the writes follow in 0094). No seed rows.

## Improvement item writes (#1328 b, migration 0094)

`platform_app` gets `INSERT` on `item`, `item_target`, `item_event`, `DELETE` on `item_target` only, and a column-limited `UPDATE` on `item` (`problem, action, action_date, status, assignee_id, quest_id, quest_title_snapshot, origin_menu_id, origin_context, effect_result, effect_note, effect_compare_link, drop_reason, row_version, updated_at, updated_by`); no DELETE on `item`/`item_event`, no UPDATE on `item_event`/`item_target`. `BEFORE UPDATE` trigger `improvement_item_guard` refuses (`23514`) a changed identity column, a `row_version` that does not rise by exactly 1, and an illegal status pair. The origin-or-target rule (Q2) is the `DEFERRABLE INITIALLY DEFERRED` constraint trigger `improvement_item_origin_or_target` on `item` (insert, update of `origin_menu_id`) and `item_target` (delete); its function re-reads the current state and skips a vanished item. `core.platform_audit_events` is redefined from the 0092 body plus the subject type `improvement_item` and the capability `improvement.manage` (temporary `CREATE` grant, `SET ROLE platform_core_audit_reader_owner`, revoked as in 0092). Actions: [api/improvement-items.md](../../../docs/architecture/platform-api/api/improvement-items.md) §Write actions.

## Log lifecycle (#1444 c)

Adds the `log_lifecycle` schema (`platform_app` and `platform_migrate` get USAGE) with `development_project`, `development_event` and `validation_round`; no FK into `knowledge` (module boundary), composite same-workspace FKs inside the schema (`ON DELETE RESTRICT`), actor columns FK `core.actors`. `platform_app` gets SELECT and INSERT on the three tables, a column-limited UPDATE on `development_project` (`software_id, stage, owner_actor_id, target_date, row_version, updated_at, updated_by`) and on `validation_round` (`status, closed_at, closed_by, row_version, updated_at, updated_by`), nothing on `development_event` beyond INSERT, and no DELETE anywhere. Walls behind the grants (they bind the migrate role too): `project_guard` (identity columns fixed, `row_version + 1`, stage moves along `LEGAL_STAGE_PAIRS`), `event_append_only` (BEFORE UPDATE OR DELETE raises), `round_guard` (input columns fixed, closed is final, `row_version + 1`). The migration also redefines `core.platform_audit_events` (0097 body + subject types `development_project`, `validation_round` + capabilities `lifecycle.project.manage`, `lifecycle.round.manage`). Contract: [api/log-lifecycle.md](../../../docs/architecture/platform-api/api/log-lifecycle.md).

## Log explorer investigation (#1468 b, migration 0109)

Adds the `log_explorer` schema (`platform_app` and `platform_migrate` get USAGE) with `investigation`: `round_id` is a plain uuid into `log_lifecycle.validation_round` (module boundary, no FK), `workspace_id` and `owner_actor_id` FK the Core tables. CHECKs: title length 1–200, origin and status sets, origin shape (`round` ⇒ `round_id` set and `sample_set` null; `standalone` ⇒ `round_id` null and `sample_set` an object), `filters` an object, `evidence` an array of at most 100. `platform_app` gets SELECT and INSERT and a column-limited UPDATE (`title, filters, evidence, status, row_version, updated_at`), never DELETE. `BEFORE UPDATE` trigger `investigation_guard` refuses (`23514`) a changed identity or origin column, a `row_version` that does not rise by exactly 1 and any edit of an archived row. The migration also re-creates `core.platform_audit_events` with the subject type `investigation`; the permission rows of `explorer.investigate` stay out of its allow-list (the capability is sensitive). Behavior: [api/log-explorer.md](../../../docs/architecture/platform-api/api/log-explorer.md).

## Knowledge drafts (#1198 a)

Adds `knowledge.draft` and `knowledge.draft_revision` (no new schema; `platform_app` already has USAGE). Composite same-workspace FKs (`target_item_id` to `knowledge_item`, owner to `equipment_model` / `software_version`; `draft_revision` to `draft`, all `ON DELETE RESTRICT`), actor columns FK `core.actors`, CHECKs for the status, origin and proposal-type sets, the create/revise column pairing, the owner XOR, the closed columns and the 64-hex digest. `platform_app` gets SELECT and INSERT on both tables, a column-limited UPDATE on `draft` (`status, latest_draft_rev, submitted_at, closed_at, closed_by, close_reason, row_version, updated_at, updated_by`), nothing on `draft_revision` beyond INSERT, and no DELETE. Walls behind the grants (they bind the migrate role too): `knowledge.draft_guard` (identity and proposal-shape columns fixed, a final status frozen, `row_version + 1`, `latest_draft_rev` stays or rises by 1, status moves along `LEGAL_DRAFT_STATUS_PAIRS`) and `draft_revision_append_only` (BEFORE UPDATE OR DELETE raises). The migration also redefines `core.platform_audit_events` (0100 body + subject type `knowledge_draft` + capability `knowledge.draft.create`). Contract: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md#knowledge-drafts-1198-a-migration-0101).

## Knowledge draft reviews (#1198 b)

Adds `knowledge.draft_review` (migration 0103; no new schema). Composite same-workspace FKs to `draft` and, for `posted_item_id` / `posted_revision_no`, to `knowledge_item` and `knowledge_item_revision` (all `ON DELETE RESTRICT`); CHECKs: decision set, digest set exactly for `approved` (64 hex), `self_approval` only for `approved`, rationale ≤ 2000 and required unless `approved`, posted item and revision set together exactly for `approved`; partial unique `draft_review_final_uq (workspace_id, draft_id) WHERE decision IN ('approved','rejected')`. `platform_app` gets SELECT and INSERT only. Wall behind the grant: trigger `draft_review_append_only` (BEFORE UPDATE OR DELETE raises `23514`, migrate role included). The audit view needs no change (subject type `knowledge_draft`). Contract: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md#review-decisions-1198-b).

## Attachment parent kind (#1451, migration 0105)

Adds `parent_kind text` and `parent_id uuid` to `voc.voc_attachments` (nullable, no FK: the parent lives in another module's schema), the partial index `voc_attachments_parent_idx (parent_kind, parent_id) WHERE parent_id IS NOT NULL` and the check `voc_attachments_parent_kind_check` (both NULL; or `voc` with `parent_id` NULL; or `validation_round` with `parent_id` set and `voc_id` / `comment_id` NULL). Backfill: every row with `voc_id` or `comment_id` gets `parent_kind = 'voc'`; unlinked rows stay NULL. Additive: no grant change (`platform_app` keeps its table-level UPDATE), the read path also treats NULL `parent_kind` with `voc_id` / `comment_id` as `voc`, and the existing VOC columns and checks are untouched. The purge job's "unlinked" predicate gains `parent_id IS NULL`. Contract: [api/attachments.md](../../../docs/architecture/platform-api/api/attachments.md).

## usageNextScreens from-menu index (#605, migration 0095)

`platform.usage_events` gains `usage_events_next_from_idx (workspace_id, name, source, from_menu_id)` — a plain
`CREATE INDEX`, not `CONCURRENTLY`, so it takes a write lock while building (usage tables are append-mostly and the
apply is part of the normal migration run; see the 0084 note on maintenance windows). The `usageNextScreens`
`kind`/`destination`/`via` aggregates (real-server-checklist §`usageNextScreens`) filter `from_menu_id = M` and
`source = 'main'`, which no existing index covers beyond the `workspace_id, name` prefix; the new key lets them read
one from menu directly. `usageSummary` and the drawer's own-entry count keep the 0075 summary/menu indexes. No grant,
trigger, constraint or backfill.

## SW change rows (#1196 c, migration 0096)

Adds `knowledge.spec_sw_change` (design v0.6 §15.2) and the unique `software_version_workspace_model_id_uq (workspace_id, model_id, id)` that the composite FKs `(workspace_id, model_id, software_id | ends_before_software_id)` point at; `retired_by_change_id` points at the table's own `(workspace_id, model_id, id)`. Append-only for `platform_app`: `GRANT SELECT, INSERT` and `UPDATE (needs_revalidation, revalidation_rev_no, retired_at, retired_by, retired_by_change_id, row_version)`, no `DELETE`; `spec_sw_change_guard` (BEFORE UPDATE) rejects other column changes, a `row_version` step other than +1, a `retired_by_change_id` that is the row itself or a row of another target in the model, and any change of a retired row. CHECKs: kinds, key length, `change_json` object ≤ 17 KiB of jsonb text (the app cap stays 16 KiB of compact serialized JSON — `::text` separator spaces get ~420 bytes of headroom over the closed v1 shapes), note ≤ 1000, flag needs `revalidation_rev_no`, retire columns move together and a retired row carries no flag. Rules and actions: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md) §SW changes. No audit projection change (existing subject type and capability).

## VOC creation mode per system (#1358, migration 0097)

`core.managed_systems` gains `voc_create_mode text NOT NULL DEFAULT 'open'` with CHECK `managed_systems_voc_create_mode_check` (`open` | `restricted`); every existing row stays `open`. `core.platform_audit_events` is redefined from the 0094 body plus the non-sensitive capability `voc.create` in the permission allowlist (temporary `CREATE` grant, `SET ROLE platform_core_audit_reader_owner`, revoked as in 0083). Rules: [ADR-0113](../../../docs/adr/0113-voc-creation-permission-per-managed-system.md).

## Concept mapping and Item subjects (#1196 e, f, migration 0098)

Adds `knowledge.common_concept`, `knowledge.spec_concept_mapping` and `knowledge.item_revision_subject`, every PK/FK with `workspace_id`. The mapping's composite FK `(workspace_id, concept_id, target_kind)` → `common_concept (workspace_id, id, kind)` forces the concept's kind; partial uniques: one open row per `(concept, model, target_key)`, one rejected row per pair (memory), one `confirmed` `equivalent` per `(model, target_key)`. `item_revision_subject` has FK `(workspace_id, item_id, revision_no)` to `knowledge_item_revision` and none to spec rows (key-based). Grants: `common_concept` and `item_revision_subject` SELECT/INSERT; `spec_concept_mapping` SELECT/INSERT and `UPDATE (review_state, reject_reason, reviewed_by, reviewed_at, row_version)` with `spec_concept_mapping_guard` (identity fixed, `row_version` +1, state only forward, a rejected row final). Rules: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md) §Concept mapping and Item subjects. No capability change; audit event types `knowledge.spec.concept_*` reuse subject type `knowledge_model_spec`.

## Compare link control characters (#1408 item 4, migration 0099)

Replaces CHECK `improvement_item_effect_compare_link_check` on `improvement.item`: the existing rules (null, or ≤ 2000 characters and `~ '^/[^/\\]'`) plus `!~ '[\u0001-\u001f\u007f]'`. A row that already holds a control character fails the migration; there is no data rewrite. Rule source: [api/improvement-items.md](../../../docs/architecture/platform-api/api/improvement-items.md).

## API tokens (#1442, migration 0101; ADR-0116)

`core.api_tokens`: `id, workspace_id, actor_id, kind ('personal'|'service'), name, prefix, secret_hash (unique), scopes text[], expires_at (nullable: no expiry is allowed), last_used_at, last_used_ip, revoked_at, revoked_by, created_by, created_at`. Only the SHA-256 of the whole token value is stored. `secret_hash` is the lookup key before the workspace is known, so its unique index is the one documented exception to "workspace_id first" (exempted by name in `role-grants.integration.test.ts`); the read-path indexes `(workspace_id, actor_id)` and `(workspace_id, created_at desc)` follow the rule. Grants: `platform_app` SELECT, INSERT and a column-limited UPDATE (`last_used_at, last_used_ip, revoked_at, revoked_by`), no DELETE; `platform_migrate` ALL.

## Knowledge draft validator reference (#1198 c)

Migration 0104 adds `knowledge.draft.validator_source_system`, `validator_run_id`, `validator_finding_id` (nullable `text`), `CHECK draft_validator_ref_check (num_nonnulls(…) IN (0, 3))` (all null or all set) and the partial unique index `draft_validator_ref_uq (workspace_id, validator_source_system, validator_run_id, validator_finding_id) WHERE validator_source_system IS NOT NULL`. No grant change (0102 grants table-wide INSERT on `draft`; the column-limited UPDATE does not list the new columns). `knowledge.draft_guard()` is replaced (`CREATE OR REPLACE`, the 0102 body) so the three columns join the identity columns that cannot change on UPDATE. Contract: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md#agent-and-validator-submission-over-api-tokens-1198-c).

## Log rules (#1491 R-a)

Migration 0106 adds the `log_rules` schema (`platform_app` and `platform_migrate` get USAGE) with `catalog_report`, `rule_set_revision`, `rule` and `rule_target`. Composite same-workspace FKs (`ON DELETE RESTRICT`), workspace-first indexes, actor column FK `core.actors`; `catalog_report_superseded_by_fk` is `DEFERRABLE INITIALLY DEFERRED` (hand-edited in the SQL: drizzle cannot express it) because the accept transaction marks the previous report before the new row exists. `platform_app` gets SELECT and INSERT on all four tables and a column-limited UPDATE on `catalog_report (superseded_at, superseded_by_report_id)`; no DELETE and no other UPDATE. Triggers, valid for the migrate role too: `rule_set_revision`, `rule` and `rule_target` refuse UPDATE and DELETE; `catalog_report` refuses DELETE and allows exactly one UPDATE, from current-accepted to superseded (`log_rules.report_guard`). The migration also re-creates `core.platform_audit_events` (0102 body) with the subject type `catalog_report` and the capability `validation.catalog.report` in the allowlists. Details: [api/log-rules.md](../../../docs/architecture/platform-api/api/log-rules.md).

## Rule result evidence (#1470, migration `*_rule_result_evidence.sql`)

`log_lifecycle.rule_result_evidence` (`rule_result_id`, `workspace_id`, `file_ref`, `line`, `file_sha256`): primary key on all of `rule_result_id, file_ref, line, file_sha256`; composite FK `(workspace_id, rule_result_id)` → `rule_result(workspace_id, id)` `ON DELETE RESTRICT`; index `rule_result_evidence_reverse_idx (workspace_id, file_ref, line, file_sha256)`; checks `line >= 1`, `file_sha256 ~ '^[0-9a-f]{64}$'`, `file_ref` 1..1024 characters. Grants: `platform_app` SELECT + INSERT, `platform_migrate` ALL; trigger `rule_result_evidence_append_only` refuses UPDATE and DELETE (test teardown disables it). The migration ends with an idempotent backfill from `rule_result.evidence` (`ON CONFLICT DO NOTHING`). Body-free by construction (no text column).

## Attempt opinions (#1778, migration 0126)

`log_lifecycle.attempt_opinion` (`id`, `workspace_id`, `attempt_id`, `item_key`, `rule_result_id` null, `actor_id`, `token_id` plain uuid, `submission_id`, `grade` text, `mark` text null, `note` text null, `evidence` jsonb default `[]`, `input_revision` text null, `producer` text null, `created_at`): composite same-workspace FKs `(workspace_id, attempt_id)` → `execution_attempt(workspace_id, id)` and `(workspace_id, rule_result_id)` → `rule_result(workspace_id, id)` (both `ON DELETE RESTRICT`; the service links only a rule result of the same attempt); unique `(attempt_id, actor_id, submission_id, item_key)`; index `(workspace_id, attempt_id, item_key, created_at desc, id desc)` and a partial index on `rule_result_id` where not null; checks `grade ~ '^[a-z0-9_-]{1,32}$'`, `mark` null or the same pattern, `char_length(item_key) between 1 and 200`, `char_length(submission_id) between 1 and 200`, `char_length(note) <= 1000`, `input_revision`/`producer` ≤ 200, `evidence` an array of at most 20. `created_at` is set with `clock_timestamp()` on insert, not the transaction start, so the later of two serialised submissions is also the later row (the current opinion of an item is its latest row). Per-attempt totals (2,000 rows, 256 KB of notes) are enforced by the service under the attempt row lock. Grants: `platform_app` SELECT + INSERT, `platform_migrate` ALL; trigger `attempt_opinion_append_only` refuses UPDATE and DELETE for every role (test teardown disables it, as for `rule_result_evidence`). No FK to a scale: keys are validated by the service against `queue_settings.opinion_scale` at write time, and old rows keep keys that later leave the scale.

`queue_settings.opinion_scale jsonb not null default '{"grades":[],"marks":[]}'` with a CHECK that it is an object whose `grades` and `marks` are arrays of at most 12; `platform_app`'s column-limited UPDATE on `queue_settings` gains `opinion_scale`. Neither `rule_result` nor `execution_attempt` changes, and the `verdict` computation (`domain/verdict.ts`), `gateAvailability` and `lifecycleSuiteResults` read no opinion column. The migration redefines nothing in `core.platform_audit_events` (audit subject stays `execution_request`). Contract: [api/log-lifecycle.md](../../../docs/architecture/platform-api/api/log-lifecycle.md) §Attempt opinions.

## Human validation issues — As-built storage / API not yet (#1808 N1)

Migration `0128_validation_issues.sql` adds six tables in `log_lifecycle`: `validation_issue`, `validation_issue_occurrence`, `validation_issue_evidence_ref`, `validation_issue_comment`, `round_comment`, `validation_issue_event`. All six grant only SELECT + INSERT to `platform_app`, ALL to `platform_migrate`; each has a BEFORE UPDATE OR DELETE trigger raising `23514`. No existing role or grant changes. Issue originals are immutable; field corrections and comment corrections are new rows. No severity or automatic PASS resolution is implemented; states arrive with 0130 below.

Composite FKs enforce workspace/project/first-Round ownership, occurrence project/issue/Round ownership and the Round → request → attempt → rule-result chain. Occurrence `project_id` and nullable `request_id` are internal ownership witnesses, not caller inputs. New uniqueness constraints on the existing parent tables support that chain without changing their rows. Location uniqueness uses PostgreSQL 16's `UNIQUE NULLS NOT DISTINCT (issue_id, round_id, attempt_id, rule_result_id)`. Evidence stores references only, unique per occurrence/file/line/hash; the service checks Round sample membership, preserves a supplied mismatched hash and serialises the 20-pointer cap under the project lock. No diagnostic reference is implemented (reopen with #1815's diagnostic contract).

Issue title is 1–200 characters, body 1–8000, optional expected/actual/repro ≤ 8000; comments are 1–4000; correction text ≤ 8000 (title corrections 1–200, body corrections nonempty). These SQL CHECKs mirror `domain/validation-issue-limits.ts`. Comment self-FKs bind the correction to the same workspace and target; event self-FKs also bind the field. `(created_at, id)` indexes support deterministic comment/history paging. Originals and corrections remain separate rows.

`validation-issue-service.ts` exposes a transaction handler for N2 and a standalone transaction wrapper. It reuses Core's existing idempotency service/store, binding the content hash to workspace/action/input and the key to the actor; receipts contain ids/counts only. Replay rechecks object visibility, returns the same result and writes no second audit. Project then Round locks precede every write; services stamp new rows with database `clock_timestamp()` after those waits, as opinion writes do. Row and body-free audit commit together. Rule-result reads check ownership ids only; machine results, verdicts, opinions, Gates and comparisons are unchanged. Input follows opinion control-character normalisation and the shared worker secret detector; oversized text is refused, never truncated.

`validation-issue-read.ts` exposes storage readers only. Issue pages order by visible `(last_activity_at, id)` descending; comment/history pages by `(created_at, id)` ascending. AES-GCM cursors bind workspace, actor, target/filters and page size, expire after 30 minutes and last for one reader instance. A first-page database timestamp fixes the activity cutoff; each page reevaluates current ACLs before aggregating counts/activity. This is a timestamp cutoff, not an MVCC snapshot across requests: a transaction already in flight at the cutoff can commit later. Defaults/max: 50/100. Hidden parents answer as missing and contribute no counts. Transport, capability declarations and permission enforcement are **not implemented in N1**; N2 must authorize before invoking these application commands and register the API separately.

Migration `0129_audit_issue_capabilities.sql` (#1808 N2) redefines `core.platform_audit_events` from the 0127 body plus the non-sensitive capabilities `lifecycle.issue.contribute` and `lifecycle.issue.link` in the permission-row allow-list only (temporary `CREATE` grant, `SET ROLE platform_core_audit_reader_owner`, revoked as in 0127). No subject type is added; tables, roles and other grants are unchanged.

Migration `0130_validation_issue_states.sql` (#1808 H3) adds `log_lifecycle.validation_issue_transition`, append-only like the N1 tables (SELECT + INSERT for `platform_app`, ALL for `platform_migrate`, trigger `validation_issue_transition_append_only`); `validation_issue` keeps no status column and nothing is backfilled: an issue without a transition is `reported`. Columns: ids, `seq` (unique `(issue_id, seq)`, the concurrency judge), `from_state`, `to_state`, `reason` (≤ 4,000), `assignee_actor_id`, `basis_comment_id`, `occurrence_id`, `duplicate_of_issue_id`, `actor_id`, `created_at`. Composite FKs bind the issue `(workspace, project, issue)`, the duplicate to the same project, the basis comment to the same issue and the occurrence to the same issue (the migration adds `UNIQUE (workspace_id, issue_id, id)` on `validation_issue_occurrence` for it). CHECKs carry the state list, the required inputs (reason, assignee, basis comment, occurrence only for `fix_verified`, duplicate only for `dismissed` and never itself) and `seq 1 ⇒ from reported`. The BEFORE INSERT guard `validation_issue_transition_guard` checks the chain (`seq − 1` exists and its `to_state` is `from_state`), the legal pairs between the `LEGAL_ISSUE_PAIRS` markers (drift test against `domain/validation-issue-states.ts`) and that a `fix_verified` occurrence's Round was created after the previous transition; it reads no rule result, verdict, opinion or Gate. The migration also redefines `core.platform_audit_events` from the 0129 body with `lifecycle.issue.triage` appended to the permission-row allow-list (same temporary grant and role switch). No existing role or grant changes.

## Validation request queue (#1445 d)

Migration 0108 adds `execution_request`, `execution_attempt`, `rule_result`, `rule_result_excerpt`, `queue_settings` and `excerpt_reader` to `log_lifecycle` (composite same-workspace FKs, `ON DELETE RESTRICT`; `round_id` required; attempts hold the worker actor FK and the token id as a plain uuid). `platform_app` gets SELECT and INSERT on all six; a column-limited UPDATE on `execution_request` (`state, attempt_count, claimed_by_actor_id, lease_expires_at, last_heartbeat_at, cancel_reason, row_version, updated_at, ended_at`), `execution_attempt` (`outcome, ended_at, executor_version, executor_digest, rule_set_revision, input_manifest_digest, result_digest, verdict, worker_summary`), `queue_settings` (`run_window, lease_seconds, immediate_limit, excerpt_retention_days, updated_at, updated_by`) and `excerpt_reader` (`granted_by, granted_at, revoked_at`); no UPDATE on `rule_result` and `rule_result_excerpt` (the excerpt body is erased only through the definer function `log_lifecycle.erase_excerpts`: owner = table owner, `search_path = pg_catalog`, EXECUTE for `platform_app` only; the trigger `rule_result_excerpt_guard` allows one UPDATE, live row → empty body with `deleted_at`/`deleted_reason`; the CHECK allows an empty body only with `deleted_at`), and no DELETE anywhere (pinned in `role-grants-product-tables.integration.test.ts`). Walls that bind the migrate role too: `request_guard` (identity and input columns fixed, `row_version + 1`, `attempt_count` stays or rises by 1, state along `LEGAL_REQUEST_PAIRS`), `attempt_guard` (identity fixed; outcome `running→succeeded|failed|lease_expired`, `lease_expired→succeeded|failed`, `lease_expired→running` with `ended_at` cleared for a heartbeat nobody contested, otherwise final), CHECKs (a claimed request carries its lease and no other state does; an attempt is `succeeded` exactly when it has a verdict and a result digest). The Round's sample immutability once a request exists is already enforced for every round by `round_guard` (#1444 c) and by the absence of an edit action. The migration pre-creates the pg-boss queue `lifecycle.excerpt_purge` (the runtime role cannot do pg-boss DDL). The migration redefines `core.platform_audit_events` (0102 body + subject types `execution_request`, `queue_settings`, `excerpt_reader`). Settings (run window, lease, immediate limit, excerpt retention days) live in `queue_settings`, not in `workspace_settings` (see [api/log-lifecycle.md](../../../docs/architecture/platform-api/api/log-lifecycle.md) §Validation request queue). Contract: [api/log-lifecycle.md](../../../docs/architecture/platform-api/api/log-lifecycle.md).

## Log test datasets (#1477 D-a)

Adds the `log_datasets` schema (`platform_app` and `platform_migrate` get USAGE) with `dataset`, `dataset_revision` and `dataset_candidate` (migration file `*_log_datasets.sql`); no FK into `knowledge` or `log_lifecycle` (module boundary), composite same-workspace FKs inside the schema (`ON DELETE RESTRICT`), actor columns FK `core.actors`. CHECKs: name 1–200, share scope, status, the tag set (`<@` the closed list), 64-hex digest, object-typed jsonb, text lengths, `row_version >= 1`, candidate `draft` ⇔ no decision columns. Unique `(workspace_id, dataset_id, sample_manifest_digest)`: the same content twice in one dataset is refused. `platform_app` gets SELECT and INSERT on the three tables, a column-limited UPDATE on `dataset` (`name, purpose, share_scope, model_ids, scenario_tags, status, row_version, updated_at, updated_by`) and on `dataset_candidate` (`status, reviewer_actor_id, reason, dataset_id, decided_at, row_version`), no DELETE anywhere and no UPDATE on `dataset_revision`. Triggers (`23514`): `dataset_guard` (identity columns fixed, `row_version + 1`, archived is final), `dataset_revision_immutable` (UPDATE and DELETE refused for every role), `candidate_guard` (input columns fixed, `draft` → decided once). The audit projection `core.platform_audit_events` is the **0109** body plus the capability `dataset.manage` in the permission-row allow-list only. The subject types `dataset`, `dataset_revision` and `dataset_candidate` are **not** projected: a private dataset's ids must not reach `console:access` Admins, so those events stay in `core.audit_log` outside the platform audit trail until a caller-aware projection exists (backlog in the design status note). Roles untouched. Contract: [api/log-datasets.md](../../../docs/architecture/platform-api/api/log-datasets.md).

## Log test dataset baselines (#1478 D-b)

Migration `*_log_datasets_baseline.sql` adds `log_datasets.expected_baseline` and `log_datasets.baseline_event` (composite same-workspace FKs, `ON DELETE RESTRICT`; `expected_baseline` → `dataset_revision`, `baseline_event` → `expected_baseline`). `expected_baseline` has the partial unique index `expected_baseline_one_approved_uq` (one `approved` per revision), `UNIQUE (workspace_id, dataset_revision_id, seq)` and CHECKs for the status set, the JSON shapes (`profile_pin` object, `expected_scope`/`expectations` arrays) and the status/approval columns agreeing. The expectation vocabulary (`PASS·FAIL·WARN·NOT_APPLICABLE·EXPECTED_UNSUPPORTED`) is enforced in app code, the DB holds the shape. `platform_app`: SELECT + INSERT on both tables, column-limited UPDATE on `expected_baseline` (`status, profile_pin, expected_scope, expectations, parser_golden_ref, approved_by_actor_id, approved_at, superseded_at, row_version, updated_at`), no DELETE, no UPDATE on `baseline_event`. Guard trigger `expected_baseline_guard` (every role, migrate included): identity columns never change, `row_version` rises by exactly 1, status moves only `draft → approved → superseded`, content is immutable once not `draft` (also in the approving update), approval columns never change, `superseded` is final. Trigger `baseline_event_append_only` refuses UPDATE and DELETE for every role. The audit projection `core.platform_audit_events` is NOT replaced: the subject type `dataset_baseline` stays out of it (a private dataset's ids), and the new capability is sensitive, so its permission rows are not in the allow-list either.

Migration 0113 (#1446 e) adds `log_lifecycle.gate_decision` (append-only; composite same-workspace FK to `validation_round`, `RESTRICT`; actor FK `core.actors`; CHECKs: decision and stage sets, `basis` object, `reason` 1–2000, `exception` set exactly when `decision = 'exception'`). `platform_app`: SELECT and INSERT only; `platform_migrate`: ALL, but the trigger `gate_decision_append_only` refuses UPDATE and DELETE for every role. Additive; no existing grant, trigger or function changes, and `core.platform_audit_events` is **not** redefined (the Gate audit row reuses subject type `validation_round`; the sensitive capability `lifecycle.gate.decide` stays out of the permission-row allow-list).
## Request subject and regression suites (#1479 D-c)

Migration `*_log_suite_runs.sql` (additive): `log_lifecycle.execution_request.round_id` becomes nullable and the table gains `suite_run_item_id`, `suite_run_id`, `subject_sample_set`, `subject_sample_manifest_digest`; CHECK `execution_request_subject_check` = exactly one of `round_id` / `suite_run_item_id`, and a suite subject has its run id, sample list and a 64-hex digest (`execution_request_subject_digest_check`); partial unique index on `(workspace_id, suite_run_item_id)` (one request per item) and a partial index on `(workspace_id, suite_run_id, state)` for the per-user run count. `request_guard` (replaced) also refuses a change of the four new columns; `erase_excerpts` (replaced, same signature and grants) LEFT-joins the Round and, for a suite subject, uses the finish of its suite run as the retention clock. `log_datasets` gains `regression_suite` (`platform_app`: SELECT, INSERT, UPDATE on `name, items, engine_profile_ref, required_pin, row_version, updated_at, updated_by`; guard trigger: identity columns fixed, `row_version` + 1), `suite_run` and `suite_run_item` (SELECT, INSERT only; trigger refuses UPDATE and DELETE for every role). Composite same-workspace FKs (`ON DELETE RESTRICT`). `core.platform_audit_events` is replaced with the 0110 body + `dataset.suite.run` in the permission-row allow-list only; no dataset or suite subject is projected. No DELETE grant anywhere.

## Result review labels (#1480 D-d)

Migration `*_log_review_labels.sql` (additive): `log_datasets.suite_review_label` (`id`, `workspace_id`, `suite_run_id`, `rule_id` 1–200, `dataset_revision_id`, `label` CHECK in the four names, `reason` CHECK 1–2000, `actor_id` → `core.actors`, `at`); composite same-workspace FKs `(workspace_id, suite_run_id)` → `suite_run` and `(workspace_id, dataset_revision_id)` → `dataset_revision` (`ON DELETE RESTRICT`); index `(workspace_id, suite_run_id, dataset_revision_id, rule_id, at)`. Grants: `platform_app` SELECT and INSERT only; `platform_migrate` ALL. Trigger `suite_review_label_append_only` refuses UPDATE and DELETE for every role (the migrate role included). Roles are untouched. The `core.platform_audit_events` projection is NOT changed: `reviewLabelAdd` needs no new capability and dataset subjects stay out of it (a private dataset's ids must not reach `console:access` Admins).


## Round evidence locations (#1474 X-h)

Adds `log_lifecycle.round_evidence_ref` (migration file `*_round_evidence_ref.sql`): the body-free evidence locations the log explorer hands to a Round. Composite same-workspace FK to `validation_round` (`ON DELETE RESTRICT`), `handed_off_by` FK `core.actors`. CHECKs: `seq` 1–1000 (the per-round cap), `file_ref` 1–1024 characters, `line >= 1` (the column is `bigint`, mapped to a JS number: the intake accepts any positive safe integer), `file_sha256` 64 lower-case hex, `note` at most 500, `status` in (`match`, `hash_mismatch`, `unresolved`), `origin_kind` = `log_explorer`. Unique `(workspace_id, round_id, seq)` and `(workspace_id, round_id, file_ref, line, file_sha256)`. `platform_app` gets SELECT and INSERT only; trigger `round_evidence_ref_append_only` (BEFORE UPDATE OR DELETE, `23514`) binds every role including `platform_migrate`. Roles are not touched, and `core.platform_audit_events` is not redefined: `validation_round` is already a listed subject type and the new event type maps through the vocabulary the application passes (`lifecycle.round.evidence_ref_attached` → `update`). Behavior: [api/log-lifecycle.md](../../../docs/architecture/platform-api/api/log-lifecycle.md#evidence-locations-1474-x-h).
## Knowledge object access (#1504 S-a, migration `*_object_access_rules.sql`)

Adds `access_mode text NOT NULL DEFAULT 'internal'` (CHECK `internal|restricted`) to `knowledge.equipment_model`, `software_version` and `knowledge_item` (existing rows stay `internal`), and `knowledge.object_access_rule`: `rule_id` PK, `workspace_id` FK, `target_kind` (`model|software|item`), polymorphic `target_id` (judged by the write service, no FK across three tables), `grantee_kind` (`actor` only), `grantee_id` FK `core.actors`, `effect` (`allow|deny`), `valid_until`, `created_by/at`, `revoked_at/by` (CHECK both or neither). Indexes: partial `(workspace_id, grantee_id, target_kind, target_id) WHERE revoked_at IS NULL` for the per-request lookup, `(workspace_id, target_kind, target_id, created_at)` for the manager's list. Grants (hand-written tail of the migration): `platform_migrate` ALL; `platform_app` SELECT, INSERT and column-limited `UPDATE (revoked_at, revoked_by)` on the rule table, no DELETE; `UPDATE (access_mode)` joins the column list of `knowledge_item` (models and SW versions already hold a table-level UPDATE). Roles untouched. The audit projection `core.platform_audit_events` is unchanged: `knowledge.access.manage` is sensitive and the subject type `knowledge_access` is not projected. Contract: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md#object-access-1504-s-a-migration-0118).

## Item Event relation record (#1505 S-b)

Adds `knowledge.item_event_relation_record` (migration file `*_item_event_relation_record.sql`): one row per `before` pair of events of an immutable item revision, `(workspace_id, item_id, revision_no, ordinal)` PK, composite FK to `knowledge_item_revision`, no FK to spec rows (stable `module/event` keys, `resolved` flag). CHECKs: kind `observed|expected`, predicate `before`, key length 1–1200, `source_key <> target_key`, ordinal 1–20. Unique `(workspace_id, item_id, revision_no, kind, source_key, predicate, target_key)` and the direction index `(workspace_id, md5(source_key), predicate, md5(target_key), kind)` (the unique and the direction index are md5 expression indexes so long keys fit the btree limit; lookups must use `md5(key) = md5($n)`). Grants: `platform_app` SELECT/INSERT only (no UPDATE/DELETE), `platform_migrate` ALL; no role change. Rules: [api/log-knowledge.md](../../../docs/architecture/platform-api/api/log-knowledge.md) §Item Event relation records.

### Search index (#1506 S-c, migration file `*_search_index.sql`)

Derived, rebuildable tables of `knowledge` for the log knowledge search (design `docs/design/features/log-knowledge-search/README.md` §3.2, §3.3, §5). The migration first asserts `pg_trgm` (bootstrap installs it; a database without it fails with a directive message, like 0042 for pgvector).

- `search_document` `(workspace_id, item_id, index_generation)` PK, composite FK to `knowledge_item` (`ON DELETE CASCADE`: derived data): `revision_no`, `source_row_version`, `search_text`, `tsv` (GIN, `to_tsvector('simple', search_text)`), `term_text` (GIN `gin_trgm_ops`), `indexed_at`. No access, excerpt or 지식 근거 column. An upsert only replaces a row whose `source_row_version` is not newer.
- `search_outbox`: identity `outbox_id`, `(workspace_id, item_id)` FK (cascade), `reason` (`published|archived|access_changed|concept_changed|alias_changed|subject_changed|catalog_changed|reindex`), `state` (`pending|running|done|failed|dead`), `attempt_count`, `available_at`, `last_error` (a code), timestamps. Partial unique `(workspace_id, item_id) WHERE state = 'pending'`; claim index on due `pending|failed` rows. No payload.
- `search_index_pointer` (one row per workspace): `active_generation`, `building_generation`, `previous_generation`, `previous_retired_at`; a switch or rollback is one UPDATE. The consumer writes all kept generations.
- `search_backfill_progress` (one row per workspace): `generation`, `state` (`running|done`), `last_item_id`, `total_count`, `done_count`, timestamps.
- Pending coalescing uses `ON CONFLICT ... DO UPDATE` of `available_at` (the request marker) and `updated_at`, retaining the row lock until the source transaction commits. A drain skips a writer-locked row; if the drain locks first, the writer waits and inserts a fresh pending notification once the old row leaves `pending`. This preserves delivery without a payload. Requeue locks the selected dead outbox IDs, enqueues their distinct Items, and closes only those IDs; a row that becomes dead concurrently stays open for the next requeue.
- The progress row's `generation` also records the allocation watermark: rollback and retention preserve it, and backfill never decreases it. Under the pointer's `FOR UPDATE` lock, a build allocates `max(active, previous, progress.generation) + 1` and updates the pointer and progress atomically. Abandoned numbers are never reused, even after their documents are purged; an in-flight old consumer can only write an abandoned number, so it cannot contaminate the new build. This uses existing columns and grants.
- Grants (hand-written in the migration): `platform_app` gets SELECT/INSERT/DELETE on `search_document` and `search_outbox` and UPDATE on the processing columns only (document: `revision_no, source_row_version, search_text, tsv, term_text, indexed_at`; outbox: `state, attempt_count, available_at, last_error, updated_at`); SELECT/INSERT and column UPDATE on the pointer and the progress tables, no DELETE. `platform_migrate` ALL. The migration also pre-creates the pg-boss queues `knowledge.search.drain` and `knowledge.search.backfill`.
- Jobs: `knowledge.search.drain` (cron every minute, keeps polling for ~55 s; `FOR UPDATE SKIP LOCKED` batches of 100, per-Item advisory lock, backoff 30 s doubling to 1 h, `dead` after 8 attempts) and `knowledge.search.backfill` (cron every 10 minutes and once at start; keyset batches of 500, resumable). Neither is registered under `JOBS_DISABLED`. Finished outbox rows are pruned after a day; a retired generation is deleted after 7 days.
- The drain checks its deadline after every batch, including full batches. A batch already in progress may finish after the deadline; the job then yields with any remaining backlog pending.

