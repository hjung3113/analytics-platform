import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import {
  denyCapability,
  grantCapability,
  insertPermissionRequestRow,
} from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix } from '../../../test-support/voc-fixtures.js';
import { createCheckService } from '../../permissions/check-service.js';
import { checkPermissionRequestTarget } from '../../permissions/request-target.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-1170b-tri';

describe.skipIf(!runIntegration)('GET /vocs?view=triage requests the missing read (#1170b)', () => {
  let handle: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let developer: string;
  let msA: string;
  let msB: string;
  let devCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    admin = (
      await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-admin`,
        roleLevel: 'admin',
      })
    ).id;
    developer = (
      await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-developer`,
        roleLevel: 'developer',
      })
    ).id;
    msA = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-a`, '1170b triage A');
    msB = await insertMsDirectly(handle, WORKSPACE_ID, `${PREFIX}-b`, '1170b triage B');
    devCookie = await loginAs(app, `${PREFIX}-developer`);
  });

  beforeEach(async () => {
    await handle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [[developer]],
    );
    await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
    ]);
  });

  afterAll(async () => {
    await handle.pool.query(
      'delete from permission.permission_grants where actor_id = any($1::uuid[])',
      [[developer, admin]],
    );
    await handle.pool.query(
      'delete from permission.permission_denies where actor_id = any($1::uuid[])',
      [[developer, admin]],
    );
    await handle.pool.query('delete from core.rate_limits where key = any($1::text[])', [
      [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
    ]);
    await cleanupTestActorsByExternalIdPrefix(handle, WORKSPACE_ID, PREFIX);
    await deleteRecoveryFixtureParents(
      handle,
      'delete from core.managed_systems where id = any($1::uuid[])',
      [[msA, msB]],
    );
    await app.close();
    await handle.close();
  });

  async function grant(capability: 'voc.read' | 'voc.triage', system: 'A' | 'B') {
    await grantCapability(
      handle,
      WORKSPACE_ID,
      developer,
      capability,
      system === 'A' ? msA : msB,
      admin,
    );
  }

  it.each([
    {
      name: 'triage on MS-A and no read, no System',
      grants: [['voc.triage', 'A']] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'triage on A and B and no read, no System',
      grants: [
        ['voc.triage', 'A'],
        ['voc.triage', 'B'],
      ] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.read',
      system: null,
    },
    {
      name: 'triage on MS-A and no read, MS-A selected',
      grants: [['voc.triage', 'A']] as const,
      path: 'selected-a',
      code: 'permission.denied',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'triage on A and B, read only on B, select A',
      grants: [
        ['voc.triage', 'A'],
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ] as const,
      path: 'selected-a',
      code: 'permission.scope_required',
      permission: 'voc.read',
      system: 'A',
    },
    {
      name: 'selection lacking triage',
      grants: [
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ] as const,
      path: 'selected-a',
      code: 'permission.scope_required',
      permission: 'voc.triage',
      system: 'A',
    },
    {
      name: 'no triage anywhere',
      grants: [] as const,
      path: '/vocs?view=triage',
      code: 'permission.denied',
      permission: 'voc.triage',
      system: null,
    },
  ])('$name → $code $permission', async ({ grants, path, code, permission, system }) => {
    for (const [capability, managedSystem] of grants) {
      await grant(capability, managedSystem);
    }
    const url = path === 'selected-a' ? `/vocs?view=triage&managed_system_id=${msA}` : path;
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code,
      requestable_permission: {
        permission,
        managed_system_id: system === 'A' ? msA : null,
      },
    });
  });

  it.each([
    {
      name: 'triage fallback to the only System',
      grants: [['voc.triage', 'A']],
      view: 'triage',
      selectSystem: false,
      permission: 'voc.read',
      code: 'permission.denied',
      message: 'voc.read required to use voc.triage scope',
    },
    {
      name: 'triage selection with an empty intersection',
      grants: [['voc.triage', 'A']],
      view: 'triage',
      selectSystem: true,
      permission: 'voc.read',
      code: 'permission.denied',
      message: 'voc.read required to use voc.triage scope',
    },
    {
      name: 'triage selection outside read scope',
      grants: [
        ['voc.triage', 'A'],
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ],
      view: 'triage',
      selectSystem: true,
      permission: 'voc.read',
      code: 'permission.scope_required',
      message: 'voc.read required for the selected managed system',
    },
    {
      name: 'triage selection outside triage scope',
      grants: [
        ['voc.read', 'A'],
        ['voc.triage', 'B'],
        ['voc.read', 'B'],
      ],
      view: 'triage',
      selectSystem: true,
      permission: 'voc.triage',
      code: 'permission.scope_required',
      message: 'managed_system_id not in voc.triage scope',
    },
    {
      name: 'inbox selection outside read scope',
      grants: [['voc.read', 'B']],
      view: 'inbox',
      selectSystem: true,
      permission: 'voc.read',
      code: 'permission.scope_required',
      message: 'managed_system_id not in voc.read scope',
    },
  ] as const)('$name drops the concrete hint after an explicit deny', async (scenario) => {
    const { grants, view, selectSystem, permission, code, message } = scenario;
    for (const [capability, system] of grants) {
      await grant(capability, system);
    }
    const query = new URLSearchParams({ view });
    if (selectSystem) query.set('managed_system_id', msA);
    const getQueue = () =>
      app.inject({
        method: 'GET',
        url: `/vocs?${query}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
      });
    const beforeDeny = await getQueue();
    expect(beforeDeny.statusCode).toBe(403);
    expect(beforeDeny.json()).toMatchObject({
      code,
      message,
      requestable_permission: { permission, managed_system_id: msA },
    });

    const denyId = await denyCapability(handle, WORKSPACE_ID, developer, permission, msA, admin);
    try {
      const afterDeny = await getQueue();
      expect(afterDeny.statusCode).toBe(403);
      expect(afterDeny.json()).toMatchObject({ code, message });
      expect(afterDeny.json()).not.toHaveProperty('requestable_permission');
    } finally {
      await handle.pool.query('delete from permission.permission_denies where id = $1', [denyId]);
    }
  });

  function get(url: string) {
    return app.inject({ method: 'GET', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` } });
  }

  async function assertReadHint(path: string, id: string, code: string, state: string, hasHint: boolean) {
    const [list, check] = await Promise.all([
      get(path),
      get(`/me/permissions/check?capability=voc.read&managed_system_id=${id}`),
    ]);
    expect(check.statusCode).toBe(200);
    const checkBody = check.json();
    expect(checkBody).toMatchObject({ state, decision: { allow: false } });
    expect(Boolean(checkBody.decision.requestable?.length)).toBe(hasHint);
    expect(list.statusCode).toBe(403);
    const body = list.json();
    expect(body.code).toBe(code);
    expect(Object.hasOwn(body, 'requestable_permission')).toBe(hasHint);
    if (hasHint) {
      expect(body.requestable_permission).toEqual({ permission: 'voc.read', managed_system_id: id });
    }
    return body;
  }

  it.each([
    ['inbox selection', 'permission.scope_required'],
    ['triage fallback', 'permission.denied'],
  ])('%s agrees with the check route before and after archive', async (entry, code) => {
    const path = entry === 'inbox selection'
      ? `/vocs?view=inbox&managed_system_id=${msA}`
      : '/vocs?view=triage';
    if (entry === 'inbox selection') await grant('voc.read', 'B');
    else await grant('voc.triage', 'A');

    await assertReadHint(path, msA, code, 'request_access', true);
    await handle.pool.query('update core.managed_systems set archived_at = now() where id = $1', [msA]);
    try {
      await assertReadHint(path, msA, code, 'blocked_non_requestable', false);
    } finally {
      await handle.pool.query('update core.managed_systems set archived_at = null where id = $1', [msA]);
    }
  });

  it.each([
    ['inbox selection', 'permission.scope_required'],
    ['triage fallback', 'permission.denied'],
  ])('%s omits the hint for a System registered in another workspace', async (entry, code) => {
    const inbox = entry === 'inbox selection';
    const system = randomUUID();
    const workspace = randomUUID();
    const path = inbox ? `/vocs?view=inbox&managed_system_id=${system}` : '/vocs?view=triage';
    if (inbox) await grant('voc.read', 'B');
    const unknown = inbox ? await get(path) : undefined;
    const migrate = createDb(MIGRATE_URL);
    try {
      await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [workspace, PREFIX]);
      await migrate.pool.query(
        'insert into core.managed_systems (id, workspace_id, slug, name) values ($1, $2, $3, $3)',
        [system, workspace, PREFIX],
      );
      if (!inbox) await grantCapability(handle, WORKSPACE_ID, developer, 'voc.triage', system, admin);
      const foreign = await assertReadHint(path, system, code, 'blocked_non_requestable', false);
      if (unknown) {
        expect(unknown.statusCode).toBe(403);
        expect(unknown.json()).toEqual(foreign);
      }
    } finally {
      await handle.pool.query('delete from permission.permission_grants where managed_system_id = $1', [system]);
      await deleteRecoveryFixtureParents(migrate, 'delete from core.managed_systems where id = $1', [system]);
      await deleteRecoveryFixtureParents(migrate, 'delete from core.workspaces where id = $1', [workspace]);
      await migrate.close();
    }
  });

  it.each(['pending', 'needs_more_info'] as const)('retains the hint for the actor’s own %s request', async (status) => {
    await grant('voc.triage', 'A');
    const request = await insertPermissionRequestRow(handle, {
      workspaceId: WORKSPACE_ID,
      requesterActorId: developer,
      requestedCapability: 'voc.read',
      requestedManagedSystemId: msA,
      reason: 'Read the triage queue',
      status,
    });
    try {
      await assertReadHint('/vocs?view=triage', msA, 'permission.denied', 'pending_request', true);
      const target = await checkPermissionRequestTarget(
        handle.db,
        createCheckService({ db: handle.db }),
        { actor_id: developer, workspace_id: WORKSPACE_ID, role_level: 'developer' },
        'voc.read',
        { workspace_id: WORKSPACE_ID, managed_system_id: msA },
      );
      expect(target.requestAvailability).toBe('pending');
      await handle.pool.query('update core.managed_systems set archived_at = now() where id = $1', [msA]);
      try {
        await assertReadHint('/vocs?view=triage', msA, 'permission.denied', 'pending_request', false);
      } finally {
        await handle.pool.query('update core.managed_systems set archived_at = null where id = $1', [msA]);
      }
    } finally {
      const migrate = createDb(MIGRATE_URL);
      try {
        await migrate.pool.query('delete from permission.permission_requests where id = $1', [request.id]);
      } finally {
        await migrate.close();
      }
    }
  });
});
