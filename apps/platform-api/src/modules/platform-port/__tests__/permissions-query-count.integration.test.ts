// #1667 — the statements needed to resolve permissions do not grow with the number of permissions an actor can hold or
// with the number of workspace members. Counted on the DB handle (drizzle logger), real Postgres, throwaway DB only.

import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Db, type DbHandle, createDb } from '../../../db/client.js';
import * as core from '../../../db/schema/core.js';
import * as permission from '../../../db/schema/permission.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { eqvContribution } from '../../eqv/index.js';
import { improvementItemsContribution } from '../../improvement-items/item-endpoints.js';
import { logDatasetsContribution } from '../../log-datasets/index.js';
import { investigationContribution } from '../../log-explorer/index.js';
import { logKnowledgeContribution } from '../../log-knowledge/catalog-endpoints.js';
import { logLifecycleContribution } from '../../log-lifecycle/index.js';
import { createMenuDispatchRegistry } from '../../menu-dispatch/registry.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createAccessDirectoryService } from '../access-directory.js';
import { createPlatformPermissionResolver } from '../permissions.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-perm-count');

const stubDeps = { db: {}, checkService: {} } as never;
const declared = () =>
  createMenuDispatchRegistry([
    logKnowledgeContribution(stubDeps),
    improvementItemsContribution(stubDeps),
    logLifecycleContribution(stubDeps),
    investigationContribution(stubDeps),
    eqvContribution(stubDeps),
    logDatasetsContribution(stubDeps),
  ]).permissions;

describe.skipIf(!runIntegration)('permission resolution query counts (#1667)', () => {
  let handle: DbHandle;
  let migrateHandle: DbHandle;
  let db: Db;
  let statements: string[] = [];
  let admin: { actor_id: string; workspace_id: string; role_level: string };
  let plainUser: { actor_id: string; workspace_id: string; role_level: string };
  const createdIds: string[] = [];
  let n = 0;

  const newActor = async (roleLevel: 'admin' | 'developer' | 'user') => {
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `${PREFIX}-${n++}`,
      roleLevel,
    });
    createdIds.push(id);
    return { actor_id: id, workspace_id: WORKSPACE_ID, role_level: roleLevel };
  };
  const counted = async <T>(fn: () => Promise<T>) => {
    statements = [];
    const out = await fn();
    return { out, count: statements.length };
  };

  beforeAll(async () => {
    handle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    db = drizzle(handle.pool, {
      schema: { ...core, ...permission },
      logger: { logQuery: (query: string) => void statements.push(query) },
    });
    admin = await newActor('admin');
    plainUser = await newActor('user');
    for (const d of declared()) {
      await grantCapability(migrateHandle, WORKSPACE_ID, admin.actor_id, d.capability, null, admin.actor_id);
    }
  });

  afterAll(async () => {
    await migrateHandle.pool.query(`delete from permission.permission_grants where actor_id = any($1::uuid[])`, [createdIds]);
    await migrateHandle.pool.query(`delete from core.audit_log where actor_id = any($1::uuid[])`, [createdIds]);
    await migrateHandle.pool.query(`delete from core.actors where id = any($1::uuid[])`, [createdIds]);
    await handle.close();
    await migrateHandle.close();
  });

  it('resolves one actor in two permission-row statements, for an actor holding everything and for one holding nothing, whatever the item count', async () => {
    const checkService = createCheckService({ db });
    const resolver = createPlatformPermissionResolver(declared());
    const everything = await counted(() => resolver.resolve(checkService, admin));
    const nothing = await counted(() => resolver.resolve(checkService, plainUser));
    expect(everything.out.length).toBeGreaterThan(declared().length); // holds every declared permission and the kernel ones
    expect(everything.count).toBe(2);
    expect(nothing.count).toBe(2);

    // Thirty more declared permissions do not add a statement.
    const extra = Array.from({ length: 30 }, (_, i) => ({ permission: `extra:p${i}`, capability: 'eqv.view' as const }));
    const widened = createPlatformPermissionResolver([...declared(), ...extra]);
    expect((await counted(() => widened.resolve(checkService, admin))).count).toBe(2);
  });

  it('answers the access directory with the same statement count for 5 and for 50 more members', async () => {
    const checkService = createCheckService({ db });
    const directory = createAccessDirectoryService({ db, checkService, permissions: createPlatformPermissionResolver(declared()) });
    const request = () => directory.accessDirectory(admin, { pageSize: 100 });

    const before = await counted(request);
    for (let i = 0; i < 45; i++) await newActor(i % 3 === 0 ? 'developer' : 'user');
    const after = await counted(request);

    const totalOf = (r: Awaited<ReturnType<typeof request>>) => (r.outcome === 'ok' ? (r.data?.total ?? 0) : 0);
    expect(totalOf(after.out) - totalOf(before.out)).toBe(45);
    expect(after.count).toBe(before.count);
    // console:access (2) + member list (1) + batched deny/grant rows (2); a Managed System lookup would add at most one more.
    expect(after.count).toBe(5);
  });
});
