// Platform saved-view service (ADR-0099). Owns transactions, object ACL, concurrency and audit; the route only
// parses, authenticates and responds. Every mutation runs under one workspace lock, compares `expectedVersion`
// and the ACL inside that same transaction, writes nothing on a failed or no-op call, and records its audit event
// in the same transaction. Reads run in one repeatable-read snapshot so a concurrent membership change cannot
// tear a list. Menu and Scope are never judged here: the data boundary does that when a view is opened.

import { createHash } from 'node:crypto';

import { savedViewDraftSchema } from '@ap/contract-schemas';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { canonicalJson } from '../platform-port/session-version.js';
import {
  type ActorContext,
  type Pending,
  REVOKE_NOTE,
  type Standings,
  type ViewBody,
  type ViewRecord,
  canTransition,
  capabilitiesOf,
  isOwnerOrManager,
  isReachable,
  proposalChanges,
  savedViewOf,
  shownTo,
} from './acl.js';
import * as repo from './repository.js';
import { asUuid, isPgSafeDeep, isPgSafeString } from './safe.js';
import {
  type CommandOf,
  type Failure,
  type ImportOutcomeJson,
  type ResultOf,
  type SavedViewCommandIn,
  type SavedViewDraftIn,
  type SavedViewEntryJson,
  type SavedViewListItemJson,
  fail,
} from './types.js';

export interface SavedViewSession {
  actorId: string;
  workspaceId: string;
  roleLevel: string;
}

export interface SavedViewServiceDeps {
  db: Db;
  checkService: CheckService;
  now?: () => number;
}

const AUDIENCE_MAX = 200;
const GROUP_MEMBERS_MAX = 500;
const NAME_MAX = 100;
const NOTE_MAX = 2000;
const SEARCH_MAX = 20;
const QUERY_MAX = 100;

/** Thrown inside a write transaction to roll it back and hand the failure to the caller. */
class Abort extends Error {
  constructor(readonly failure: Failure) {
    super('abort');
  }
}

const bodyOf = (draft: SavedViewDraftIn): ViewBody =>
  draft.kind === 'condition-set'
    ? { context: draft.context }
    : {
        context: draft.context,
        menuSchemaVersion: draft.menuSchemaVersion,
        page: draft.page,
        chartOptions: draft.chartOptions,
        layout: draft.layout,
        panels: draft.panels,
      };

