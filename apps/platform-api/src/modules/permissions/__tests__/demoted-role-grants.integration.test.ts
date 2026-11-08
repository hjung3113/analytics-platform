// #1531 — a grant made while the actor held a role that may receive the capability must stop counting once the actor is a User
// (ADR-0107 decision 3: the NOT_FOR_USER_ROLE capabilities are never usable by the User role). The decision reads the CURRENT
// role on every call; both the decision and the scope read (`resolveCapabilityScope`) go through the same grant loader.
// Throwaway DB only (run through `pnpm --filter @ap/platform-api test:integration`).

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { actors } from '../../../db/schema/core.js';
import { permissionGrants } from '../../../db/schema/permission.js';
import { createCheckService } from '../check-service.js';
import { actorScopeForCapability } from '../scope-service.js';
import { NOT_FOR_USER_ROLE } from '../supported-scope-policy.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('grants of User-excluded capabilities after a demotion (#1531)', () => {
  let handle: DbHandle;
  let svc: ReturnType<typeof createCheckService>;
  let adminId: string;
  let tempId: string;
  const externalId = `test-demoted-${randomUUID()}`;
  const scope = { workspace_id: WORKSPACE_ID };
  const asRole = (role: 'developer' | 'user') => ({
    actor_id: tempId,
    workspace_id: WORKSPACE_ID,
    role_level: role,
  });

  beforeAll(async () => {
    handle = createDb(APP_URL);
    svc = createCheckService({ db: handle.db });
    const admin = (
      await handle.db
        .select({ id: actors.id })
        .from(actors)
        .where(and(eq(actors.workspaceId, WORKSPACE_ID), eq(actors.externalId, 'mock-admin-1')))
        .limit(1)
    )[0];
    if (!admin) throw new Error('Seed missing: run `pnpm --filter @ap/platform-api db:seed`.');
    adminId = admin.id;
    const row = (
      await handle.db
        .insert(actors)
        .values({
          workspaceId: WORKSPACE_ID,
          externalId,
          email: `${externalId}@platform.local`,
          displayName: 'Demoted grant test',
          roleLevel: 'developer',
          actorType: 'internal_member',
        })
        .returning({ id: actors.id })
    )[0];
    if (!row) throw new Error('failed to insert temp actor');
    tempId = row.id;
  });

  afterAll(async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [tempId]);
    await handle.pool.query('delete from core.actors where id = $1', [tempId]);
    await handle?.close();
  });

  it.each([...NOT_FOR_USER_ROLE])('%s: allowed as Developer, refused once the same actor is a User, allowed again when promoted back', async (capability) => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [tempId]);
    await handle.db.insert(permissionGrants).values({
      workspaceId: WORKSPACE_ID,
      actorId: tempId,
      capability,
      grantedByActorId: adminId,
    });

    const asDeveloper = await svc.checkCapability(asRole('developer'), capability, scope);
    expect(asDeveloper.allow).toBe(true);

    // The grant row is untouched; only the current role changes.
    const asUser = await svc.checkCapability(asRole('user'), capability, scope);
    expect(asUser).toMatchObject({ allow: false, reason: 'no_grant', requestable: null });
    await expect(
      actorScopeForCapability(handle.db, asRole('user'), capability),
    ).resolves.toMatchObject({ kind: 'scoped', managedSystemIds: [] });

    // Nothing was revoked: the grant counts again when the role is restored.
    const restored = await svc.checkCapability(asRole('developer'), capability, scope);
    expect(restored.allow).toBe(true);
  });

  it('a User still holds a grant of a capability that is not excluded for the User role', async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id = $1', [tempId]);
    await handle.db.insert(permissionGrants).values({
      workspaceId: WORKSPACE_ID,
      actorId: tempId,
      capability: 'survey.export',
      grantedByActorId: adminId,
    });
    const asUser = await svc.checkCapability(asRole('user'), 'survey.export', scope);
    expect(asUser.allow).toBe(true);
  });
});
