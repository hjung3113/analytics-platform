// ADR-0123 (#1466) — the DB rule behind the no-Managed-System tuples, against a real Postgres (throwaway DB only; fixtures and
// raw inserts as platform_migrate). Needs migration 0107. `managed_system_id` is NULL exactly for the registered
// no-Managed-System tuples: every pre-existing tuple still requires it, the new pair refuses one, and the app role reaches
// the new pair only through the filtered view (`core.entity_links_app`).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('entity_links managed_system_id rule (ADR-0123, #1466)', () => {
  const prefix = `it-1466-links-${randomUUID()}`;
  let app: DbHandle;
  let migrate: DbHandle;
  let actor = '';
  let ms = '';

  const insert = (sourceType: string, targetType: string, relation: string, managedSystemId: string | null) =>
    migrate.pool.query(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility, status, managed_system_id, created_by)
       values ($1,$2,$3,$4,$5,$6,'internal_only','active',$7,$8) returning id`,
      [WORKSPACE_ID, sourceType, randomUUID(), targetType, randomUUID(), relation, managedSystemId, actor],
    );

  beforeAll(async () => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    actor = (await insertActorRow(app, { workspaceId: WORKSPACE_ID, externalId: prefix, roleLevel: 'admin' })).id;
    ms = await insertMsDirectly(app, WORKSPACE_ID, prefix, 'Entity link no-MS rule');
  });
  afterAll(async () => {
    await migrate.pool.query('delete from core.entity_links where created_by = $1', [actor]);
    await deleteRecoveryFixtureParents(app, 'delete from core.managed_systems where id = $1', [ms]);
    await cleanupTestActorsByExternalIdPrefix(app, WORKSPACE_ID, prefix);
    await app.close();
    await migrate.close();
  });

  // The 13 tuples registered before ADR-0123: a NULL Managed System is rejected, a real one still accepted.
  const existingPairs = [
    ['voc', 'voc', 'related_to'],
    ['voc', 'finding', 'created_finding'],
    ['voc', 'finding', 'evidence_of'],
    ['voc_cluster', 'finding', 'created_finding'],
    ['voc_cluster', 'finding', 'evidence_of'],
    ['finding', 'task_request', 'requested_task'],
    ['task_request', 'task', 'converted_to'],
    ['finding', 'task', 'requested_task'],
    ['voc', 'task', 'evidence_of'],
    ['voc', 'task_request', 'requested_task'],
    ['voc_cluster', 'task_request', 'requested_task'],
    ['survey_response', 'finding', 'generated_finding'],
    ['survey_response', 'finding', 'evidence_of'],
  ] as const;

  it.each(existingPairs)('%s → %s (%s) still requires a Managed System', async (source, target, relation) => {
    await expect(insert(source, target, relation, null)).rejects.toMatchObject({ constraint: 'entity_links_managed_system_check' });
    await expect(insert(source, target, relation, ms)).resolves.toBeDefined();
  });

  it('the 수동 검증 첨부 → Round pair accepts NULL and refuses a Managed System (no mixed row)', async () => {
    await expect(insert('manual_validation_attachment', 'validation_round', 'evidence_of', null)).resolves.toBeDefined();
    await expect(insert('manual_validation_attachment', 'validation_round', 'evidence_of', ms)).rejects.toMatchObject({
      constraint: 'entity_links_managed_system_check',
    });
  });

  it.each([
    ['the reverse direction', 'validation_round', 'manual_validation_attachment', 'evidence_of'],
    ['another relation', 'manual_validation_attachment', 'validation_round', 'related_to'],
    ['a Managed-System end paired with a Round', 'voc', 'validation_round', 'evidence_of'],
  ])('refuses %s as an unregistered tuple', async (_label, source, target, relation) => {
    // A real Managed System keeps the NULL rule out of the way, so only the tuple allowlist can reject.
    await expect(insert(source, target, relation, ms)).rejects.toMatchObject({ constraint: 'entity_links_tuple_check' });
  });

  it('a pre-existing row is untouched: its Managed System is still set', async () => {
    const { rows } = await migrate.pool.query(
      `select count(*)::int as n from core.entity_links where source_type in ('voc','finding','voc_cluster','task_request','survey_response') and managed_system_id is null`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('the app role writes and reads the new pair through the filtered view with a NULL Managed System', async () => {
    const id = randomUUID();
    await app.pool.query(
      `insert into core.entity_links_app (workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility, status, managed_system_id, created_by)
       values ($1,'manual_validation_attachment',$2,'validation_round',$3,'evidence_of','internal_only','active',null,$4)`,
      [WORKSPACE_ID, id, randomUUID(), actor],
    );
    const { rows } = await app.pool.query('select managed_system_id from core.entity_links_app where source_id = $1', [id]);
    expect(rows).toEqual([{ managed_system_id: null }]);
  });
});
