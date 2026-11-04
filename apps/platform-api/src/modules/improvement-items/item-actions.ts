// The improvement item write actions (#1328 b, design docs/design/features/improvement-items.md §1/§3, ADR-0106
// amendment 2): create, update, set status, reopen, assign, link Quest. Right: `improvement.manage` (workspace-scoped;
// Admin passes through the module bypass, a User role is refused by the supported-scope policy). Rules: the workspace
// is the actor's; every write is one transaction holding the row change, the `item_event` rows and the audit row;
// every change bumps `row_version`; a save that changes nothing answers `ok` with the current version and writes no
// event. No improvement status is sealed (each has a legal exit), so `currentVersion` is the plain row version and
// every status-dependent refusal is a `MenuActionInvalidError` thrown from `handle` after the lock.
// Not here: notifications (node e), the Quest port (node c), bulk edit (node f).

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import {
  ITEM_INPUT_KEYS,
  type ItemInput,
  type ItemOp,
  type OriginInput,
  type TargetInput,
  parseItemInput,
  validateItemInput,
} from './domain/item-input.js';
import { IMPROVEMENT_ITEMS_MENU_ID } from './menu.js';
import { allocateImprovementItemNo } from './repositories/item-number.js';
import {
  type ItemPatch,
  type ItemWriteRow,
  type TargetSnapshot,
  actorInWorkspace,
  insertEvent,
  insertItem,
  insertTargets,
  lockItem,
  mapViolations,
  patchItem,
  replaceTargets,
  settleOriginOrTarget,
  targetsOfItem,
} from './repositories/item-write.js';

export const IMPROVEMENT_PERMISSION = 'improvement.manage';
/** The menu permission the six actions declare: bootstrap lists it exactly for the users `IMPROVEMENT_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const IMPROVEMENT_MENU_PERMISSION = 'improvement:manage';

/** The three reads of the same menu (node a) that show what a write changes. */
const INVALIDATES = ['improvement.items', 'improvement.itemDetail', 'improvement.itemEvents'] as const;

export interface ItemActionDeps {
  checkService: CheckService;
}

type AuditType = 'created' | 'updated' | 'status_changed' | 'assigned' | 'quest_linked' | 'reopened';
type Status = 'open' | 'in_progress' | 'done' | 'verified' | 'dropped';

/** The forward moves of `itemSetStatus`; `* → dropped` is added from every status but `dropped`. */
const FORWARD: Readonly<Record<string, readonly Status[]>> = {
  open: ['in_progress', 'dropped'],
  in_progress: ['done', 'dropped'],
  done: ['verified', 'dropped'],
  verified: ['dropped'],
  dropped: [],
};
/** The pairs only `itemReopen` takes: `done → in_progress`, `verified → done`, `dropped → open`. */
const REOPEN: Readonly<Record<string, Status>> = { done: 'in_progress', verified: 'done', dropped: 'open' };

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const blank = (v: string | null | undefined): boolean => v === null || v === undefined || v.trim() === '';

/** The cumulative rules of the 0093 CHECKs, reported as field errors before a CHECK can fire. */
function cumulativeErrors(
  status: string,
  v: { action: string | null; actionDate: string | null; effectResult: string | null; dropReason: string | null },
): FieldError[] {
  const errors: FieldError[] = [];
  if (['in_progress', 'done', 'verified'].includes(status) && blank(v.action)) errors.push({ path: ['action'], code: 'required' });
  if (['done', 'verified'].includes(status) && v.actionDate === null) errors.push({ path: ['actionDate'], code: 'required' });
  if (status === 'verified' && v.effectResult === null) errors.push({ path: ['effect'], code: 'required' });
  if (status === 'dropped' && blank(v.dropReason)) errors.push({ path: ['reason'], code: 'required' });
  return errors;
}

const sameTargets = (a: readonly TargetSnapshot[], b: readonly TargetSnapshot[]): boolean => {
  const key = (x: TargetSnapshot) => JSON.stringify([x.kind, x.externalKey, x.displayName]);
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.length === right.length && left.every((k, n) => k === right[n]);
};
const sortedTargets = (targets: readonly TargetInput[]): TargetSnapshot[] =>
  targets.map((x) => ({ kind: x.kind, externalKey: x.externalKey, displayName: x.displayName }));

const originOf = (row: ItemWriteRow): OriginInput | null =>
  row.originMenuId === null ? null : { menuId: row.originMenuId, context: (row.originContext ?? {}) as Record<string, unknown> };
