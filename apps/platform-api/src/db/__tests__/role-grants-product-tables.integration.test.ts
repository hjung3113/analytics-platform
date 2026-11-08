/**
 * Slice 3 #22 — DB role grants drift check for product tables.
 *
 * Asserts that `platform_app` holds exactly the DML privileges each product-schema
 * base table is designed for — no more, no less. Most product tables are
 * full-DML (SELECT/INSERT/UPDATE/DELETE), but several are intentionally
 * append-only or read-only per migration 0010 (`0010_slice3_voc_foundation.sql`):
 *
 *   - voc_public_updates / voc_reporter_replies / voc_internal_comments:
 *     SELECT + INSERT only. These are immutable conversation-feed rows; the
 *     app inserts and reads them but never edits or deletes (see voc/repo.ts).
 *   - reporter_facing_status_transitions: SELECT only. A static
 *     allowed-transition lookup table seeded by migration; the app only reads
 *     it (see voc/transitions.ts).
 *
 * (Note: ADR-0008 itself governs `core.audit_log` immutability only — it does
 * not mandate full-DML for product tables. The append-only grants above come
 * from the 0010 schema design, which keeps reporter-facing VOC history
 * immutable at the role level rather than relying on app code.)
 *
 * The check catches drift in BOTH directions:
 *   - under-grant: a `RENAME`/`CREATE`/`REVOKE` drops a required privilege
 *     without a paired re-GRANT (e.g. missing DELETE on voc.voc_attachments
 *     after 0014's rename, fixed by 0016);
 *   - over-grant: a migration silently widens an append-only table to
 *     UPDATE/DELETE, eroding the immutability guarantee.
 *
 * Skipped without DATABASE_URL / DATABASE_URL_MIGRATE / WORKSPACE_ID,
 * matching the existing role-grants integration test.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';

const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const PRODUCT_SCHEMAS = [
  'core',
  'dashboard',
  'finding',
  'improvement',
  'log_explorer',
  'log_datasets',
  'log_lifecycle',
  'log_rules',
  'permission',
  'survey',
  'task',
  'task_request',
  'voc',
  'voc_cluster',
] as const;
const DML_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
type DmlPrivilege = (typeof DML_PRIVILEGES)[number];

const FULL_DML: readonly DmlPrivilege[] = DML_PRIVILEGES;
const SURVEY_AGGREGATE_FUNCTIONS = [
  'count_negative_outcome_without_followup',
  'rating_band_for_value',
  'read_outcome_follow_up_items_personal',
  'read_outcome_follow_up_state',
  'read_outcome_follow_up_survey_state',
  'read_result_aggregates',
  'read_result_response_count',
] as const;

// Tables intentionally narrower than full-DML for platform_app, keyed by the
// fully-qualified `schema.table` name. Grants come from the cited migrations.
//
// A table absent from this map is asserted as full-DML. That default is why a
// new narrower table shows up here as a missing-DELETE failure rather than as
// silence: the entry is the design record, and adding one is a decision, not
// paperwork (#207).
const EXPECTED_GRANTS: Record<string, readonly DmlPrivilege[]> = {
  'survey.finding_response_bindings': [],
  'survey.highlight_response_bindings': [],
  // Migration 0000 makes the audit log append-only so application writes retain
  // an immutable history.
  'core.audit_log': ['INSERT'],
  // 0058: safe routing failures are append-only runtime diagnostic inputs.
  'core.responsibility_default_failures': ['SELECT', 'INSERT'],
  // Migration 0086: the startup sync upserts the space → system link and flips `declared`; links are never
  // deleted (an undeclared link is shown as disconnected), so platform_app holds no DELETE.
  'core.space_links': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0054 keeps inbox rows durable; only read/archive/email claim
  // state has column-scoped UPDATE grants.
  'core.notifications': ['SELECT', 'INSERT'],
  // Migration 0027 keeps counter mutation inside next_display_id, a SECURITY
  // DEFINER function; the application can only read the backing counter rows.
  'core.display_counters': ['SELECT'],
  // Migrations 0018 and 0019 record canonical link history by inserting and
  // soft-detaching links (status='detached'), never hard-deleting them.
  'core.entity_links': [],
  // Migration 0009 revokes writes per ADR-0019 Section C: teams remain a
  // read-only placeholder until a team-management service ships.
  'core.teams': ['SELECT'],
  // Migration 0041 grants the settings upsert path; settings are updated in
  // place and are not deleted by the application.
  'core.workspace_settings': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0021 models evidence as maintained finding context, allowing
  // creation and correction but no application hard-delete path.
  'finding.evidence_highlights': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0020 uses Finding status transitions (including archived) rather
  // than application hard deletes.
  'finding.findings': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0048 makes Finding progress notes append-only.
  'finding.finding_comments': ['SELECT', 'INSERT'],
  // Migration 0025 models Task lifecycle through status updates, not deletion.
  'task.tasks': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0049 follows the approved #514 plan: Milestones are not hard-deleted.
  'task.milestones': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0048 makes Task progress notes append-only.
  'task.task_comments': ['SELECT', 'INSERT'],
  // Migration 0023 preserves Task Request review/conversion history through
  // status transitions rather than application hard deletes.
  'task_request.task_requests': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0022 makes clusters draft/confirmed records, updated in place
  // rather than deleted by the application.
  'voc_cluster.voc_clusters': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0022 treats membership as a mutable set: members are added or
  // removed, but their immutable join rows are never updated.
  'voc_cluster.voc_cluster_members': ['SELECT', 'INSERT', 'DELETE'],
  'survey.surveys': ['SELECT', 'INSERT', 'UPDATE'],
  'survey.survey_questions': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'survey.survey_responses': ['INSERT'],
  'survey.survey_response_answers': ['INSERT'],
  // UPDATE ("revoked_at") is column-scoped, and since #569 SELECT is also
  // column-level (every column except response_id); both are asserted by the
  // #187 evidence access integration test. role_table_grants must remain
  // without table-wide UPDATE or SELECT on this table.
  'survey.survey_response_excerpt_approvals': ['INSERT'],
  'voc.workspace_display_counters': ['SELECT'],
  'voc.voc_public_updates': ['SELECT', 'INSERT'],
  'voc.voc_reporter_replies': ['SELECT', 'INSERT'],
  'voc.voc_internal_comments': ['SELECT', 'INSERT'],
  // UPDATE is deliberately column-scoped and asserted below. role_table_grants
  // must remain without table-wide UPDATE.
  'voc.public_update_review_candidates': ['SELECT', 'INSERT'],
  // 0072: UPDATE is column-scoped (asserted below); no table-wide UPDATE or DELETE.
  'voc.no_follow_up_decisions': ['SELECT', 'INSERT'],
  'voc.reporter_facing_status_transitions': ['SELECT'],
  // No DELETE by design (migration 0044): a dismissal the application can
  // erase is not a dismissal that survives recomputation. UPDATE is granted
  // for the one legal transition out of a terminal state — a dismissed pair
  // promoted to `confirmed` in place (ADR-0034 D3).
  'voc.voc_recommendation_decisions': ['SELECT', 'INSERT', 'UPDATE'],
  // Issue #512 measurements are durable, but application code cannot erase
  // an observation; migration 0051 grants only the shadow worker's DML needs.
  'voc.voc_cluster_autogen_shadow_candidates': ['SELECT', 'INSERT', 'UPDATE'],
  // ADR-0068: durable pair history; only ended hourly admission buckets can be reclaimed.
  'voc.voc_cluster_suggestions': ['SELECT', 'INSERT', 'UPDATE'],
  'voc.voc_cluster_suggestion_counters': ['SELECT', 'INSERT', 'UPDATE'],
  'voc.voc_cluster_suggestion_admissions': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'voc.voc_similarity_preview_requests': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'voc.voc_similarity_preview_budgets': ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'voc.voc_cluster_suggestion_cursors': ['SELECT', 'INSERT', 'UPDATE'],
  // Migration 0052 (ADR-0055): the current follow-up decision is updated in
  // place, never deleted. UPDATE is column-scoped and asserted below.
  'survey.outcome_follow_up_decisions': ['SELECT', 'INSERT'],
  // Migration 0068: mutable identity/preferences, append-only immutable history.
  'dashboard.recovery_identities': ['SELECT', 'INSERT', 'UPDATE'],
  'dashboard.recovery_presentations': ['SELECT', 'INSERT', 'UPDATE'],
  'dashboard.recovery_history': ['SELECT', 'INSERT'],
  'survey.outcome_recovery_identities': ['SELECT', 'INSERT', 'UPDATE'],
  'survey.outcome_recovery_presentations': ['SELECT', 'INSERT', 'UPDATE'],
  'survey.outcome_recovery_history': ['SELECT', 'INSERT'],
  // Migrations 0093/0094 (#1328): items are inserted and updated by column (asserted below), never deleted; a target set
  // is replaced (DELETE) because its history lives in item_event, which is append-only; the counter's UPDATE is
  // column-scoped (last_item_no) and asserted by the improvement items integration test.
  'improvement.item': ['SELECT', 'INSERT'],
  'improvement.item_target': ['SELECT', 'INSERT', 'DELETE'],
  'improvement.item_event': ['SELECT', 'INSERT'],
  'improvement.item_counter': ['SELECT', 'INSERT'],
  // Log lifecycle (#1444 c): projects and rounds are inserted and updated by column (asserted below), the event table
  // is append-only; nothing is deleted.
  'log_lifecycle.development_project': ['SELECT', 'INSERT'],
  'log_lifecycle.development_event': ['SELECT', 'INSERT'],
  'log_lifecycle.validation_round': ['SELECT', 'INSERT'],
  // Migration 0116 (#1474): evidence locations handed to a round are append-only.
  'log_lifecycle.round_evidence_ref': ['SELECT', 'INSERT'],
  // Log rules (#1491): the four tables are insert-only; catalog_report alone has a column-limited UPDATE (asserted below).
  'log_rules.catalog_report': ['SELECT', 'INSERT'],
  'log_rules.rule_set_revision': ['SELECT', 'INSERT'],
  'log_rules.rule': ['SELECT', 'INSERT'],
  'log_rules.rule_target': ['SELECT', 'INSERT'],
  // Migration 0108 (#1445 d): requests, attempts, settings and the excerpt readers are inserted and updated by column
  // (asserted below); rule results and excerpts are append-only; nothing is deleted.
  'log_lifecycle.execution_request': ['SELECT', 'INSERT'],
  'log_lifecycle.execution_attempt': ['SELECT', 'INSERT'],
  'log_lifecycle.rule_result': ['SELECT', 'INSERT'],
  'log_lifecycle.rule_result_evidence': ['SELECT', 'INSERT'],
  'log_lifecycle.rule_result_excerpt': ['SELECT', 'INSERT'],
  'log_lifecycle.queue_settings': ['SELECT', 'INSERT'],
  'log_lifecycle.excerpt_reader': ['SELECT', 'INSERT'],
  // Log explorer (#1468 b): investigations are inserted and updated by column (asserted below); nothing is deleted.
  'log_explorer.investigation': ['SELECT', 'INSERT'],
  // Log test datasets (#1477 D-a): dataset and candidate are updated by column (asserted below), a revision is immutable; nothing is deleted.
  'log_datasets.dataset': ['SELECT', 'INSERT'],
  'log_datasets.dataset_revision': ['SELECT', 'INSERT'],
  'log_datasets.dataset_candidate': ['SELECT', 'INSERT'],
  // Log test dataset baselines (#1478 D-b): expected_baseline is updated by column (asserted below); baseline_event is append-only; nothing is deleted.
  'log_datasets.expected_baseline': ['SELECT', 'INSERT'],
  'log_datasets.baseline_event': ['SELECT', 'INSERT'],
  // Migration 0113 (#1446 e): the Gate decision is append-only (SELECT, INSERT; a trigger refuses UPDATE and DELETE for every role).
  'log_lifecycle.gate_decision': ['SELECT', 'INSERT'],
  'log_datasets.regression_suite': ['SELECT', 'INSERT'],
  'log_datasets.suite_run': ['SELECT', 'INSERT'],
  'log_datasets.suite_run_item': ['SELECT', 'INSERT'],
  'log_datasets.suite_review_label': ['SELECT', 'INSERT'],
  // Migration 0101 (ADR-0116): tokens are issued and revoked, never edited or deleted. UPDATE is column-scoped to
  // the usage and revocation columns (asserted below); no table-wide UPDATE and no DELETE.
  'core.api_tokens': ['SELECT', 'INSERT'],
};

describe.skipIf(!runIntegration)('ADR-0008 role grants — product tables (Slice 3 #22)', () => {
  let migrateHandle: DbHandle;
  let appHandle: DbHandle;

  beforeAll(() => {
    migrateHandle = createDb(MIGRATE_URL);
    appHandle = createDb(APP_URL);
  });

  afterAll(async () => {
    await migrateHandle?.close();
    await appHandle?.close();
  });

  it('platform_app holds exactly the designed DML privileges on every product-schema base table', async () => {
    const { rows: tables } = await migrateHandle.pool.query<{
      table_schema: string;
      table_name: string;
    }>(
      `select table_schema, table_name
           from information_schema.tables
          where table_schema = ANY($1::text[])
            and table_type = 'BASE TABLE'
          order by table_schema, table_name`,
      [PRODUCT_SCHEMAS as unknown as string[]],
    );
    const schemasWithoutTables = PRODUCT_SCHEMAS.filter(
      (schema) => !tables.some((table) => table.table_schema === schema),
    );
    expect(
      schemasWithoutTables,
      `product schemas without discovered base tables: ${schemasWithoutTables.join(', ')}`,
    ).toEqual([]);
    expect(tables.length, 'should discover at least 38 product tables').toBeGreaterThanOrEqual(38);
    expect(
      tables
        .filter(
          (t) =>
            t.table_name.startsWith('recovery_') || t.table_name.startsWith('outcome_recovery_'),
        )
        .map((t) => `${t.table_schema}.${t.table_name}`),
    ).toEqual([
      'dashboard.recovery_history',
      'dashboard.recovery_identities',
      'dashboard.recovery_presentations',
      'survey.outcome_recovery_history',
      'survey.outcome_recovery_identities',
      'survey.outcome_recovery_presentations',
    ]);

    const failures: string[] = [];
    for (const t of tables) {
      const fq = `${t.table_schema}.${t.table_name}`;
      const expected = new Set<DmlPrivilege>(EXPECTED_GRANTS[fq] ?? FULL_DML);

      const { rows: grants } = await migrateHandle.pool.query<{ privilege_type: string }>(
        `select privilege_type
             from information_schema.role_table_grants
            where grantee = 'platform_app'
              and table_schema = $1
              and table_name = $2`,
        [t.table_schema, t.table_name],
      );
      const got = new Set(grants.map((g) => g.privilege_type));
      for (const priv of DML_PRIVILEGES) {
        if (expected.has(priv) && !got.has(priv)) {
          failures.push(`platform_app missing GRANT ${priv} ON ${fq}; add to a new migration`);
        }
        if (!expected.has(priv) && got.has(priv)) {
          failures.push(
            `platform_app has unexpected GRANT ${priv} ON ${fq}; ${fq} is narrower than full-DML by design (see the migration that created it) — REVOKE it or update EXPECTED_GRANTS if the design changed`,
          );
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('platform_app reaches survey response aggregates only through the registered definer functions', async () => {
    const { rows } = await migrateHandle.pool.query<{
      proname: string;
      app_execute: boolean;
      public_execute: boolean;
    }>(
      `select p.proname,
              pg_catalog.has_function_privilege('platform_app', p.oid, 'EXECUTE') as app_execute,
              pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
        where n.nspname = 'survey'
          and owner_role.rolname = 'platform_survey_aggregate_owner'
        order by p.proname`,
    );
    expect(rows.map((row) => row.proname)).toEqual(SURVEY_AGGREGATE_FUNCTIONS);
    expect(rows).toEqual(
      SURVEY_AGGREGATE_FUNCTIONS.map((proname) => ({
        proname,
        app_execute: true,
        public_execute: false,
      })),
    );
  });

  it('platform_app UPDATE on review candidates is limited to resolution columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'voc'
            and table_name = 'public_update_review_candidates'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'actioned_public_update_id',
      'dismissal_reason',
      'resolved_at',
      'resolved_by_actor_id',
      'status',
      'updated_at',
    ]);
    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('platform_app', 'voc.public_update_review_candidates', 'UPDATE') as has_table_update,
           has_table_privilege('platform_app', 'voc.public_update_review_candidates', 'DELETE') as has_delete,
           has_table_privilege('platform_app', 'voc.public_update_review_candidates', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });
  });

  it('platform_app UPDATE on API tokens is limited to usage and revocation columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'core'
            and table_name = 'api_tokens'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'last_used_at',
      'last_used_ip',
      'revoked_at',
      'revoked_by',
    ]);
    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('platform_app', 'core.api_tokens', 'UPDATE') as has_table_update,
           has_table_privilege('platform_app', 'core.api_tokens', 'DELETE') as has_delete,
           has_table_privilege('platform_app', 'core.api_tokens', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });
  });

  it('platform_app UPDATE on VOC no-follow-up decisions is limited to decision columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'voc'
            and table_name = 'no_follow_up_decisions'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'decided_at',
      'decided_by_actor_id',
      'decision',
      'reason',
      'updated_at',
      'withdrawn_at',
    ]);
    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('platform_app', 'voc.no_follow_up_decisions', 'UPDATE') as has_table_update,
           has_table_privilege('platform_app', 'voc.no_follow_up_decisions', 'DELETE') as has_delete,
           has_table_privilege('platform_app', 'voc.no_follow_up_decisions', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });
  });

  it('platform_app UPDATE on improvement items is limited to the mutable columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'improvement'
            and table_name = 'item'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual(
      [
        'problem', 'action', 'action_date', 'status', 'assignee_id', 'quest_id', 'quest_title_snapshot',
        'origin_menu_id', 'origin_context', 'effect_result', 'effect_note', 'effect_compare_link', 'drop_reason',
        'row_version', 'updated_at', 'updated_by',
      ].sort(),
    );
  });

  it.each([
    ['development_project', ['software_id', 'stage', 'owner_actor_id', 'target_date', 'row_version', 'updated_at', 'updated_by']],
    ['validation_round', ['status', 'closed_at', 'closed_by', 'row_version', 'updated_at', 'updated_by']],
    ['development_event', []],
    ['round_evidence_ref', []],
    ['execution_request', ['state', 'attempt_count', 'claimed_by_actor_id', 'lease_expires_at', 'last_heartbeat_at', 'cancel_reason', 'row_version', 'updated_at', 'ended_at']],
    ['execution_attempt', ['outcome', 'ended_at', 'executor_version', 'executor_digest', 'rule_set_revision', 'input_manifest_digest', 'result_digest', 'verdict', 'worker_summary']],
    ['rule_result', []],
    ['rule_result_excerpt', []],
    ['gate_decision', []],
    ['queue_settings', ['run_window', 'lease_seconds', 'immediate_limit', 'excerpt_retention_days', 'updated_at', 'updated_by']],
    ['excerpt_reader', ['granted_by', 'granted_at', 'revoked_at']],
  ] as const)('platform_app UPDATE on log_lifecycle.%s is limited to the mutable columns', async (table, columns) => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'log_lifecycle'
            and table_name = $1
            and privilege_type = 'UPDATE'
          order by column_name`,
      [table],
    );
    expect(rows.map((row) => row.column_name)).toEqual([...columns].sort());
  });

  it.each([
    ['catalog_report', ['superseded_at', 'superseded_by_report_id']],
    ['rule_set_revision', []],
    ['rule', []],
    ['rule_target', []],
  ] as const)('platform_app UPDATE on log_rules.%s is limited to the supersede marker', async (table, columns) => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'log_rules'
            and table_name = $1
            and privilege_type = 'UPDATE'
          order by column_name`,
      [table],
    );
    expect(rows.map((row) => row.column_name)).toEqual([...columns].sort());
  });

  it.each([
    ['dataset', ['name', 'purpose', 'share_scope', 'model_ids', 'scenario_tags', 'status', 'row_version', 'updated_at', 'updated_by']],
    ['dataset_candidate', ['status', 'reviewer_actor_id', 'reason', 'dataset_id', 'decided_at', 'row_version']],
    ['dataset_revision', []],
    ['expected_baseline', ['status', 'profile_pin', 'expected_scope', 'expectations', 'parser_golden_ref', 'approved_by_actor_id', 'approved_at', 'superseded_at', 'row_version', 'updated_at']],
    ['baseline_event', []],
    ['regression_suite', ['name', 'items', 'engine_profile_ref', 'required_pin', 'row_version', 'updated_at', 'updated_by']],
    ['suite_run', []],
    ['suite_run_item', []],
    ['suite_review_label', []],
  ] as const)('platform_app UPDATE on log_datasets.%s is limited to the mutable columns', async (table, columns) => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'log_datasets'
            and table_name = $1
            and privilege_type = 'UPDATE'
          order by column_name`,
      [table],
    );
    expect(rows.map((row) => row.column_name)).toEqual([...columns].sort());
  });

  // #1445 d (ADR-0117 decision 7): the only way an excerpt body goes is the definer function; platform_app may run it, PUBLIC may not.
  it('platform_app erases excerpt bodies only through log_lifecycle.erase_excerpts (definer, EXECUTE for platform_app only)', async () => {
    const { rows } = await migrateHandle.pool.query<{ definer: boolean; app_exec: boolean; public_exec: boolean; config: string[] | null }>(
      `select p.prosecdef as definer,
              has_function_privilege('platform_app', p.oid, 'EXECUTE') as app_exec,
              has_function_privilege('public', p.oid, 'EXECUTE') as public_exec,
              p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'log_lifecycle' and p.proname = 'erase_excerpts'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ definer: true, app_exec: true, public_exec: false });
    expect(rows[0]?.config).toEqual(['search_path=pg_catalog']);
  });

  // The excerpt table keeps its tombstones: one UPDATE guard and one DELETE guard, both enabled.
  it('log_lifecycle.rule_result_excerpt has an enabled UPDATE guard and an enabled DELETE guard trigger', async () => {
    const { rows } = await migrateHandle.pool.query<{ tgname: string; tgtype: number; tgenabled: string }>(
      `select t.tgname, t.tgtype, t.tgenabled from pg_trigger t
        where t.tgrelid = 'log_lifecycle.rule_result_excerpt'::regclass and not t.tgisinternal order by t.tgname`,
    );
    // tgtype bits: 1 row, 2 before, 8 delete, 16 update.
    expect(rows.map((r) => [r.tgname, (r.tgtype & 8) !== 0, (r.tgtype & 16) !== 0, r.tgenabled])).toEqual([
      ['rule_result_excerpt_guard', false, true, 'O'],
      ['rule_result_excerpt_no_delete', true, false, 'O'],
    ]);
  });

  it('platform_app UPDATE on log_explorer.investigation is limited to the mutable columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'log_explorer'
            and table_name = 'investigation'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual(
      ['title', 'filters', 'evidence', 'status', 'row_version', 'updated_at'].sort(),
    );
  });

  // #1198 a: the `knowledge` schema is not in PRODUCT_SCHEMAS, so the three draft tables are pinned explicitly.
  it.each([
    ['draft', ['SELECT', 'INSERT']],
    ['draft_revision', ['SELECT', 'INSERT']],
    ['draft_review', ['SELECT', 'INSERT']],
  ] as const)('platform_app holds exactly %s privileges on knowledge.%s (no DELETE, no TRUNCATE, no table-wide UPDATE)', async (table, expected) => {
    const { rows } = await migrateHandle.pool.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'platform_app' and table_schema = 'knowledge' and table_name = $1`,
      [table],
    );
    expect(rows.map((row) => row.privilege_type).sort()).toEqual([...expected].sort());
  });

  it.each([
    ['draft', ['status', 'latest_draft_rev', 'submitted_at', 'closed_at', 'closed_by', 'close_reason', 'row_version', 'updated_at', 'updated_by']],
    ['draft_revision', []],
    ['draft_review', []],
  ] as const)('platform_app UPDATE on knowledge.%s is limited to the mutable columns', async (table, columns) => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'knowledge'
            and table_name = $1
            and privilege_type = 'UPDATE'
          order by column_name`,
      [table],
    );
    expect(rows.map((row) => row.column_name)).toEqual([...columns].sort());
  });

  it('platform_app UPDATE on outcome follow-up decisions is limited to transition columns', async () => {
    const { rows } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'survey'
            and table_name = 'outcome_follow_up_decisions'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'decided_by_actor_id',
      'reason',
      'state',
      'updated_at',
    ]);
    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('platform_app', 'survey.outcome_follow_up_decisions', 'UPDATE') as has_table_update,
           has_table_privilege('platform_app', 'survey.outcome_follow_up_decisions', 'DELETE') as has_delete,
           has_table_privilege('platform_app', 'survey.outcome_follow_up_decisions', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });
  });

  it('platform_app UPDATE on notifications is limited to read, archive, and email claim columns', async () => {
    const { rows: columns } = await migrateHandle.pool.query<{ column_name: string }>(
      `select column_name
           from information_schema.column_privileges
          where grantee = 'platform_app'
            and table_schema = 'core'
            and table_name = 'notifications'
            and privilege_type = 'UPDATE'
          order by column_name`,
    );
    expect(columns.map((row) => row.column_name)).toEqual([
      'archived_at',
      'email_sent_at',
      'read_at',
    ]);

    const { rows: tablePrivileges } = await migrateHandle.pool.query<{
      has_table_update: boolean;
      has_delete: boolean;
      has_truncate: boolean;
    }>(
      `select
           has_table_privilege('platform_app', 'core.notifications', 'UPDATE') as has_table_update,
           has_table_privilege('platform_app', 'core.notifications', 'DELETE') as has_delete,
           has_table_privilege('platform_app', 'core.notifications', 'TRUNCATE') as has_truncate`,
    );
    expect(tablePrivileges[0]).toEqual({
      has_table_update: false,
      has_delete: false,
      has_truncate: false,
    });

    const actor = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.actors where workspace_id = $1 order by created_at limit 1',
      [WORKSPACE_ID],
    );
    const actorId = actor.rows[0]?.id;
    if (!actorId) throw new Error('seed must contain an actor');
    const notification = await appHandle.pool.query<{ id: string }>(
      `insert into core.notifications
         (workspace_id, actor_id, event_type, subject_type, subject_id, summary, correlation_id)
       values ($1, $2, 'voc.reporter_replied', 'voc', $3, 'Role grant notification', $4)
       returning id`,
      [WORKSPACE_ID, actorId, randomUUID(), randomUUID()],
    );
    const id = notification.rows[0]?.id;
    if (!id) throw new Error('notification insert returned no id');

    try {
      await expect(
        appHandle.pool.query('update core.notifications set summary = $2 where id = $1', [
          id,
          'rewritten summary',
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appHandle.pool.query('update core.notifications set actor_id = $2 where id = $1', [
          id,
          actorId,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appHandle.pool.query('delete from core.notifications where id = $1', [id]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appHandle.pool.query('update core.notifications set read_at = now() where id = $1', [id]),
      ).resolves.toBeDefined();
    } finally {
      await migrateHandle.pool.query('delete from core.notifications where id = $1', [id]);
    }
  });

  it('platform_app may submit survey responses (INSERT-only, #185 migration 0037)', async () => {
    const actor = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.actors where workspace_id = $1 order by created_at limit 1',
      [WORKSPACE_ID],
    );
    const managedSystem = await migrateHandle.pool.query<{ id: string }>(
      'select id from core.managed_systems where workspace_id = $1 order by created_at limit 1',
      [WORKSPACE_ID],
    );
    const actorId = actor.rows[0]?.id;
    const managedSystemId = managedSystem.rows[0]?.id;
    if (!actorId || !managedSystemId)
      throw new Error('seed must contain an actor and managed system');

    const survey = await appHandle.pool.query<{ id: string }>(
      `insert into survey.surveys (
           workspace_id, display_id, type, title, primary_managed_system_id,
           operator_actor_id, created_by
         ) values ($1, $2, 'discovery', 'Role grant survey', $3, $4, $4) returning id`,
      [WORKSPACE_ID, `SRV-role-grant-${Date.now()}`, managedSystemId, actorId],
    );
    const surveyId = survey.rows[0]?.id;
    expect(surveyId).toBeTruthy();

    await expect(
      appHandle.pool.query(
        `insert into survey.survey_responses (
           workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at
         ) values ($1, $2, $3, false, now())`,
        [WORKSPACE_ID, surveyId, actorId],
      ),
    ).resolves.toBeDefined();

    await expect(
      appHandle.pool.query('select * from survey.survey_responses'),
    ).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      appHandle.pool.query(
        'update survey.survey_responses set submitted_at = submitted_at where false',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      appHandle.pool.query('delete from survey.survey_responses where false'),
    ).rejects.toMatchObject({ code: '42501' });

    await migrateHandle.pool.query(
      `delete from survey.survey_response_answers
       where response_id in (
         select id from survey.survey_responses where survey_id = $1
       )`,
      [surveyId],
    );
    await migrateHandle.pool.query('delete from survey.survey_responses where survey_id = $1', [
      surveyId,
    ]);
    await migrateHandle.pool.query('delete from survey.surveys where id = $1', [surveyId]);
  });

  it('#1109 mutator witness extensions confer no raw-answer or owner-role access to app', async () => {
    for (const role of [
      'platform_survey_provenance_mutator_owner',
      'platform_entity_links_survey_mutator_owner',
    ]) {
      const result = await migrateHandle.pool.query(
        `
        select pg_has_role('platform_app',$1::name,'MEMBER') as app_member,
          has_any_column_privilege($1::name,'survey.survey_response_answers','SELECT,INSERT,UPDATE') as answers,
          has_schema_privilege($1::name,'survey','CREATE') as survey_create,
          has_schema_privilege($1::name,'core','CREATE') as core_create`,
        [role],
      );
      expect(result.rows).toEqual([
        { app_member: false, answers: false, survey_create: false, core_create: false },
      ]);
    }
  });
});