const unique = (values: readonly string[]) => [...new Set(values)];
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const hashOf = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export function createSavedViewService(deps: SavedViewServiceDeps) {
  const now = deps.now ?? Date.now;
  const audit = createAuditService();

  /** The session's role in the actor handed to a command, so a write can re-judge it after the lock. */
  const sessions = new WeakMap<ActorContext, SavedViewSession>();

  async function actorOf(session: SavedViewSession, tx?: Tx): Promise<ActorContext> {
    const approver = await holdsPlatformPermission(
      deps.checkService,
      {
        actor_id: session.actorId,
        workspace_id: session.workspaceId,
        role_level: session.roleLevel,
      },
      'console:access',
      tx ? { tx } : {},
    );
    const actor = { id: session.actorId, workspaceId: session.workspaceId, approver };
    sessions.set(actor, session);
    return actor;
  }

  function read<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return deps.db.transaction(work, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    });
  }

  /**
   * One workspace-serialized transaction; a `Failure` from `work` rolls everything back (rows and audit).
   * `console:access` is judged again inside the transaction after the lock, so a grant revoked, denied or expired
   * while this call waited never authorizes it; `work` receives that fresh actor and must use it.
   */
  async function write<T>(
    stale: ActorContext,
    work: (tx: Tx, standings: Standings, actor: ActorContext) => Promise<ResultOf<T>>,
  ): Promise<ResultOf<T>> {
    try {
      return await deps.db.transaction(async (tx) => {
        await repo.lockWorkspace(tx, stale.workspaceId);
        const session = sessions.get(stale) as SavedViewSession;
        const actor = await actorOf(session, tx);
        const result = await work(tx, await repo.standingsOf(tx, actor), actor);
        if (!result.ok) throw new Abort(result);
        return result;
      });
    } catch (error) {
      if (error instanceof Abort) return error.failure;
      throw error;
    }
  }

  const entryOf = (
    view: ViewRecord,
    actor: ActorContext,
    standings: Standings,
  ): SavedViewEntryJson => ({
    view: savedViewOf(view, actor, standings),
    capabilities: capabilitiesOf(view, actor, standings),
  });

  /**
   * Order matters: missing or unreachable → invalid; lacking the static entitlement (relation to the object or
   * the console grant, never its approval state) → forbidden; stale version → conflict; then the state-dependent
   * capability → forbidden. A concurrent loser who was entitled therefore gets `conflict`, and an unauthorized
   * actor never learns the version or state through it.
   */
  async function target(
    tx: Tx,
    actor: ActorContext,
    standings: Standings,
    id: string,
    expectedVersion: number,
    entitled: (view: ViewRecord) => boolean,
    allowed: (view: ViewRecord, caps: ReturnType<typeof capabilitiesOf>) => boolean = () => true,
  ): Promise<ResultOf<ViewRecord>> {
    const uuid = asUuid(id);
    const view = uuid ? await repo.viewById(tx, actor.workspaceId, uuid) : null;
    if (!view || !isReachable(view, actor, standings)) return fail('invalid', 'not-found');
    const caps = capabilitiesOf(view, actor, standings);
    if (!entitled(view)) return fail('forbidden', caps.reason);
    if (view.version !== expectedVersion) return fail('conflict');
    if (!allowed(view, caps)) return fail('forbidden', caps.reason);
    return ok(view);
  }

  async function record(
    tx: Tx,
    actor: ActorContext,
    eventType: Parameters<typeof audit.record>[1]['event_type'],
    subjectType: string,
    subjectId: string,
    summary: string,
    detail: Record<string, unknown>,
  ) {
    await audit.record(tx, {
      workspace_id: actor.workspaceId,
      actor_id: actor.id,
      event_type: eventType,
      subject_type: subjectType,
      subject_id: subjectId,
      summary,
      detail,
    });
  }

  /** The actor's default for a menu, only while the view is still reachable and of that menu. */
  async function usableDefault(
    tx: Tx,
    actor: ActorContext,
    standings: Standings,
    menuId: string | null,
  ): Promise<string | null> {
    const id = await repo.defaultOf(tx, actor, menuId);
    if (id === null) return null;
    const view = await repo.viewById(tx, actor.workspaceId, id);
    return view && isReachable(view, actor, standings) && view.menuId === menuId ? view.id : null;
  }

  // ---- views ----

  const list = (actor: ActorContext, menuId: string | null) =>
    menuId !== null && !isPgSafeString(menuId)
      ? Promise.resolve([] as SavedViewListItemJson[])
      : read(async (tx) => {
          const standings = await repo.standingsOf(tx, actor);
          const views = await repo.viewsOfMenu(tx, actor, menuId);
          return views
            .filter((v) => isReachable(v, actor, standings))
            .map((v): SavedViewListItemJson => entryOf(v, actor, standings));
        });

  const get = (actor: ActorContext, id: string) =>
    read(async (tx): Promise<SavedViewListItemJson | null> => {
      const uuid = asUuid(id);
      const view = uuid ? await repo.viewById(tx, actor.workspaceId, uuid) : null;
      if (!view) return null;
      const standings = await repo.standingsOf(tx, actor);
      return isReachable(view, actor, standings)
        ? entryOf(view, actor, standings)
        : { id: view.id, denied: true, reason: 'no-access' };
    });

  const save = (actor: ActorContext, draft: SavedViewDraftIn) =>
    write(actor, async (tx, standings, actor) => {
      if (!isPgSafeDeep(draft)) return fail('invalid', 'unicode');
      const id = await repo.insertView(tx, {
        workspaceId: actor.workspaceId,
        ownerId: actor.id,
        kind: draft.kind,
        menuId: draft.kind === 'menu-view' ? draft.menuId : null,
        name: draft.name.trim(),
        content: bodyOf(draft),
        now: now(),
      });
      const view = (await repo.viewById(tx, actor.workspaceId, id)) as ViewRecord;
      return ok(entryOf(view, actor, standings));
    });

  const update = (actor: ActorContext, cmd: CommandOf<'update'>) =>
    write(actor, async (tx, standings, actor) => {
      const t = await target(
        tx,
        actor,
        standings,
        cmd.id,
        cmd.expectedVersion,
        (view) => isOwnerOrManager(view, actor, standings),
        (view, caps) =>
          caps.canEdit || (view.ownerId === actor.id && view.visibilityKind === 'official'),
      );
      if (!t.ok) return t;
      const view = t.value;
      const { patch } = cmd;
      if (!isPgSafeDeep(patch)) return fail('invalid', 'unicode');
      if (
        view.kind === 'condition-set' &&
        ['menuSchemaVersion', 'page', 'chartOptions', 'layout', 'panels'].some((k) => k in patch)
      ) {
        return fail('invalid', 'a condition set has no page');
      }
      const shown = shownTo(view, actor);
      const { name: patchName, ...patchBody } = patch;
      const candidate = {
        schemaVersion: 1,
        kind: view.kind,
        name: patchName ?? shown.name,
        ...(view.kind === 'menu-view' ? { menuId: view.menuId } : {}),
        ...shown.content,
        ...patchBody,
      };
      const checked = savedViewDraftSchema.safeParse(candidate);
      if (!checked.success)
        return fail('invalid', checked.error.issues[0]?.message ?? 'invalid view');
      const name = checked.data.name.trim();
      const content = bodyOf(checked.data);
      if (
        canonicalJson({ name, content }) ===
        canonicalJson({ name: shown.name, content: shown.content })
      )
        return ok(entryOf(view, actor, standings));
      // A personal edit of an official copy is a separate pending change: readers keep the approved copy.
      const next: ViewRecord =
        view.visibilityKind === 'official'
          ? {
              ...view,
              pending: { name, content, approval: 'pending', note: null } satisfies Pending,
            }
          : { ...view, name, content };
      const written = await repo.writeView(tx, actor.workspaceId, next, now());
      // The new pending proposal is an application like `requestOfficial`: it is audited the same way, ids only.
      if (view.visibilityKind === 'official')
        await record(
          tx,
          actor,
          'saved_view_official_requested',
          'saved_view',
          view.id,
          'Official publication requested',
          { view_id: view.id, version: written.version },
        );
      return ok(entryOf(written, actor, standings));
    });

  const remove = (actor: ActorContext, id: string) =>
    write(actor, async (tx, standings, actor) => {
      const uuid = asUuid(id);
      const view = uuid ? await repo.viewById(tx, actor.workspaceId, uuid) : null;
      if (!view || !isReachable(view, actor, standings)) return fail('invalid', 'not-found');
      if (view.ownerId !== actor.id) return fail('forbidden');
      await repo.deleteView(tx, actor.workspaceId, view.id);
      return ok(null);
    });

  const setDefault = (actor: ActorContext, menuId: string | null, id: string | null) =>
    write(actor, async (tx, standings, actor) => {
      if (menuId !== null && !isPgSafeString(menuId)) return fail('invalid', 'menuId');
      if (id === null) {
        await repo.putDefault(tx, actor, menuId, null);
        return ok(null);
      }
      const uuid = asUuid(id);
      const view = uuid ? await repo.viewById(tx, actor.workspaceId, uuid) : null;
      if (!view || !isReachable(view, actor, standings) || view.menuId !== menuId)
        return fail('invalid', 'not-a-visible-view-of-this-menu');
      await repo.putDefault(tx, actor, menuId, view.id);
      return ok(null);
    });

  const getDefaultId = (actor: ActorContext, menuId: string | null) =>
    menuId !== null && !isPgSafeString(menuId)
      ? Promise.resolve(null)
      : read(async (tx) => usableDefault(tx, actor, await repo.standingsOf(tx, actor), menuId));

  const setVisibility = (actor: ActorContext, cmd: CommandOf<'setVisibility'>) =>
    write(actor, async (tx, standings, actor) => {
      const { visibility } = cmd;
      if (visibility.kind === 'official') return fail('invalid', 'use requestOfficial');
      const t = await target(
        tx,
        actor,
        standings,
        cmd.id,
        cmd.expectedVersion,
        (view) => isOwnerOrManager(view, actor, standings),
        (_v, caps) => caps.canShare,
      );
      if (!t.ok) return t;
      const view = t.value;
      let people: string[] = [];
      let groupIds: string[] = [];
      if (visibility.kind === 'people') {
        const ids = unique(visibility.userIds);
        if (ids.length > AUDIENCE_MAX) return fail('invalid', 'too-many-people');
        const uuids = ids.map(asUuid);
        if (uuids.some((u) => u === null)) return fail('invalid', 'unknown person');
        people = unique(uuids as string[]);
        if ((await repo.peopleByIds(tx, actor.workspaceId, people)).length !== people.length)
          return fail('invalid', 'unknown person');
      } else if (visibility.kind === 'groups') {
        const ids = unique(visibility.groupIds);
        if (ids.length > AUDIENCE_MAX) return fail('invalid', 'too-many-groups');
        const uuids = ids.map(asUuid);
        if (uuids.some((u) => u === null)) return fail('invalid', 'unknown group');
        groupIds = unique(uuids as string[]);
        const existing = await repo.existingGroupIds(tx, actor.workspaceId, groupIds);
        // A group the actor cannot see is "unknown": its existence is not revealed.
        const newlyShared = groupIds.filter((g) => !view.groupIds.includes(g));
        if (
          !groupIds.every((g) => existing.has(g)) ||
          !newlyShared.every((g) => actor.approver || standings.has(g))
        )
          return fail('invalid', 'unknown group');
      }
      const unchanged =
        view.visibilityKind === visibility.kind &&
        sameSet(view.people, people) &&
        sameSet(view.groupIds, groupIds);
      if (unchanged) return ok(entryOf(view, actor, standings));
      const written = await repo.writeView(
        tx,
        actor.workspaceId,
        { ...view, visibilityKind: visibility.kind },
        now(),
      );
      await repo.replaceAudience(tx, actor.workspaceId, view.id, people, groupIds);
      const reach =
        visibility.kind === 'groups'
          ? (await repo.groupsOf(tx, actor.workspaceId))
              .filter((g) => groupIds.includes(g.id))
              .flatMap((g) => [...g.members.map((m) => m.id), ...g.managerIds])
          : people;
      await repo.dropDefaultsExcept(tx, actor.workspaceId, view.id, [view.ownerId, ...reach]);
      await record(
        tx,
        actor,
        'saved_view_visibility_changed',
        'saved_view',
        view.id,
        'Saved view sharing changed',
        {
          view_id: view.id,
          version: written.version,
          visibility: visibility.kind,
          target_count: people.length + groupIds.length,
        },
      );
      return ok(
        entryOf(
          (await repo.viewById(tx, actor.workspaceId, view.id)) as ViewRecord,
          actor,
          standings,
        ),
      );
    });

  const requestOfficial = (actor: ActorContext, cmd: CommandOf<'requestOfficial'>) =>
    write(actor, async (tx, standings, actor) => {
      const t = await target(
        tx,
        actor,
        standings,
        cmd.id,
        cmd.expectedVersion,
        (view) => view.ownerId === actor.id,
      );
      if (!t.ok) return t;
      const view = t.value;
      if (!canTransition(shownTo(view, actor).approval, 'request'))
        return fail('invalid', 'approval-state');
      const next: ViewRecord = view.pending
        ? { ...view, pending: { ...view.pending, approval: 'pending', note: null } }
        : { ...view, approval: 'pending', approvalNote: null };
      const written = await repo.writeView(tx, actor.workspaceId, next, now());
      await record(
        tx,
        actor,
        'saved_view_official_requested',
        'saved_view',
        view.id,
        'Official publication requested',
        { view_id: view.id, version: written.version },
      );
      return ok(entryOf(written, actor, standings));
    });

  const decide = (actor: ActorContext, cmd: CommandOf<'decide'>) =>
    write(actor, async (tx, standings, actor) => {
      const note = cmd.note?.trim() || null;
      if (note !== null && (note.length > NOTE_MAX || !isPgSafeString(note)))
        return fail('invalid', 'note');
      const t = await target(
        tx,
        actor,
        standings,
        cmd.id,
        cmd.expectedVersion,
        () => actor.approver,
      );
      if (!t.ok) return t;
      const view = t.value;
      const action = cmd.decision === 'approve' ? 'approve' : 'reject';
      if (!canTransition(shownTo(view, actor).approval, action))
        return fail('invalid', 'approval-state');
      let next: ViewRecord;
      if (cmd.decision === 'approve') {
        const source = view.pending ?? { name: view.name, content: view.content };
        next = {
          ...view,
          name: source.name,
          content: source.content,
          approval: 'approved',
          approvalNote: note,
          visibilityKind: 'official',
          pending: null,
        };
      } else if (view.pending) {
        // A rejected change never reaches readers: the approved copy stays and only the proposal carries the rejection.
        next = { ...view, pending: { ...view.pending, approval: 'rejected', note } };
      } else {
        next = { ...view, approval: 'rejected', approvalNote: note };
      }
      const written = await repo.writeView(tx, actor.workspaceId, next, now());
      if (cmd.decision === 'approve')
        await repo.replaceAudience(tx, actor.workspaceId, view.id, [], []);
      await record(
        tx,
        actor,
        cmd.decision === 'approve'
          ? 'saved_view_official_approved'
          : 'saved_view_official_rejected',
        'saved_view',
        view.id,
        `Official publication ${cmd.decision === 'approve' ? 'approved' : 'rejected'}`,
        { view_id: view.id, version: written.version },
      );
      return ok(
        entryOf(
          (await repo.viewById(tx, actor.workspaceId, view.id)) as ViewRecord,
          actor,
          standings,
        ),
      );
    });

  const revoke = (actor: ActorContext, cmd: CommandOf<'revoke'>) =>
    write(actor, async (tx, standings, actor) => {
      const t = await target(
        tx,
        actor,
        standings,
        cmd.id,
        cmd.expectedVersion,
        () => actor.approver,
      );
      if (!t.ok) return t;
      const view = t.value;
      if (view.visibilityKind !== 'official' || !canTransition(view.approval, 'revoke'))
        return fail('invalid', 'approval-state');
      const written = await repo.writeView(
        tx,
        actor.workspaceId,
        {
          ...view,
          visibilityKind: 'private',
          approval: 'none',
          approvalNote: REVOKE_NOTE,
          pending: null,
        },
        now(),
      );
      await repo.dropDefaultsExcept(tx, actor.workspaceId, view.id, [view.ownerId]);
      await record(
        tx,
        actor,
        'saved_view_official_revoked',
        'saved_view',
        view.id,
        'Official publication revoked',
        { view_id: view.id, version: written.version },
      );
      return ok(entryOf(written, actor, standings));
    });

  const listApprovalRequests = (actor: ActorContext, menuId: string | null) =>
    menuId !== null && !isPgSafeString(menuId)
      ? Promise.resolve([])
      : read(async (tx) => {
          const standings = await repo.standingsOf(tx, actor);
          const views = await repo.viewsOfMenu(tx, actor, menuId);
          return views.flatMap((view) => {
            const proposal = view.pending ?? { approval: view.approval, note: view.approvalNote };
            if (proposal.approval !== 'pending' && proposal.approval !== 'rejected') return [];
            if (!isReachable(view, actor, standings)) return [];
            const caps = capabilitiesOf(view, actor, standings);
            if (!(view.ownerId === actor.id || caps.canApprove || caps.canRevoke)) return [];
            return [
              {
                viewId: view.id,
                requestedBy: view.ownerId,
                requestedAt: view.updatedAt,
                targetVersion: view.version,
                changes: proposalChanges(view),
                ...(proposal.approval === 'rejected' && proposal.note
                  ? { rejectReason: proposal.note }
                  : {}),
              },
            ];
          });
        });

  // ---- groups (custom only; org-team sharing is not implemented, ADR-0099) ----

  const groupEntry = (group: repo.GroupRecord, actor: ActorContext) => {
    const manager = group.managerIds.includes(actor.id);
    const member = group.members.some((m) => m.id === actor.id);
    const mutable = actor.approver || manager;
    return {
      canView: actor.approver || member || manager,
      entry: {
        group: {
          id: group.id,
          kind: 'custom' as const,
          name: group.name,
          memberCount: group.members.length,
          ...(group.managerIds.length > 0 ? { managerIds: group.managerIds } : {}),
        },
        members: group.members.map((m) => ({
          userId: m.id,
          displayName: m.displayName,
          affiliation: '',
        })),
        capabilities: {
          canView: actor.approver || member || manager,
          canEditMembers: mutable,
          canRename: mutable,
          canDelete: mutable,
        },
      },
    };
  };

  const listGroups = (actor: ActorContext) =>
    read(async (tx) =>
      (await repo.groupsOf(tx, actor.workspaceId))
        .map((g) => groupEntry(g, actor))
        .filter((g) => g.canView)
        .map((g) => g.entry),
    );

  const createGroup = (actor: ActorContext, cmd: CommandOf<'createGroup'>) =>
    write(actor, async (tx, _standings, actor) => {
      const name = cmd.name.trim();
      if (!name || name.length > NAME_MAX || !isPgSafeString(name)) return fail('invalid', 'name');
      const ids = unique(cmd.memberIds);
      if (ids.length > GROUP_MEMBERS_MAX) return fail('invalid', 'too-many-members');
      const uuids = ids.map(asUuid);
      if (uuids.some((u) => u === null)) return fail('invalid', 'unknown person');
      const memberIds = unique(uuids as string[]);
      if ((await repo.peopleByIds(tx, actor.workspaceId, memberIds)).length !== memberIds.length)
        return fail('invalid', 'unknown person');
      // Creating a group changes no view's visibility; sharing a view to it is a separate call.
      const id = await repo.insertGroup(tx, {
        workspaceId: actor.workspaceId,
        name,
        createdBy: actor.id,
        memberIds,
      });
      await record(
        tx,
        actor,
        'saved_view_group_created',
        'saved_view_group',
        id,
        'Saved view group created',
        { group_id: id, member_count: memberIds.length },
      );
      return ok(
        groupEntry((await repo.groupById(tx, actor.workspaceId, id)) as repo.GroupRecord, actor)
          .entry,
      );
    });

  const updateGroup = (actor: ActorContext, cmd: CommandOf<'updateGroup'>) =>
    write(actor, async (tx, _standings, actor) => {
      const gid = asUuid(cmd.id);
      const group = gid ? await repo.groupById(tx, actor.workspaceId, gid) : null;
      const view = group ? groupEntry(group, actor) : null;
      if (!group || !view?.canView) return fail('invalid', 'not-found');
      const { patch } = cmd;
      const add = unique(patch.addMembers ?? []);
      const remove = unique(patch.removeMembers ?? []);
      const editsMembers = add.length + remove.length > 0;
      if ((editsMembers || patch.name !== undefined) && !view.entry.capabilities.canEditMembers)
        return fail('forbidden');
      const name = patch.name === undefined ? group.name : patch.name.trim();
      if (!name || name.length > NAME_MAX || !isPgSafeString(name)) return fail('invalid', 'name');
      if (add.length > GROUP_MEMBERS_MAX) return fail('invalid', 'too-many-members');
      const addIds = add.map(asUuid);
      if (addIds.some((u) => u === null)) return fail('invalid', 'unknown person');
      const added = unique(addIds as string[]);
      // Unknown or non-uuid removals are simply not members.
      const removed = unique(remove.map(asUuid).filter((u): u is string => u !== null));
      const memberIds = group.members.map((m) => m.id);
      // Remove first, then add: a plain member named in both stays untouched (a manager would lose the role).
      const keeps = (id: string) =>
        added.includes(id) && memberIds.includes(id) && !group.managerIds.includes(id);
      const removedEffective = removed.filter(
        (id) => (memberIds.includes(id) || group.managerIds.includes(id)) && !keeps(id),
      );
      if (group.managerIds.length > 0 && group.managerIds.every((m) => removed.includes(m)))
        return fail('invalid', 'last-manager');
      const addedEffective = added.filter(
        (id) => !memberIds.includes(id) || removedEffective.includes(id),
      );
      const finalMembers = unique([
        ...memberIds.filter((id) => !removedEffective.includes(id)),
        ...addedEffective,
      ]);
      if (finalMembers.length > GROUP_MEMBERS_MAX) return fail('invalid', 'too-many-members');
      if ((await repo.peopleByIds(tx, actor.workspaceId, added)).length !== added.length)
        return fail('invalid', 'unknown person');
      const renamed = name !== group.name;
      if (removedEffective.length === 0 && addedEffective.length === 0 && !renamed)
        return ok(view.entry);
      if (renamed) await repo.renameGroup(tx, actor.workspaceId, group.id, name);
      await repo.removeFromGroup(tx, group.id, removedEffective);
      await repo.addToGroup(tx, group.id, addedEffective);
      await record(
        tx,
        actor,
        'saved_view_group_updated',
        'saved_view_group',
        group.id,
        'Saved view group updated',
        {
          group_id: group.id,
          added_ids: addedEffective,
          removed_ids: removedEffective,
          renamed,
        },
      );
      return ok(
        groupEntry(
          (await repo.groupById(tx, actor.workspaceId, group.id)) as repo.GroupRecord,
          actor,
        ).entry,
      );
    });

  // ---- people ----

  const asMember = (p: repo.PersonRow) => ({
    userId: p.id,
    displayName: p.displayName,
    affiliation: '',
  });

  /** Same directory as `lookupPeople`; an exact id hit is always kept, whatever the result cap. */
  const searchPeople = (actor: ActorContext, rawQuery: string) =>
    read(async (tx) => {
      const query = rawQuery.trim().slice(0, QUERY_MAX);
      if (!query || !isPgSafeString(query)) return [];
      const exactId = asUuid(query);
      const exact = exactId ? await repo.peopleByIds(tx, actor.workspaceId, [exactId]) : [];
      const named = await repo.searchPeopleByName(tx, actor.workspaceId, query, SEARCH_MAX);
      const seen = new Set(exact.map((p) => p.id));
      return [...exact, ...named.filter((p) => !seen.has(p.id))].map(asMember);
    });

  /** Exact opaque ids (`POST /people/lookup`): a non-uuid or unknown id is simply omitted. */
  const lookupPeople = (actor: ActorContext, ids: readonly string[]) =>
    read(async (tx) => {
      const uuids = unique(ids.flatMap((id) => asUuid(id) ?? []));
      return (await repo.peopleByIds(tx, actor.workspaceId, uuids)).map(asMember);
    });

  // ---- one-time browser import ----

  const importLocal = (actor: ActorContext, cmd: CommandOf<'importLocal'>) =>
    // The token reaches SQL as text: a value PostgreSQL cannot store is a normal `invalid`, before any statement.
    !isPgSafeString(cmd.importToken)
      ? Promise.resolve(fail('invalid', 'unicode'))
      : write<ImportOutcomeJson>(actor, async (tx, standings, actor) => {
          const results: ImportOutcomeJson['results'] = [];
          const committed = new Map<string, string>();
          const created: string[] = [];
          let already = 0;
          for (const row of cmd.rows) {
            if (!isPgSafeString(row.legacyKey)) {
              results.push({
                legacyKey: row.legacyKey,
                status: 'rejected',
                reason: 'invalid',
                detail: 'unicode',
              });
              continue;
            }
            const hash = hashOf(row.draft);
            const prior = await repo.importRowOf(tx, actor, cmd.importToken, row.legacyKey);
            if (prior) {
              if (prior.contentHash !== hash) {
                results.push({
                  legacyKey: row.legacyKey,
                  status: 'rejected',
                  reason: 'invalid',
                  detail: 'import-token-reuse',
                });
                continue;
              }
              already += 1;
              committed.set(row.legacyKey, prior.viewId);
              results.push({
                legacyKey: row.legacyKey,
                status: 'already_imported',
                id: prior.viewId,
              });
              continue;
            }
            if (!isPgSafeDeep(row.draft)) {
              results.push({
                legacyKey: row.legacyKey,
                status: 'rejected',
                reason: 'invalid',
                detail: 'unicode',
              });
              continue;
            }
            try {
              // A savepoint per row: one row failing rolls back only itself.
              const id = await tx.transaction(async (sp) => {
                const viewId = await repo.insertView(sp, {
                  workspaceId: actor.workspaceId,
                  ownerId: actor.id,
                  kind: row.draft.kind,
                  menuId: row.draft.kind === 'menu-view' ? row.draft.menuId : null,
                  name: row.draft.name.trim(),
                  content: bodyOf(row.draft),
                  now: now(),
                });
                await repo.insertImportRow(sp, actor, cmd.importToken, row.legacyKey, hash, viewId);
                return viewId;
              });
              created.push(id);
              committed.set(row.legacyKey, id);
              results.push({ legacyKey: row.legacyKey, status: 'imported', id });
            } catch {
              results.push({ legacyKey: row.legacyKey, status: 'rejected', reason: 'unavailable' });
            }
          }
          const defaults: ImportOutcomeJson['defaults'] = [];
          for (const d of cmd.defaults) {
            const viewId = committed.get(d.legacyKey);
            const menuId = d.key.menuId;
            if (!viewId || (menuId !== null && !isPgSafeString(menuId))) continue;
            const view = await repo.viewById(tx, actor.workspaceId, viewId);
            if (!view || view.ownerId !== actor.id || view.menuId !== menuId) continue;
            const current = await usableDefault(tx, actor, standings, menuId);
            if (current === null) {
              await repo.putDefault(tx, actor, menuId, view.id);
            } else if (current !== view.id) {
              continue; // a server default that already works is never overwritten
            }
            defaults.push({ key: { menuId }, legacyKey: d.legacyKey, id: view.id });
          }
          if (created.length > 0) {
            await record(
              tx,
              actor,
              'saved_view_import_submitted',
              'saved_view',
              created[0] as string,
              'Browser saved views imported',
              {
                imported: created.length,
                already_imported: already,
                rejected: results.filter((r) => r.status === 'rejected').length,
                view_ids: created,
              },
            );
          }
          return ok({ results, defaults });
        });

  /** Runs one parsed command for the session's actor. The response is exactly the port's return shape. */
  async function execute(session: SavedViewSession, cmd: SavedViewCommandIn): Promise<unknown> {
    const actor = await actorOf(session);
    switch (cmd.op) {
      case 'list':
        return list(actor, cmd.key.menuId);
      case 'get':
        return get(actor, cmd.id);
      case 'save':
        return save(actor, cmd.draft);
      case 'update':
        return update(actor, cmd);
      case 'remove':
        return remove(actor, cmd.id);
      case 'setDefault':
        return setDefault(actor, cmd.key.menuId, cmd.id);
      case 'getDefaultId':
        return getDefaultId(actor, cmd.key.menuId);
      case 'setVisibility':
        return setVisibility(actor, cmd);
      case 'requestOfficial':
        return requestOfficial(actor, cmd);
      case 'decide':
        return decide(actor, cmd);
      case 'revoke':
        return revoke(actor, cmd);
      case 'listApprovalRequests':
        return listApprovalRequests(actor, cmd.key.menuId);
      case 'listGroups':
        return listGroups(actor);
      case 'createGroup':
        return createGroup(actor, cmd);
      case 'updateGroup':
        return updateGroup(actor, cmd);
      case 'searchPeople':
        return searchPeople(actor, cmd.query);
      case 'importLocal':
        return importLocal(actor, cmd);
    }
  }

  async function lookup(session: SavedViewSession, ids: readonly string[]) {
    return lookupPeople(await actorOf(session), ids);
  }

  return { execute, lookup };
}

export type SavedViewService = ReturnType<typeof createSavedViewService>;
