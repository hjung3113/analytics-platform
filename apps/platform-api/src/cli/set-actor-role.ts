// Operator job: change the role of one existing Actor (first-admin bootstrap).
//
// Usage (migrate-role job; the runtime backend never receives these secrets):
//   DATABASE_URL_MIGRATE=… WORKSPACE_ID=<uuid> \
//     node dist/cli/set-actor-role.js --external-id <idp-sub> --role admin|user [--reason <text>] [--revoke-admin-grants]
//
// Behavior:
//   * The Actor must already exist: the person logs in once first (the first
//     OIDC login creates the Actor as `user`).
//   * One transaction: per-workspace advisory lock → check → update → one
//     `actor_role_changed` audit row attributed to the `system` Actor.
//   * Lowering an admin who holds active `workspace.admin` grants (not revoked,
//     not superseded, not expired) is refused with the count (exit 5): a
//     demotion alone leaves those grants answering the admin checks. With
//     `--revoke-admin-grants` the grants are revoked in the same transaction,
//     one `permission_revoked` audit row each, attributed to the `system` Actor.
//   * Already at the requested role → no change, no audit row, exit 0.
//   * Prints one JSON line (ids and roles only, never an email).
//
// Exit codes:
//   0 changed or already set   1 usage / config / unexpected error
//   2 unknown external id (log in first)   3 refused: last non-system admin
//   4 refused: the `system` Actor
//   5 refused: active `workspace.admin` grants, rerun with --revoke-admin-grants

import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';

import { type DbHandle, createDb } from '../db/client.js';
import { actors } from '../db/schema/core.js';
import { permissionGrants } from '../db/schema/permission.js';
import { createAuditService } from '../modules/core/audit/audit-service.js';

export type SettableRole = 'admin' | 'user';

export class SetActorRoleError extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2 | 3 | 4 | 5,
  ) {
    super(message);
    this.name = 'SetActorRoleError';
  }
}

export interface SetActorRoleInput {
  workspaceId: string;
  externalId: string;
  role: SettableRole;
  reason?: string | undefined;
  /** Revoke the target's active workspace.admin grants in the same transaction when lowering an admin. */
  revokeAdminGrants?: boolean | undefined;
}

export interface SetActorRoleResult {
  changed: boolean;
  actorId: string;
  externalId: string;
  beforeRole: string;
  afterRole: SettableRole;
}

/** Test-only seam; the CLI never passes it. Each hook runs inside the transaction. */
export interface SetActorRoleHooks {
  /** After the last-admin count, before the update. */
  afterAdminCount?: () => Promise<void>;
  /** After the update, before the audit row. */
  afterUpdate?: () => Promise<void>;
}

