import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { DatabaseError } from 'pg';
import {
  type ArchivePermissionGroup, type CreatePermissionGroup, type ListPermissionGroupsQuery,
  type PermissionGroupItem, type SharePermissionGroup, type UpdatePermissionGroup,
  permissionGroupItemSchema,
} from '@ap/feature-shared';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { permissionGroups, permissionGroupCapabilities, permissionGroupShares, permissionGrants } from '../../db/schema/permission.js';
import { HttpError } from '../../lib/errors.js';
import { findWorkspaceActor, findWorkspaceActorDisplay } from '../auth/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { type ActorContext, type CheckService, capabilitiesOf } from './check-service.js';

type Group = typeof permissionGroups.$inferSelect;
export type GroupService = ReturnType<typeof createGroupService>;

async function isAdmin(tx: Tx, actor: ActorContext, check: CheckService) {
  return (await check.checkCapability(actor, 'workspace.admin', { workspace_id: actor.workspace_id }, { tx })).allow === true;
}

function visible(actor: ActorContext) {
  return or(eq(permissionGroups.kind, 'operator'), eq(permissionGroups.ownerActorId, actor.actor_id),
    sql`EXISTS (SELECT 1 FROM ${permissionGroupShares} s WHERE s.group_id = ${permissionGroups.id} AND s.actor_id = ${actor.actor_id})`);
}

/** Visibility is checked before returning an identity, including batch writes and replay. */
export async function visiblePermissionGroup(tx: Tx, actor: ActorContext, id: string, check: CheckService) {
  const admin = await isAdmin(tx, actor, check);
  const [group] = await tx.select().from(permissionGroups).where(and(
    eq(permissionGroups.id, id), eq(permissionGroups.workspaceId, actor.workspace_id),
    isNull(permissionGroups.archivedAt), admin ? undefined : visible(actor),
  )).for('share');
  if (!group) throw new HttpError('not_found.record', 'permission group not found');
  return group;
}

export async function validateGroupBatch(
  tx: Tx, actor: ActorContext, check: CheckService, input: { id?: string | undefined; capabilities: string[]; purpose: 'grant' | 'request' },
) {
  if (!input.id) return;
  const group = await visiblePermissionGroup(tx, actor, input.id, check);
  if (input.purpose === 'grant' && group.kind !== 'operator') {
    throw new HttpError('validation.failed', 'direct grants require an operator group', { fields: [{ path: ['permission_group_id'], code: 'custom' }] });
  }
  const members = await tx.select().from(permissionGroupCapabilities).where(eq(permissionGroupCapabilities.groupId, group.id));
  const allowed = new Set(members.map((row) => row.capability));
  input.capabilities.forEach((capability, index) => {
    if (!allowed.has(capability)) throw new HttpError('validation.failed', `row ${index + 1}: capability is outside the permission group`, {
      fields: [{ path: ['items', index, input.purpose === 'grant' ? 'capability' : 'requested_capability'], code: 'custom' }], item_index: index,
    });
  });
}

/** Origin is read only after authorizing its owning grant/request; archive never erases provenance. */
export async function permissionGroupOrigin(tx: Tx, workspaceId: string, id: string | null) {
  if (!id) return null;
  const [row] = await tx.select({ id: permissionGroups.id, name: permissionGroups.name }).from(permissionGroups)
    .where(and(eq(permissionGroups.id, id), eq(permissionGroups.workspaceId, workspaceId)));
  return row ?? null;
}

