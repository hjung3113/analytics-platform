// #1667 — the permissions the port resolves are the permissions the hand-written table resolved. Table-driven over every
// declared menu permission and the kernel rules × {admin, developer, user} × {no grant, workspace grant, MS-scoped grant,
// expired, revoked, superseded, denied (workspace and MS)}. `oldHolds` is the former `holds` switch of
// `platform-port/permissions.ts` (one `case` per permission), kept here as the oracle for this test only. Real Postgres,
// throwaway DB only; every actor is created by this suite.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { currentAuthContext } from '../../../lib/auth-context.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
} from '../../../test-support/permissions-fixtures.js';
import { eqvContribution } from '../../eqv/index.js';
import { improvementItemsContribution } from '../../improvement-items/item-endpoints.js';
import { logDatasetsContribution } from '../../log-datasets/index.js';
import { investigationContribution } from '../../log-explorer/index.js';
import { logKnowledgeContribution } from '../../log-knowledge/catalog-endpoints.js';
import { logLifecycleContribution } from '../../log-lifecycle/index.js';
import { createMenuDispatchRegistry } from '../../menu-dispatch/registry.js';
import {
  type CheckService,
  applyAdminModuleBypass,
  createCheckService,
} from '../../permissions/check-service.js';
import {
  FEATURES_ACCESS_CAPABILITIES,
  PLATFORM_PERMISSION_TABLE,
  type PlatformActor,
  type PlatformPermissionResolver,
  createPlatformPermissionResolver,
} from '../permissions.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-perm-equiv');

const ROLES = ['admin', 'developer', 'user'] as const;
type Role = (typeof ROLES)[number];

const stubDeps = { db: {}, checkService: {} } as never;
const declarations = () =>
  createMenuDispatchRegistry([
    logKnowledgeContribution(stubDeps),
    improvementItemsContribution(stubDeps),
    logLifecycleContribution(stubDeps),
    investigationContribution(stubDeps),
    eqvContribution(stubDeps),
    logDatasetsContribution(stubDeps),
  ]).permissions;

/** The former `holds` rules, one per permission, verbatim in behavior (the oracle). The two User early returns are the copies #1667 removed. */
const OLD_USER_EARLY_RETURN = new Set(['dataset.baseline.approve', 'dataset.suite.run']);

async function oldHolds(checkService: CheckService, actor: PlatformActor, permission: string, capability?: string) {
  const ws = { workspace_id: actor.workspace_id };
  const kernel = PLATFORM_PERMISSION_TABLE.find((e) => e.permission === permission);
  if (kernel) {
    switch (kernel.rule) {
      case 'every-session':
        if (currentAuthContext().kind !== 'token') return true;
        return (await checkService.checkCapability(actor, 'workspace.read', ws)).allow;
      case 'workspace-admin':
        return (await checkService.checkCapability(actor, 'workspace.admin', ws)).allow;
      case 'features-access': {
        if (currentAuthContext().kind !== 'token' && (actor.role_level === 'developer' || actor.role_level === 'admin')) return true;
        for (const cap of FEATURES_ACCESS_CAPABILITIES) {
          const scope = await checkService.capabilityScope(actor, cap, ws);
          if (scope.kind === 'all' || scope.managed_system_ids.length > 0) return true;
        }
        return false;
      }
    }
  }
  if (!capability) throw new Error(`no oracle for ${permission}`);
  if (OLD_USER_EARLY_RETURN.has(capability) && actor.role_level === 'user') return false;
  const cap = capability as Parameters<typeof applyAdminModuleBypass>[1];
  return applyAdminModuleBypass(actor.role_level, cap, await checkService.checkCapability(actor, cap, ws)).allow;
}

const STATES = [
  'no grant',
  'workspace grant',
  'MS-scoped grant',
  'expired grant',
  'revoked grant',
  'superseded grant',
  'workspace grant + workspace deny',
  'workspace grant + MS deny',
] as const;
type State = (typeof STATES)[number];