export async function setActorRole(
  handle: DbHandle,
  input: SetActorRoleInput,
  hooks: SetActorRoleHooks = {},
): Promise<SetActorRoleResult> {
  const audit = createAuditService();
  return handle.db.transaction(async (tx) => {
    // Serialize role changes per workspace before counting admins, so two
    // concurrent demotions cannot both pass the last-admin check.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`actor-role:${input.workspaceId}`}, 0))`,
    );

    const [target] = await tx
      .select({
        id: actors.id,
        externalId: actors.externalId,
        roleLevel: actors.roleLevel,
        actorType: actors.actorType,
      })
      .from(actors)
      .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.externalId, input.externalId)))
      .for('update');
    if (!target) {
      throw new SetActorRoleError(
        `no actor with external id '${input.externalId}' in this workspace; ask the person to log in once first, then rerun`,
        2,
      );
    }
    if (target.actorType === 'system') {
      throw new SetActorRoleError('the system actor role cannot be changed', 4);
    }
    const result = {
      actorId: target.id,
      externalId: target.externalId,
      beforeRole: target.roleLevel,
      afterRole: input.role,
    };
    if (target.roleLevel === input.role) return { changed: false, ...result };

    if (target.roleLevel === 'admin') {
      const others = await tx
        .select({ id: actors.id })
        .from(actors)
        .where(
          and(
            eq(actors.workspaceId, input.workspaceId),
            eq(actors.roleLevel, 'admin'),
            ne(actors.actorType, 'system'),
            ne(actors.id, target.id),
          ),
        )
        .limit(1);
      if (others.length === 0) {
        throw new SetActorRoleError('refusing to demote the last non-system admin actor', 3);
      }
    }

    // A demotion only changes the role column; workspace.admin grants keep
    // answering the admin checks (#2057). Surface them instead of leaving them.
    const now = new Date();
    const adminGrants =
      target.roleLevel === 'admin'
        ? await tx
            .select({
              id: permissionGrants.id,
              capability: permissionGrants.capability,
              managedSystemId: permissionGrants.managedSystemId,
            })
            .from(permissionGrants)
            .where(
              and(
                eq(permissionGrants.workspaceId, input.workspaceId),
                eq(permissionGrants.actorId, target.id),
                eq(permissionGrants.capability, 'workspace.admin'),
                isNull(permissionGrants.revokedAt),
                isNull(permissionGrants.supersededAt),
                or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, now)),
              ),
            )
            .for('update')
        : [];
    if (adminGrants.length > 0 && !input.revokeAdminGrants) {
      throw new SetActorRoleError(
        `refusing to lower '${input.externalId}': ${adminGrants.length} active workspace.admin grant(s) would keep passing admin checks; rerun with --revoke-admin-grants to revoke them in the same change`,
        5,
      );
    }

    await hooks.afterAdminCount?.();

    const [system] = await tx
      .select({ id: actors.id })
      .from(actors)
      .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.actorType, 'system')));
    if (!system) {
      throw new SetActorRoleError(
        'system actor missing in this workspace; run the seed with SEED_MODE=bootstrap first',
        1,
      );
    }

    await tx
      .update(actors)
      .set({ roleLevel: input.role })
      .where(and(eq(actors.workspaceId, input.workspaceId), eq(actors.id, target.id)));
    const revokeReason = input.reason ?? 'actor lowered from admin by set-actor-role';
    for (const grant of adminGrants) {
      await tx
        .update(permissionGrants)
        .set({ revokedAt: now, revokedByActorId: system.id, revokedReason: revokeReason })
        .where(
          and(
            eq(permissionGrants.workspaceId, input.workspaceId),
            eq(permissionGrants.id, grant.id),
          ),
        );
      // Same event and detail shape as the API revoke (grant-admin-service revokeGrant).
      await audit.record(tx, {
        workspace_id: input.workspaceId,
        actor_id: system.id,
        event_type: 'permission_revoked',
        subject_type: 'permission_grant',
        subject_id: grant.id,
        summary: 'Permission grant revoked',
        detail: {
          grant_id: grant.id,
          capability: grant.capability,
          managed_system_id: grant.managedSystemId,
          grantee_actor_id: target.id,
          reason: revokeReason,
        },
      });
    }
    await hooks.afterUpdate?.();
    await audit.record(tx, {
      workspace_id: input.workspaceId,
      actor_id: system.id,
      event_type: 'actor_role_changed',
      subject_type: 'actor',
      subject_id: target.id,
      summary: `actor role ${target.roleLevel} -> ${input.role}`,
      detail: {
        before_role: target.roleLevel,
        after_role: input.role,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    return { changed: true, ...result };
  });
}

export function parseArgs(argv: readonly string[]): {
  externalId: string;
  role: SettableRole;
  reason?: string;
  revokeAdminGrants?: true;
} {
  const revokeAdminGrants = argv.includes('--revoke-admin-grants');
  const pairs = argv.filter((a) => a !== '--revoke-admin-grants');
  const values = new Map<string, string>();
  for (let i = 0; i < pairs.length; i += 2) {
    const key = pairs[i];
    const value = pairs[i + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new SetActorRoleError(`bad argument near '${key ?? ''}'`, 1);
    }
    values.set(key, value);
  }
  const externalId = values.get('--external-id');
  const role = values.get('--role');
  if (!externalId) throw new SetActorRoleError('--external-id is required', 1);
  if (role !== 'admin' && role !== 'user') {
    throw new SetActorRoleError('--role must be admin or user', 1);
  }
  const reason = values.get('--reason');
  return {
    externalId,
    role,
    ...(reason ? { reason } : {}),
    ...(revokeAdminGrants ? { revokeAdminGrants } : {}),
  };
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL_MIGRATE;
  const workspaceId = process.env.WORKSPACE_ID;
  if (!url || !workspaceId) {
    console.error('set-actor-role failed: DATABASE_URL_MIGRATE and WORKSPACE_ID are required');
    return 1;
  }
  const handle = createDb(url);
  try {
    const args = parseArgs(process.argv.slice(2));
    const r = await setActorRole(handle, { workspaceId, ...args });
    console.info(JSON.stringify(r));
    return 0;
  } catch (err) {
    console.error(`set-actor-role failed: ${err instanceof Error ? err.message : String(err)}`);
    return err instanceof SetActorRoleError ? err.exitCode : 1;
  } finally {
    await handle.close();
  }
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('set-actor-role.ts') === true ||
  process.argv[1]?.endsWith('set-actor-role.js') === true;

if (invokedAsScript) {
  process.exit(await main());
}
