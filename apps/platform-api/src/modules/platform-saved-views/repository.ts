// SQL for platform saved views. Every statement filters on workspace_id (the workspace fence). Callers pass the
// transaction handle; this file owns no transaction and no policy.

import { sql } from 'drizzle-orm';

import { sqlUuidArray } from '../../db/sql-arrays.js';
import type { Tx } from '../../db/tx.js';
import type { ActorContext, Pending, Standings, ViewBody, ViewRecord } from './acl.js';

interface ViewRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  kind: ViewRecord['kind'];
  menu_id: string | null;
  name: string;
  content: ViewBody;
  version: number;
  updated_at: number;
  visibility_kind: ViewRecord['visibilityKind'];
  approval: ViewRecord['approval'];
  approval_note: string | null;
  pending: Pending | null;
  people: string[];
  group_ids: string[];
}

const VIEW_COLUMNS = sql`v.id, v.owner_id, v.kind, v.menu_id, v.name, v.content, v.version,
  v.updated_at_ms::double precision as updated_at, v.visibility_kind, v.approval, v.approval_note, v.pending,
  coalesce((select array_agg(p.actor_id::text order by p.actor_id) from platform.saved_view_people p where p.view_id = v.id), '{}') as people,
  coalesce((select array_agg(s.group_id::text order by s.group_id) from platform.saved_view_group_shares s where s.view_id = v.id), '{}') as group_ids`;

const toRecord = (r: ViewRow): ViewRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  kind: r.kind,
  menuId: r.menu_id,
  name: r.name,
  content: r.content,
  version: r.version,
  updatedAt: Number(r.updated_at),
  visibilityKind: r.visibility_kind,
  approval: r.approval,
  approvalNote: r.approval_note,
  pending: r.pending,
  people: r.people,
  groupIds: r.group_ids,
});

/** One transaction-wide lock per workspace: every multi-row mutation (views, groups, defaults, import) runs under it. */
export async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(
    sql`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`platform-saved-views:${workspaceId}`}, 0))`,
  );
}

export async function standingsOf(tx: Tx, actor: ActorContext): Promise<Standings> {
  const { rows } = await tx.execute<{
    group_id: string;
    is_member: boolean;
    is_manager: boolean;
  }>(sql`
    select m.group_id::text as group_id, m.is_member, m.is_manager
    from platform.saved_view_group_members m
    join platform.saved_view_groups g on g.id = m.group_id
    where g.workspace_id = ${actor.workspaceId} and m.actor_id = ${actor.id}`);
  return new Map(rows.map((r) => [r.group_id, { member: r.is_member, manager: r.is_manager }]));
}