export function createGroupService(deps: { db: Db; checkService: CheckService; auditService: AuditService; idempotencyService: IdempotencyService }) {
  const registry = capabilitiesOf(deps.checkService);
  function validateCapabilities(kind: string, capabilities: string[]) {
    const seen = new Set<string>();
    capabilities.forEach((capability, index) => {
      if (!registry.has(capability) || seen.has(capability) ||
        (kind === 'personal' && (capability === 'workspace.admin' || registry.meta(capability).sensitive))) {
        throw new HttpError('validation.failed', 'invalid permission group capability', { fields: [{ path: ['capabilities', index], code: 'custom' }] });
      }
      seen.add(capability);
    });
  }
  async function members(tx: Tx, id: string) {
    return (await tx.select().from(permissionGroupCapabilities).where(eq(permissionGroupCapabilities.groupId, id))).map((x) => x.capability);
  }
  async function item(tx: Tx, actor: ActorContext, group: Group, admin: boolean): Promise<PermissionGroupItem> {
    async function actorRef(id: string) {
      const identity = await findWorkspaceActorDisplay(tx, { workspaceId: actor.workspace_id, actorId: id });
      if (!identity) throw new HttpError('internal.unexpected', 'permission group actor missing');
      return { actor_id: identity.id, display_name: identity.display_name };
    }
    const owner = await actorRef(group.ownerActorId);
    const capabilities = new Set(await members(tx, group.id));
    const shares = admin || group.ownerActorId === actor.actor_id
      ? await tx.select().from(permissionGroupShares).where(eq(permissionGroupShares.groupId, group.id)) : [];
    const shared_with = (await Promise.all(shares.map((share) => actorRef(share.actorId))))
      .sort((a, b) => a.display_name.localeCompare(b.display_name) || a.actor_id.localeCompare(b.actor_id));
    const [count] = admin ? await tx.select({ count: sql<number>`count(*)::int` }).from(permissionGrants).where(and(
      eq(permissionGrants.workspaceId, actor.workspace_id), eq(permissionGrants.permissionGroupId, group.id),
      isNull(permissionGrants.revokedAt), isNull(permissionGrants.supersededAt),
      or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, new Date())),
    )) : [];
    return permissionGroupItemSchema.parse({
      id: group.id, name: group.name, description: group.description, kind: group.kind, owner,
      capabilities: [...registry.names().filter((name) => capabilities.has(name)), ...[...capabilities].filter((name) => !registry.has(name)).sort()], shared_with,
      grant_count: admin ? count?.count ?? 0 : null,
      can_edit: group.kind === 'operator' ? admin : group.ownerActorId === actor.actor_id,
      updated_at: group.updatedAt.toISOString(),
    });
  }
  async function list(actor: ActorContext, query: ListPermissionGroupsQuery) {
    return deps.db.transaction(async (tx) => {
      const admin = await isAdmin(tx, actor, deps.checkService);
      if (query.scope === 'all' && !admin) throw new HttpError('permission.denied', 'workspace.admin required');
      const rows = await tx.select().from(permissionGroups).where(and(
        eq(permissionGroups.workspaceId, actor.workspace_id), isNull(permissionGroups.archivedAt),
        query.kind ? eq(permissionGroups.kind, query.kind) : undefined,
        admin && query.scope === 'all' ? undefined : visible(actor),
      )).orderBy(asc(permissionGroups.kind), asc(permissionGroups.name), asc(permissionGroups.id));
      return { items: await Promise.all(rows.map((row) => item(tx, actor, row, admin))) };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }
  async function get(actor: ActorContext, id: string) {
    return deps.db.transaction(async (tx) => {
      const group = await visiblePermissionGroup(tx, actor, id, deps.checkService);
      return item(tx, actor, group, await isAdmin(tx, actor, deps.checkService));
    });
  }
  async function write(actor: ActorContext, id: string | null, action: 'create' | 'update' | 'archive' | 'share',
    body: CreatePermissionGroup | UpdatePermissionGroup | ArchivePermissionGroup | SharePermissionGroup, key?: string) {
    try {
      return await deps.db.transaction(async (tx) => {
        const admin = await isAdmin(tx, actor, deps.checkService);
        let group: Group | undefined;
        if (id) {
          [group] = await tx.select().from(permissionGroups).where(and(eq(permissionGroups.id, id),
            eq(permissionGroups.workspaceId, actor.workspace_id), admin ? undefined : visible(actor))).for('update');
          if (!group) throw new HttpError('not_found.record', 'permission group not found');
          const canEdit = action === 'share' || group.kind === 'personal' ? group.ownerActorId === actor.actor_id : admin;
          if (group.archivedAt && !canEdit) throw new HttpError('not_found.record', 'permission group not found');
          if (action === 'share' && group.kind !== 'personal' && !group.archivedAt) {
            throw new HttpError('validation.failed', 'only personal groups can be shared', { fields: [{ path: ['actor_ids'], code: 'custom' }] });
          }
          if (!canEdit) throw new HttpError('permission.denied', 'permission group editor required');
        } else if ('kind' in body && body.kind === 'operator' && !admin) {
          throw new HttpError('permission.denied', 'workspace.admin required');
        }
        const run = async () => {
          if (group?.archivedAt) throw new HttpError('not_found.record', 'permission group not found');
          if (group && 'expected_updated_at' in body && group.updatedAt.getTime() !== new Date(body.expected_updated_at).getTime()) {
            throw new HttpError('conflict.stale_write', 'permission group changed', { current_updated_at: group.updatedAt.toISOString() });
          }
          const before = group ? await members(tx, group.id) : [];
          if ('capabilities' in body && body.capabilities) validateCapabilities(group?.kind ?? (body as CreatePermissionGroup).kind, body.capabilities);
          // Always advance the millisecond revision even when two writes share one clock tick.
          const now = new Date(Math.max(Date.now(), (group?.updatedAt.getTime() ?? 0) + 1));
          if (action === 'create') {
            const input = body as CreatePermissionGroup;
            [group] = await tx.insert(permissionGroups).values({ workspaceId: actor.workspace_id, ownerActorId: actor.actor_id,
              kind: input.kind, name: input.name, description: input.description ?? null, createdAt: now, updatedAt: now }).returning();
          } else if (group) {
            const input = body as UpdatePermissionGroup;
            if (action === 'share') {
              const ids = (body as SharePermissionGroup).actor_ids.map((x) => x.toLowerCase());
              const recipients = await Promise.all(ids.map((actorId) => findWorkspaceActor(tx, { workspaceId: actor.workspace_id, actorId })));
              if (new Set(ids).size !== ids.length || ids.includes(group.ownerActorId) || recipients.some((recipient) => recipient?.actor_type !== 'internal_member')) {
                throw new HttpError('validation.failed', 'shares require distinct workspace human actors other than the owner', { fields: [{ path: ['actor_ids'], code: 'custom' }] });
              }
              await tx.delete(permissionGroupShares).where(eq(permissionGroupShares.groupId, group.id));
              const groupId = group.id;
              if (ids.length) await tx.insert(permissionGroupShares).values(ids.map((actorId) => ({ groupId, actorId })));
            }
            [group] = await tx.update(permissionGroups).set({ updatedAt: now,
              ...(action === 'archive' ? { archivedAt: now } : {}),
              ...(action === 'update' && input.name !== undefined ? { name: input.name } : {}),
              ...(action === 'update' && input.description !== undefined ? { description: input.description } : {}),
            }).where(eq(permissionGroups.id, group.id)).returning();
          }
          if (!group) throw new HttpError('internal.unexpected', 'permission group write returned no row');
          if ('capabilities' in body && body.capabilities) {
            await tx.delete(permissionGroupCapabilities).where(eq(permissionGroupCapabilities.groupId, group.id));
            const groupId = group.id;
            await tx.insert(permissionGroupCapabilities).values(body.capabilities.map((capability) => ({ groupId, capability })));
          }
          const event = { create: 'permission_group_created', update: 'permission_group_updated', archive: 'permission_group_archived', share: 'permission_group_shared' } as const;
          await deps.auditService.record(tx, { workspace_id: actor.workspace_id, actor_id: actor.actor_id,
            subject_type: 'permission_group', subject_id: group.id, event_type: event[action], summary: `Permission group ${action}`,
            detail: { group_id: group.id, kind: group.kind, before_capabilities: before, after_capabilities: await members(tx, group.id),
              ...(action === 'share' ? { actor_ids: (body as SharePermissionGroup).actor_ids } : {}) },
          });
          const result = action === 'archive' ? { id: group.id, archived_at: now.toISOString() } : await item(tx, actor, group, admin);
          return { status: action === 'create' ? 201 : 200, body: result };
        };
        return key ? deps.idempotencyService.runIdempotent(tx, actor.actor_id, key,
          hashRequestBody({ action: `permission_group_${action}`, id, ...body }), run) : run();
      });
    } catch (error) {
      if ((error as DatabaseError).code === '23505') throw new HttpError('conflict.permission_group_name_taken', 'permission group name already exists');
      throw error;
    }
  }
  return { list, get, write };
}