describe.skipIf(!runIntegration)('platform permissions: declared resolution equals the former rule table (#1667)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let checkService: CheckService;
  let resolver: PlatformPermissionResolver;
  let msId = '';
  let grantor = '';
  const created = new Map<string, PlatformActor>();
  const key = (role: Role, state: State) => `${role} / ${state}`;

  /** Every capability the table can read: the declared ones, `workspace.admin` and the three features-access capabilities. */
  const capabilities = () => [
    ...new Set([
      'workspace.read',
      'workspace.admin',
      ...FEATURES_ACCESS_CAPABILITIES,
      ...declarations().map((d) => d.capability as string),
    ]),
  ];

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    checkService = createCheckService({ db: dbHandle.db });
    resolver = createPlatformPermissionResolver(declarations());
    msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${PREFIX}-ms`, 'Equivalence MS');
    grantor = (
      await insertActorRow(migrateHandle, { workspaceId: WORKSPACE_ID, externalId: `${PREFIX}-grantor`, roleLevel: 'admin' })
    ).id;
    let n = 0;
    for (const role of ROLES) {
      for (const state of STATES) {
        const { id } = await insertActorRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          externalId: `${PREFIX}-${n++}`,
          roleLevel: role,
        });
        created.set(key(role, state), { actor_id: id, workspace_id: WORKSPACE_ID, role_level: role });
        for (const capability of capabilities()) {
          const grant = (ms: string | null) => grantCapability(migrateHandle, WORKSPACE_ID, id, capability, ms, grantor);
          if (state === 'workspace grant' || state.startsWith('workspace grant +')) await grant(null);
          if (state === 'MS-scoped grant') await grant(msId);
          if (state === 'expired grant') await expireCapabilityGrant(migrateHandle, await grant(null));
          if (state === 'revoked grant') await revokeCapabilityGrant(migrateHandle, await grant(null), grantor);
          if (state === 'superseded grant') {
            const grantId = await grant(null);
            await migrateHandle.pool.query(`update permission.permission_grants set superseded_at = now() where id = $1`, [grantId]);
          }
          if (state === 'workspace grant + workspace deny') await denyCapability(migrateHandle, WORKSPACE_ID, id, capability, null, grantor);
          if (state === 'workspace grant + MS deny') await denyCapability(migrateHandle, WORKSPACE_ID, id, capability, msId, grantor);
        }
      }
    }
  });

  afterAll(async () => {
    const ids = [...created.values()].map((a) => a.actor_id);
    if (ids.length > 0) {
      await migrateHandle.pool.query(`delete from permission.permission_denies where actor_id = any($1::uuid[])`, [ids]);
      await migrateHandle.pool.query(`delete from permission.permission_grants where actor_id = any($1::uuid[])`, [ids]);
      await migrateHandle.pool.query(`delete from core.audit_log where actor_id = any($1::uuid[]) or actor_id = $2`, [ids, grantor]);
      await migrateHandle.pool.query(`delete from core.actors where id = any($1::uuid[]) or id = $2`, [ids, grantor]);
    }
    await migrateHandle.pool.query(`delete from core.managed_systems where id = $1`, [msId]);
    await dbHandle.close();
    await migrateHandle.close();
  });

  const cases = ROLES.flatMap((role) => STATES.map((state) => [role, state] as const));

  it.each(cases)('%s / %s: the resolved set equals the oracle, batched or single', async (role, state) => {
    const actor = created.get(key(role, state));
    if (!actor) throw new Error('actor not created');
    const byCapability = new Map(declarations().map((d) => [d.permission, d.capability as string]));
    const oracle: string[] = [];
    for (const permission of resolver.order()) {
      if (await oldHolds(checkService, actor, permission, byCapability.get(permission))) oracle.push(permission);
    }

    expect(await resolver.resolve(checkService, actor)).toEqual([...oracle].sort());
    expect(
      (await resolver.resolveBatch(checkService, [actor])).get(actor.actor_id),
      'canonical order',
    ).toEqual(oracle);
    for (const permission of resolver.order()) {
      expect(await resolver.holds(checkService, actor, permission), permission).toBe(oracle.includes(permission));
    }
  });

  it('resolves all actors in one batch with the same sets as resolving each alone', async () => {
    const actors = [...created.values()];
    const batch = await resolver.resolveBatch(checkService, actors);
    for (const actor of actors) {
      expect(batch.get(actor.actor_id)).toEqual(
        (await resolver.resolveBatch(checkService, [actor])).get(actor.actor_id),
      );
    }
  });

  it('is not vacuous: the matrix has granted, ungranted, bypassed and user-excluded outcomes', async () => {
    const held = async (role: Role, state: State) =>
      (await resolver.resolveBatch(checkService, [created.get(key(role, state)) as PlatformActor]))
        .get((created.get(key(role, state)) as PlatformActor).actor_id) as string[];
    // Admin bypass: `always` capabilities open without a grant; `none` ones (explorer, baseline approve) do not.
    expect(await held('admin', 'no grant')).toContain('knowledge:catalog-manage');
    expect(await held('admin', 'no grant')).not.toContain('explorer:investigate');
    expect(await held('admin', 'no grant')).not.toContain('dataset:baseline-approve');
    // A grant opens it for a developer; expiry, revocation, supersession, deny take it away.
    expect(await held('developer', 'workspace grant')).toContain('explorer:investigate');
    for (const state of ['expired grant', 'revoked grant', 'superseded grant', 'workspace grant + workspace deny'] as const) {
      expect(await held('developer', state), state).not.toContain('explorer:investigate');
    }
    // A MS-scoped grant does not open a workspace-wide menu permission; an MS deny does not block a workspace grant.
    expect(await held('developer', 'MS-scoped grant')).not.toContain('explorer:investigate');
    expect(await held('developer', 'workspace grant + MS deny')).toContain('explorer:investigate');
    // A User never holds a user-excluded capability, even with a live grant.
    expect(await held('user', 'workspace grant')).not.toContain('dataset:suite-run');
    expect(await held('user', 'workspace grant')).not.toContain('dataset:baseline-approve');
    expect(await held('user', 'workspace grant')).not.toContain('knowledge:catalog-manage');
  });
});