const sameOrigin = (a: OriginInput | null, b: OriginInput | null): boolean => JSON.stringify(a) === JSON.stringify(b);

export function itemActions(deps: ItemActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      IMPROVEMENT_PERMISSION,
      await deps.checkService.checkCapability(actor, IMPROVEMENT_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: AuditType,
    item: { id: string; itemNo: number },
    detail: Record<string, unknown>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `improvement.item.${type}`,
      subject_type: 'improvement_item',
      subject_id: item.id,
      summary: `IM-${item.itemNo} ${type}`,
      detail: { itemNo: item.itemNo, ...detail },
    });

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends ItemOp>(op: Op, input: Record<string, unknown>): ItemInput<Op> {
    const result = parseItemInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  /** Locks the item row; its row version is the concurrency token. `null` = missing or another workspace's. */
  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockItem(tx, actor.workspace_id, input.itemId as string);
    return row ? String(row.rowVersion) : null;
  };

  async function lockExisting(tx: Tx, actor: PlatformActor, itemId: string, action: string): Promise<ItemWriteRow> {
    const row = await lockItem(tx, actor.workspace_id, itemId);
    if (!row) throw new Error(`action ${action}: currentVersion judged not_found first`);
    return row;
  }

  const base = (op: ItemOp, concurrency: 'none' | 'version') => ({
    id: `improvement.${op}`,
    menuId: IMPROVEMENT_ITEMS_MENU_ID,
    inputKeys: ITEM_INPUT_KEYS[op],
    permission: IMPROVEMENT_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const done = (version: number): ActionHandlerResult => ({ data: { version: String(version) }, version: String(version) });

  // ---- create -------------------------------------------------------------------------------------------------
  const itemCreate: MenuActionDeclaration = {
    spec: base('itemCreate', 'none'),
    authorize,
    validate(input) {
      const errors = validateItemInput('itemCreate', input);
      if (errors.length > 0) return errors;
      // Q2 (design §1): an item names where it came from or what it concerns. DB-free, so judged before the lock.
      const value = parsed('itemCreate', input);
      return value.origin || (value.targets?.length ?? 0) > 0 ? [] : [{ path: ['origin'], code: 'required_or_target' }];
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemCreate', input);
      // The number is allocated first; a refusal below rolls the whole transaction (counter included) back.
      const itemNo = await allocateImprovementItemNo(tx, ws);
      if (value.assigneeId && !(await actorInWorkspace(tx, ws, value.assigneeId))) {
        throw invalid({ path: ['assigneeId'], code: 'not_found' });
      }
      const targets = sortedTargets(value.targets ?? []);
      const item = await mapViolations(
        async () => {
          const row = await insertItem(tx, {
            workspaceId: ws,
            actorId: actor.actor_id,
            itemNo,
            problem: value.problem,
            action: value.action ?? null,
            actionDate: value.actionDate ?? null,
            assigneeId: value.assigneeId ?? null,
            questId: value.questId ?? null,
            questTitle: value.questTitle ?? null,
            origin: value.origin ?? null,
          });
          await insertTargets(tx, ws, row.id, targets);
          await settleOriginOrTarget(tx);
          return row;
        },
        (error) => invalid(error),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        itemId: item.id,
        actorId: actor.actor_id,
        eventType: 'created',
        changes: {
          before: {},
          after: {
            problem: item.problem,
            action: item.action,
            actionDate: item.actionDate,
            assigneeId: item.assigneeId,
            questId: item.questId,
            origin: originOf(item),
            targets,
          },
        },
      });
      await record(tx, actor, 'created', item, {
        hasOrigin: item.originMenuId !== null,
        targetCount: targets.length,
        assigned: item.assigneeId !== null,
        questLinked: item.questId !== null,
      });
      return {
        data: { itemId: item.id, itemNo: item.itemNo, version: String(item.rowVersion) },
        version: null,
      };
    },
  };

  // ---- update -------------------------------------------------------------------------------------------------
  const itemUpdate: MenuActionDeclaration = {
    spec: base('itemUpdate', 'version'),
    authorize,
    validate: (input) => validateItemInput('itemUpdate', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemUpdate', input);
      const row = await lockExisting(tx, actor, value.itemId, 'itemUpdate');
      const currentTargets = await targetsOfItem(tx, ws, row.id);

      const next = {
        problem: value.problem ?? row.problem,
        action: value.action === undefined ? row.action : value.action,
        actionDate: value.actionDate === undefined ? row.actionDate : value.actionDate,
        origin: value.origin === undefined ? originOf(row) : value.origin,
        targets: value.targets === undefined ? currentTargets : sortedTargets(value.targets).sort((a, b) => (a.kind + a.externalKey < b.kind + b.externalKey ? -1 : 1)),
      };
      // Cumulative rules and Q2, reported as field errors before any SQL CHECK can fire.
      const errors = cumulativeErrors(row.status, {
        action: next.action,
        actionDate: next.actionDate,
        effectResult: row.effectResult,
        dropReason: row.dropReason,
      }).filter((e) => e.path[0] === 'action' || e.path[0] === 'actionDate');
      if (next.origin === null && next.targets.length === 0) errors.push({ path: ['origin'], code: 'required_or_target' });
      if (errors.length > 0) throw new MenuActionInvalidError(errors);

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const patch: ItemPatch = {};
      if (next.problem !== row.problem) {
        patch.problem = next.problem;
        before.problem = row.problem;
        after.problem = next.problem;
      }
      if (next.action !== row.action) {
        patch.action = next.action;
        before.action = row.action;
        after.action = next.action;
      }
      if (next.actionDate !== row.actionDate) {
        patch.actionDate = next.actionDate;
        before.actionDate = row.actionDate;
        after.actionDate = next.actionDate;
      }
      if (!sameOrigin(next.origin, originOf(row))) {
        patch.originMenuId = next.origin?.menuId ?? null;
        patch.originContext = next.origin?.context ?? null;
        before.origin = originOf(row);
        after.origin = next.origin;
      }
      const targetsChanged = !sameTargets(next.targets, currentTargets);
      if (targetsChanged) {
        before.targets = currentTargets;
        after.targets = next.targets;
      }
      const changed = Object.keys(after);
      // Nothing changed: ok with the current version, no event, no bump.
      if (changed.length === 0) return done(row.rowVersion);

      const version = await mapViolations(
        async () => {
          const v = await patchItem(tx, ws, row.id, actor.actor_id, patch);
          if (targetsChanged) await replaceTargets(tx, ws, row.id, next.targets);
          await settleOriginOrTarget(tx);
          return v;
        },
        (error) => invalid(error),
      );
      await insertEvent(tx, { workspaceId: ws, itemId: row.id, actorId: actor.actor_id, eventType: 'updated', changes: { before, after } });
      await record(tx, actor, 'updated', row, { changed, targetCount: next.targets.length });
      return done(version);
    },
  };

  // ---- set status ---------------------------------------------------------------------------------------------
  const itemSetStatus: MenuActionDeclaration = {
    spec: base('itemSetStatus', 'version'),
    authorize,
    validate: (input) => validateItemInput('itemSetStatus', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemSetStatus', input);
      const row = await lockExisting(tx, actor, value.itemId, 'itemSetStatus');
      const from = row.status;
      const to = value.status;
      // The reopen pairs (`done → in_progress` …) and a repeat of the current status are illegal here, the same
      // answer whatever version the caller holds: a conflict replay lands on `invalid`, never on `conflict` again.
      if (!(FORWARD[from] ?? []).includes(to)) throw invalid({ path: ['status'], code: 'illegal_transition' });

      const applicable = {
        action: to === 'in_progress' || to === 'done',
        actionDate: to === 'done',
        effect: to === 'verified',
        reason: to === 'dropped',
      };
      const stray: FieldError[] = (['action', 'actionDate', 'effect', 'reason'] as const)
        .filter((k) => value[k] !== undefined && !applicable[k])
        .map((k) => ({ path: [k], code: 'not_applicable' }));
      if (stray.length > 0) throw new MenuActionInvalidError(stray);

      const action = value.action === undefined ? row.action : value.action;
      const actionDate = value.actionDate === undefined ? row.actionDate : value.actionDate;
      const effect = to === 'verified' ? (value.effect ?? null) : null;
      const dropReason = to === 'dropped' ? (value.reason ?? null) : row.dropReason;
      const errors = cumulativeErrors(to, {
        action,
        actionDate,
        effectResult: effect?.result ?? row.effectResult,
        dropReason,
      }).filter((e) => (to === 'verified' ? true : e.path[0] !== 'effect'));
      // `verified` always carries a fresh effect: a stale one from before a reopen does not count.
      if (to === 'verified' && effect === null && !errors.some((e) => e.path[0] === 'effect')) {
        errors.push({ path: ['effect'], code: 'required' });
      }
      if (errors.length > 0) throw new MenuActionInvalidError(errors);

      const patch: ItemPatch = { status: to };
      const before: Record<string, unknown> = { status: from };
      const after: Record<string, unknown> = { status: to };
      if (action !== row.action) {
        patch.action = action;
        before.action = row.action;
        after.action = action;
      }
      if (actionDate !== row.actionDate) {
        patch.actionDate = actionDate;
        before.actionDate = row.actionDate;
        after.actionDate = actionDate;
      }
      if (effect) {
        patch.effectResult = effect.result;
        patch.effectNote = effect.note;
        patch.effectCompareLink = effect.compareLink;
        before.effect = { result: row.effectResult, note: row.effectNote, compareLink: row.effectCompareLink };
        after.effect = { result: effect.result, note: effect.note, compareLink: effect.compareLink };
      }
      if (to === 'dropped') patch.dropReason = dropReason;

      const version = await mapViolations(
        () => patchItem(tx, ws, row.id, actor.actor_id, patch),
        (error) => invalid(error),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        itemId: row.id,
        actorId: actor.actor_id,
        eventType: 'status_changed',
        changes: { before, after },
        reason: to === 'dropped' ? dropReason : null,
      });
      await record(tx, actor, 'status_changed', row, { from, to });
      return done(version);
    },
  };

  // ---- reopen -------------------------------------------------------------------------------------------------
  const itemReopen: MenuActionDeclaration = {
    spec: base('itemReopen', 'version'),
    authorize,
    validate: (input) => validateItemInput('itemReopen', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemReopen', input);
      const row = await lockExisting(tx, actor, value.itemId, 'itemReopen');
      const from = row.status;
      const to = REOPEN[from];
      if (to === undefined) throw invalid({ path: ['status'], code: 'illegal_transition' });
      // `effect_*` and `drop_reason` stay as they are: the history lives in `item_event`.
      const version = await mapViolations(
        () => patchItem(tx, ws, row.id, actor.actor_id, { status: to }),
        (error) => invalid(error),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        itemId: row.id,
        actorId: actor.actor_id,
        eventType: 'reopened',
        changes: { before: { status: from }, after: { status: to } },
        reason: value.reason,
      });
      await record(tx, actor, 'reopened', row, { from, to });
      return done(version);
    },
  };

  // ---- assign -------------------------------------------------------------------------------------------------
  const itemAssign: MenuActionDeclaration = {
    spec: base('itemAssign', 'version'),
    authorize,
    validate: (input) => validateItemInput('itemAssign', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemAssign', input);
      const row = await lockExisting(tx, actor, value.itemId, 'itemAssign');
      if (value.assigneeId !== null && !(await actorInWorkspace(tx, ws, value.assigneeId))) {
        throw invalid({ path: ['assigneeId'], code: 'not_found' });
      }
      if (value.assigneeId === row.assigneeId) return done(row.rowVersion);
      const version = await patchItem(tx, ws, row.id, actor.actor_id, { assigneeId: value.assigneeId });
      await insertEvent(tx, {
        workspaceId: ws,
        itemId: row.id,
        actorId: actor.actor_id,
        eventType: 'assigned',
        changes: { before: { assigneeId: row.assigneeId }, after: { assigneeId: value.assigneeId } },
      });
      await record(tx, actor, 'assigned', row, { assigneeId: value.assigneeId, previousAssigneeId: row.assigneeId });
      return done(version);
    },
  };

  // ---- link Quest ---------------------------------------------------------------------------------------------
  const itemLinkQuest: MenuActionDeclaration = {
    spec: base('itemLinkQuest', 'version'),
    authorize,
    validate: (input) => validateItemInput('itemLinkQuest', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('itemLinkQuest', input);
      const row = await lockExisting(tx, actor, value.itemId, 'itemLinkQuest');
      if (value.questId === row.questId && value.questTitle === row.questTitleSnapshot) return done(row.rowVersion);
      const version = await mapViolations(
        () => patchItem(tx, ws, row.id, actor.actor_id, { questId: value.questId, questTitleSnapshot: value.questTitle }),
        (error) => invalid(error),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        itemId: row.id,
        actorId: actor.actor_id,
        eventType: 'quest_linked',
        changes: {
          before: { questId: row.questId, questTitle: row.questTitleSnapshot },
          after: { questId: value.questId, questTitle: value.questTitle },
        },
      });
      await record(tx, actor, 'quest_linked', row, { questId: value.questId, previousQuestId: row.questId });
      return done(version);
    },
  };

  return [itemCreate, itemUpdate, itemSetStatus, itemReopen, itemAssign, itemLinkQuest];
}