export async function viewById(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<ViewRecord | null> {
  const { rows } = await tx.execute<ViewRow>(
    sql`select ${VIEW_COLUMNS} from platform.saved_views v where v.workspace_id = ${workspaceId} and v.id = ${id}`,
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

/** Views of one menu (`null` = condition sets) the actor might reach; `isReachable` stays the judge. */
export async function viewsOfMenu(
  tx: Tx,
  actor: ActorContext,
  menuId: string | null,
): Promise<ViewRecord[]> {
  const { rows } = await tx.execute<ViewRow>(sql`
    select ${VIEW_COLUMNS} from platform.saved_views v
    where v.workspace_id = ${actor.workspaceId}
      and ${menuId === null ? sql`v.kind = 'condition-set'` : sql`v.menu_id = ${menuId}`}
      and (v.owner_id = ${actor.id} or v.visibility_kind = 'official'
        or exists (select 1 from platform.saved_view_people p where p.view_id = v.id and p.actor_id = ${actor.id})
        or exists (select 1 from platform.saved_view_group_shares s join platform.saved_view_group_members m on m.group_id = s.group_id
                   where s.view_id = v.id and m.actor_id = ${actor.id})
        or (${actor.approver} and (v.approval = 'pending' or v.pending ->> 'approval' = 'pending')))
    order by v.updated_at_ms desc, v.id`);
  return rows.map(toRecord);
}

export async function insertView(
  tx: Tx,
  input: {
    workspaceId: string;
    ownerId: string;
    kind: ViewRecord['kind'];
    menuId: string | null;
    name: string;
    content: ViewBody;
    now: number;
  },
): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into platform.saved_views (workspace_id, owner_id, kind, menu_id, name, content, version, updated_at_ms)
    values (${input.workspaceId}, ${input.ownerId}, ${input.kind}, ${input.menuId}, ${input.name}, ${JSON.stringify(input.content)}::jsonb, 1, ${input.now})
    returning id`);
  return (rows[0] as { id: string }).id;
}

/** Writes the whole mutable state of a view and bumps its version; the caller has checked ACL and expectedVersion under the lock. */
export async function writeView(
  tx: Tx,
  workspaceId: string,
  next: ViewRecord,
  now: number,
): Promise<ViewRecord> {
  await tx.execute(sql`
    update platform.saved_views set
      name = ${next.name}, content = ${JSON.stringify(next.content)}::jsonb, version = version + 1, updated_at_ms = ${now},
      visibility_kind = ${next.visibilityKind}, approval = ${next.approval}, approval_note = ${next.approvalNote},
      pending = ${next.pending === null ? null : JSON.stringify(next.pending)}::jsonb
    where workspace_id = ${workspaceId} and id = ${next.id}`);
  const written = await viewById(tx, workspaceId, next.id);
  return written as ViewRecord;
}

export async function replaceAudience(
  tx: Tx,
  workspaceId: string,
  viewId: string,
  people: readonly string[],
  groupIds: readonly string[],
): Promise<void> {
  await tx.execute(
    sql`delete from platform.saved_view_people p using platform.saved_views v where p.view_id = v.id and v.workspace_id = ${workspaceId} and v.id = ${viewId}`,
  );
  await tx.execute(
    sql`delete from platform.saved_view_group_shares s using platform.saved_views v where s.view_id = v.id and v.workspace_id = ${workspaceId} and v.id = ${viewId}`,
  );
  if (people.length > 0) {
    await tx.execute(
      sql`insert into platform.saved_view_people (view_id, actor_id) select ${viewId}::uuid, unnest(${sqlUuidArray(people)})`,
    );
  }
  if (groupIds.length > 0) {
    await tx.execute(
      sql`insert into platform.saved_view_group_shares (view_id, group_id) select ${viewId}::uuid, unnest(${sqlUuidArray(groupIds)})`,
    );
  }
}

/** Defaults of other people stop applying when their access path is cut; reads still re-judge access, this only prevents a later resurrection. */
export async function dropDefaultsExcept(
  tx: Tx,
  workspaceId: string,
  viewId: string,
  keepActorIds: readonly string[],
): Promise<void> {
  await tx.execute(
    sql`delete from platform.saved_view_defaults where workspace_id = ${workspaceId} and view_id = ${viewId} and actor_id <> all(${sqlUuidArray(keepActorIds)})`,
  );
}

export async function deleteView(tx: Tx, workspaceId: string, id: string): Promise<void> {
  await tx.execute(
    sql`delete from platform.saved_views where workspace_id = ${workspaceId} and id = ${id}`,
  );
}

const menuKey = (menuId: string | null) => menuId ?? '';

export async function defaultOf(
  tx: Tx,
  actor: ActorContext,
  menuId: string | null,
): Promise<string | null> {
  const { rows } = await tx.execute<{ view_id: string }>(sql`
    select view_id::text as view_id from platform.saved_view_defaults
    where workspace_id = ${actor.workspaceId} and actor_id = ${actor.id} and menu_key = ${menuKey(menuId)}`);
  return rows[0]?.view_id ?? null;
}

export async function putDefault(
  tx: Tx,
  actor: ActorContext,
  menuId: string | null,
  viewId: string | null,
): Promise<void> {
  if (viewId === null) {
    await tx.execute(
      sql`delete from platform.saved_view_defaults where workspace_id = ${actor.workspaceId} and actor_id = ${actor.id} and menu_key = ${menuKey(menuId)}`,
    );
    return;
  }
  await tx.execute(sql`
    insert into platform.saved_view_defaults (workspace_id, actor_id, menu_key, view_id)
    values (${actor.workspaceId}, ${actor.id}, ${menuKey(menuId)}, ${viewId})
    on conflict (workspace_id, actor_id, menu_key) do update set view_id = excluded.view_id`);
}

/** Insert only when the actor has no default for this menu yet: an import never overwrites a server default. */
export async function putDefaultIfAbsent(
  tx: Tx,
  actor: ActorContext,
  menuId: string | null,
  viewId: string,
): Promise<void> {
  await tx.execute(sql`
    insert into platform.saved_view_defaults (workspace_id, actor_id, menu_key, view_id)
    values (${actor.workspaceId}, ${actor.id}, ${menuKey(menuId)}, ${viewId})
    on conflict (workspace_id, actor_id, menu_key) do nothing`);
}

// ---- groups ----

export interface GroupRecord {
  id: string;
  name: string;
  /** Existing internal members only (a person who left the directory is not shown or counted). */
  members: { id: string; displayName: string }[];
  managerIds: string[];
}

interface GroupRow extends Record<string, unknown> {
  id: string;
  name: string;
  members: { id: string; displayName: string }[];
  manager_ids: string[];
}

const GROUP_COLUMNS = sql`g.id, g.name,
  coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'displayName', a.display_name) order by a.display_name, a.id)
            from platform.saved_view_group_members m join core.actors a on a.id = m.actor_id
            where m.group_id = g.id and m.is_member and a.workspace_id = g.workspace_id and a.actor_type = 'internal_member'), '[]'::jsonb) as members,
  coalesce((select array_agg(m.actor_id::text order by m.actor_id)
            from platform.saved_view_group_members m join core.actors a on a.id = m.actor_id
            where m.group_id = g.id and m.is_manager and a.workspace_id = g.workspace_id and a.actor_type = 'internal_member'), '{}') as manager_ids`;

const toGroup = (r: GroupRow): GroupRecord => ({
  id: r.id,
  name: r.name,
  members: r.members,
  managerIds: r.manager_ids,
});

export async function groupsOf(tx: Tx, workspaceId: string): Promise<GroupRecord[]> {
  const { rows } = await tx.execute<GroupRow>(
    sql`select ${GROUP_COLUMNS} from platform.saved_view_groups g where g.workspace_id = ${workspaceId} order by g.name, g.id`,
  );
  return rows.map(toGroup);
}

export async function groupById(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<GroupRecord | null> {
  const { rows } = await tx.execute<GroupRow>(
    sql`select ${GROUP_COLUMNS} from platform.saved_view_groups g where g.workspace_id = ${workspaceId} and g.id = ${id}`,
  );
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function insertGroup(
  tx: Tx,
  input: { workspaceId: string; name: string; createdBy: string; memberIds: readonly string[] },
): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(
    sql`insert into platform.saved_view_groups (workspace_id, name, created_by) values (${input.workspaceId}, ${input.name}, ${input.createdBy}) returning id`,
  );
  const id = (rows[0] as { id: string }).id;
  await tx.execute(
    sql`insert into platform.saved_view_group_members (group_id, actor_id, is_member, is_manager) values (${id}, ${input.createdBy}, false, true)`,
  );
  if (input.memberIds.length > 0) {
    await tx.execute(sql`
      insert into platform.saved_view_group_members (group_id, actor_id, is_member, is_manager)
      select ${id}::uuid, unnest(${sqlUuidArray(input.memberIds)}), true, false
      on conflict (group_id, actor_id) do update set is_member = true`);
  }
  return id;
}

export async function renameGroup(
  tx: Tx,
  workspaceId: string,
  id: string,
  name: string,
): Promise<void> {
  await tx.execute(
    sql`update platform.saved_view_groups set name = ${name} where workspace_id = ${workspaceId} and id = ${id}`,
  );
}

export async function removeFromGroup(
  tx: Tx,
  groupId: string,
  actorIds: readonly string[],
): Promise<void> {
  if (actorIds.length > 0)
    await tx.execute(
      sql`delete from platform.saved_view_group_members where group_id = ${groupId} and actor_id = any(${sqlUuidArray(actorIds)})`,
    );
}

export async function addToGroup(
  tx: Tx,
  groupId: string,
  actorIds: readonly string[],
): Promise<void> {
  if (actorIds.length > 0) {
    await tx.execute(sql`
      insert into platform.saved_view_group_members (group_id, actor_id, is_member, is_manager)
      select ${groupId}::uuid, unnest(${sqlUuidArray(actorIds)}), true, false
      on conflict (group_id, actor_id) do update set is_member = true`);
  }
}

/** Groups (of this workspace) that exist among `ids`. */
export async function existingGroupIds(
  tx: Tx,
  workspaceId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await tx.execute<{ id: string }>(
    sql`select id::text as id from platform.saved_view_groups where workspace_id = ${workspaceId} and id = any(${sqlUuidArray(ids)})`,
  );
  return new Set(rows.map((r) => r.id));
}

// ---- people (the workspace's internal-member directory; core.actors has no deactivation column) ----

export interface PersonRow {
  id: string;
  displayName: string;
}

export async function peopleByIds(
  tx: Tx,
  workspaceId: string,
  ids: readonly string[],
): Promise<PersonRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await tx.execute<{ id: string; display_name: string }>(sql`
    select id::text as id, display_name from core.actors
    where workspace_id = ${workspaceId} and actor_type = 'internal_member' and id = any(${sqlUuidArray(ids)})
    order by display_name, id`);
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchPeopleByName(
  tx: Tx,
  workspaceId: string,
  query: string,
  limit: number,
): Promise<PersonRow[]> {
  const { rows } = await tx.execute<{ id: string; display_name: string }>(sql`
    select id::text as id, display_name from core.actors
    where workspace_id = ${workspaceId} and actor_type = 'internal_member' and display_name ilike ${`%${escapeLike(query)}%`}
    order by display_name, id limit ${limit}`);
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

// ---- import mapping ----

export interface ImportRow {
  contentHash: string;
  viewId: string;
}

export async function importRowOf(
  tx: Tx,
  actor: ActorContext,
  token: string,
  legacyKey: string,
): Promise<ImportRow | null> {
  const { rows } = await tx.execute<{ content_hash: string; view_id: string }>(sql`
    select content_hash, view_id::text as view_id from platform.saved_view_imports
    where workspace_id = ${actor.workspaceId} and actor_id = ${actor.id} and import_token = ${token} and legacy_key = ${legacyKey}`);
  return rows[0] ? { contentHash: rows[0].content_hash, viewId: rows[0].view_id } : null;
}

export async function insertImportRow(
  tx: Tx,
  actor: ActorContext,
  token: string,
  legacyKey: string,
  contentHash: string,
  viewId: string,
): Promise<void> {
  await tx.execute(sql`
    insert into platform.saved_view_imports (workspace_id, actor_id, import_token, legacy_key, content_hash, view_id)
    values (${actor.workspaceId}, ${actor.id}, ${token}, ${legacyKey}, ${contentHash}, ${viewId})`);
}
