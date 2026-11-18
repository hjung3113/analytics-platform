import { randomUUID } from 'node:crypto';

import {
  listEntityLinksResponseSchema,
} from '@ap/feature-shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import {
  cleanupVocClusterFixtures,
  insertActorRow,
  insertVocClusterMemberRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('POST /voc-clusters/:id/create-finding evidence VOCs', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let adminCookie: string;
  let reporterId: string;
  const actorIds: string[] = [];
  const managedSystemIds: string[] = [];
  const clusterIds: string[] = [];
  const findingIds: string[] = [];
  const vocIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    const adminExternalId = `cluster-evidence-admin-${suffix}`;
    const admin = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: adminExternalId,
      displayName: 'Cluster Evidence Admin',
      roleLevel: 'admin',
    });
    adminId = admin.id;
    actorIds.push(admin.id);
    const reporter = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `cluster-evidence-reporter-${suffix}`,
      displayName: 'Cluster Evidence Reporter',
      roleLevel: 'user',
    });
    reporterId = reporter.id;
    actorIds.push(reporter.id);
    adminCookie = await loginAs(app, adminExternalId);
  });

  afterEach(async () => {
    if (!migrateHandle) return;
    await migrateHandle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      actorIds.map((actorId) => `${WORKSPACE_ID}:${actorId}`),
    ]);
    await migrateHandle.pool.query(
      'delete from permission.permission_denies where actor_id = any($1::uuid[])',
      [actorIds],
    );
    await cleanupVocClusterFixtures(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      actorIds,
      managedSystemIds,
      clusterIds,
      findingIds,
      vocIds,
    });
    actorIds.length = 0;
    managedSystemIds.length = 0;
    clusterIds.length = 0;
    findingIds.length = 0;
    vocIds.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function seedClusterWithMembers() {
    const managedSystemId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      `cluster-evidence-${randomUUID()}`,
      'Cluster evidence test',
    );
    managedSystemIds.push(managedSystemId);
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      primaryManagedSystemId: managedSystemId,
      createdBy: adminId,
    });
    clusterIds.push(cluster.id);

    const members = await Promise.all(
      [1, 2].map(async (index) => {
        const voc = await insertVocRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: managedSystemId,
          reporterId,
          title: `Connection failure report ${index}`,
        });
        vocIds.push(voc.id);
        await insertVocClusterMemberRow(migrateHandle, {
          clusterId: cluster.id,
          vocId: voc.id,
          addedBy: adminId,
        });
        return voc.id;
      }),
    );
    return { clusterId: cluster.id, managedSystemId, memberIds: members };
  }

  async function expectNoFindingFromCluster(clusterId: string) {
    const result = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count
         from finding.findings
        where workspace_id = $1
          and source_type = 'voc_cluster'
          and source_id = $2`,
      [WORKSPACE_ID, clusterId],
    );
    expect(result.rows[0]?.count).toBe(0);
  }

  async function getFindingEvidenceLinks(findingId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/entity-links?target_type=finding&target_id=${findingId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'workspace-id': WORKSPACE_ID,
      },
    });
    expect(response.statusCode).toBe(200);
    const links = listEntityLinksResponseSchema.parse(response.json());
    return links.items.filter(
      (link) =>
        link.visibility_state === 'allowed' &&
        link.source_type === 'voc' &&
        link.target_type === 'finding' &&
        link.target_id === findingId &&
        link.relation_type === 'evidence_of',
    );
  }

  function createFinding(
    clusterId: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/create-finding`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'workspace-id': WORKSPACE_ID,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: body,
    });
  }

  it('creates an active internal evidence link for each selected readable cluster member', async () => {
    const { clusterId, memberIds } = await seedClusterWithMembers();
    const response = await createFinding(clusterId, {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
      evidence_voc_ids: memberIds,
    });

    expect(response.statusCode).toBe(201);
    const finding = response.json<{ id: string; evidence_count: number }>();
    findingIds.push(finding.id);
    expect(finding.evidence_count).toBe(0);

    const evidenceLinks = await getFindingEvidenceLinks(finding.id);
    expect(evidenceLinks).toHaveLength(2);
    expect(
      evidenceLinks.every(
        (link) =>
          link.status === 'active' &&
          'visibility' in link &&
          link.visibility === 'internal_only',
      ),
    ).toBe(true);
    expect(evidenceLinks.map((link) => link.visibility_state === 'allowed' ? link.source_id : '').sort()).toEqual(
      [...memberIds].sort(),
    );

    const evidenceAudits = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count
         from core.audit_log
        where workspace_id = $1
          and event_type = 'entity_link.created'
          and detail->'source'->>'type' = 'voc'
          and detail->'target'->>'id' = $2`,
      [WORKSPACE_ID, finding.id],
    );
    expect(evidenceAudits.rows[0]?.count).toBe(2);
    const highlights = await migrateHandle.pool.query<{ count: number }>(
      'select count(*)::int as count from finding.evidence_highlights where finding_id = $1',
      [finding.id],
    );
    expect(highlights.rows[0]?.count).toBe(0);
  });

  it('rejects a VOC that is not a current cluster member without creating a Finding', async () => {
    const { clusterId, managedSystemId } = await seedClusterWithMembers();
    const nonMember = await insertVocRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: managedSystemId,
      reporterId,
      title: 'Same system but not a cluster member',
    });
    vocIds.push(nonMember.id);

    const response = await createFinding(clusterId, {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
      evidence_voc_ids: [nonMember.id],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe('not_found.record');
    await expectNoFindingFromCluster(clusterId);
  });

  it('rejects an unreadable cluster member without creating a Finding', async () => {
    const { clusterId, managedSystemId, memberIds } = await seedClusterWithMembers();
    await migrateHandle.pool.query(
      `insert into permission.permission_denies
       (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
       values ($1, $2, 'voc.read', $3, 'W-2531-p2 unreadable evidence test', $2)`,
      [WORKSPACE_ID, adminId, managedSystemId],
    );

    const response = await createFinding(clusterId, {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
      evidence_voc_ids: [memberIds[0]],
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ code: string }>().code).toBe('not_found.record');
    await expectNoFindingFromCluster(clusterId);
  });

  it('creates no VOC evidence links when evidence_voc_ids is omitted', async () => {
    const { clusterId } = await seedClusterWithMembers();
    const response = await createFinding(clusterId, {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
    });

    expect(response.statusCode).toBe(201);
    const finding = response.json<{ id: string; evidence_count: number }>();
    findingIds.push(finding.id);
    expect(finding.evidence_count).toBe(0);
    expect(await getFindingEvidenceLinks(finding.id)).toHaveLength(0);
  });

  it('rechecks evidence source readability before returning an idempotent replay', async () => {
    const { clusterId, managedSystemId, memberIds } = await seedClusterWithMembers();
    const body = {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
      evidence_voc_ids: [memberIds[0]],
    };
    const idempotencyKey = randomUUID();
    const created = await createFinding(clusterId, body, idempotencyKey);
    expect(created.statusCode).toBe(201);
    findingIds.push(created.json<{ id: string }>().id);

    await migrateHandle.pool.query(
      `insert into permission.permission_denies
       (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
       values ($1, $2, 'voc.read', $3, 'W-2531-p2 replay evidence test', $2)`,
      [WORKSPACE_ID, adminId, managedSystemId],
    );
    const replay = await createFinding(clusterId, body, idempotencyKey);

    expect(replay.statusCode).toBe(404);
    expect(replay.json<{ code: string }>().code).toBe('not_found.record');
    const findings = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count
         from finding.findings
        where workspace_id = $1
          and source_type = 'voc_cluster'
          and source_id = $2`,
      [WORKSPACE_ID, clusterId],
    );
    expect(findings.rows[0]?.count).toBe(1);
  });
  // #2531 review C3: a replay returns only the Finding, so a member removed after the first call must not 404 it.
  it('replays the created Finding after a selected VOC left the cluster', async () => {
    const { clusterId, memberIds } = await seedClusterWithMembers();
    const body = {
      title: 'Repeated connection failures',
      summary: 'Several reports describe the same connection failure.',
      severity: 'medium',
      evidence_voc_ids: [memberIds[0]],
    };
    const idempotencyKey = randomUUID();
    const created = await createFinding(clusterId, body, idempotencyKey);
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;
    findingIds.push(findingId);

    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_cluster_members where cluster_id = $1 and voc_id = $2`,
      [clusterId, memberIds[0]],
    );
    const replay = await createFinding(clusterId, body, idempotencyKey);

    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ id: string }>().id).toBe(findingId);
  });
});
