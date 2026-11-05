// The knowledge item write actions of the log knowledge hub (#1197 w, ADR-0109): create, revise, assess, derive and
// set-archived. Right: `knowledge.item.publish` (workspace-scoped; Admin passes through the module bypass, a bare
// capability check refuses Admin). Rules: the workspace is the actor's and so is every id a write references; the
// owner of an item never changes; revisions, evidence, assessment events and links are only inserted; an archived
// item takes no revision or assessment; every successful write bumps `row_version` (create/derive start at 1) and
// writes its audit row in the same transaction. A refusal only the database can judge is a
// `MenuActionInvalidError` (field errors, never a 500). SetArchived to the value an item already has changes
// nothing and answers `ok` with the current version.

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
import { LOG_KNOWLEDGE_ITEMS_MENU_ID } from './catalog-menu.js';
import { type ItemInput, parseItemInput, validateItemInput } from './domain/item-input.js';
import {
  carrySubjects,
  insertSubjects,
  judgeSubjects,
  ownerModelOf,
  softwareModelId,
} from './repositories/item-subject.js';
import {
  type ItemRow,
  appendAssessment,
  appendRevision,
  checkOwner,
  insertDerivedLink,
  insertItem,
  itemExists,
  latestTitle,
  lockItem,
  revisionExists,
  setPublicationState,
} from './repositories/item-write.js';

export const ITEM_PERMISSION = 'knowledge.item.publish';
/** The menu permission the five actions declare (and the menu manifest uses): bootstrap lists it exactly for the users `ITEM_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const ITEM_MENU_PERMISSION = 'knowledge:item-publish';

/**
 * Read endpoints (same menu) that show what an item write changes. The model-side counts (`exploreModels`,
 * `modelProfile`) belong to the models menu, and the engine invalidates only within an action's own menu: an
 * accepted limit (api/log-knowledge.md, backlog).
 */
const INVALIDATES = ['logKnowledge.items', 'logKnowledge.itemDetail'] as const;

const ownerFields = ['ownerModelId', 'ownerSoftwareId'] as const;
const contentKeys = ['typeCode', 'title', 'observation', 'expected', 'analysisOpinion', 'improvement'] as const;

const INPUT_KEYS = {
  create: [...ownerFields, ...contentKeys, 'evidence', 'subjects'],
  revise: ['id', ...contentKeys, 'evidence', 'subjects', 'changeNote'],
  assess: ['id', 'dimension', 'newState', 'rationale'],
  derive: ['sourceItemId', 'sourceRevisionNo', ...ownerFields, ...contentKeys],
  setArchived: ['id', 'archived'],
} as const;

export interface ItemActionDeps {
  checkService: CheckService;
}

type AuditType = 'created' | 'revised' | 'assessed' | 'derived' | 'archived' | 'restored';

const invalid = (path: string, code: string) => new MenuActionInvalidError([{ path: [path], code }]);

export function itemActions(deps: ItemActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      ITEM_PERMISSION,
      await deps.checkService.checkCapability(
        actor,
        ITEM_PERMISSION,
        { workspace_id: actor.workspace_id },
        { tx },
      ),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: AuditType,
    item: ItemRow,
    title: string,
    extra: Record<string, unknown> = {},
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.item.${type}`,
      subject_type: 'knowledge_item',
      subject_id: item.id,
      summary: `KI-${item.itemNo} ${type}`,
      detail: { itemNo: item.itemNo, title, ...extra },
    });

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends keyof typeof INPUT_KEYS>(op: Op, input: Record<string, unknown>): ItemInput<Op> {
    const result = parseItemInput(op, input);
    if (!result.ok) throw new Error(`action item ${op}: validate passed but parse failed`);
    return result.value;
  }

  /** The owner of a new item: unknown → `not_found`, inactive → `inactive`, on the owner field the caller set. */
  async function ownerErrors(
    tx: Tx,
    workspaceId: string,
    value: { ownerModelId?: string | null | undefined; ownerSoftwareId?: string | null | undefined },
  ): Promise<FieldError[]> {
    const [path, check] = value.ownerModelId
      ? (['ownerModelId', await checkOwner(tx, workspaceId, { modelId: value.ownerModelId })] as const)
      : (['ownerSoftwareId', await checkOwner(tx, workspaceId, { softwareId: value.ownerSoftwareId ?? '' })] as const);
    return check === 'ok' ? [] : [{ path: [path], code: check }];
  }

  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const item = await lockItem(tx, actor.workspace_id, input.id as string);
    return item ? String(item.rowVersion) : null;
  };

  async function lockExisting(tx: Tx, actor: PlatformActor, id: string, action: string): Promise<ItemRow> {
    const item = await lockItem(tx, actor.workspace_id, id);
    if (!item) throw new Error(`action ${action}: currentVersion judged not_found first`);
    return item;
  }

  const base = (op: keyof typeof INPUT_KEYS, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.item${op[0]?.toUpperCase()}${op.slice(1)}`,
    menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID,
    inputKeys: INPUT_KEYS[op],
    permission: ITEM_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const create: MenuActionDeclaration = {
    spec: base('create', 'none'),
    authorize,
    validate: (input) => validateItemInput('create', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('create', input);
      const errors = await ownerErrors(tx, ws, value);
      if (errors.length > 0) throw new MenuActionInvalidError(errors);
      const { evidence, subjects, ownerModelId, ownerSoftwareId, ...content } = value;
      // #1196 f: the subjects name the owner's model (a SW-owned item: its SW version's model) and a target of its spec.
      const subjectModelId = ownerModelId ?? (await softwareModelId(tx, ws, ownerSoftwareId ?? ''));
      const judged = await judgeSubjects(tx, ws, subjectModelId ?? '', subjects ?? []);
      if (judged.errors.length > 0) throw new MenuActionInvalidError(judged.errors);
      const item = await insertItem(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        ownerModelId: ownerModelId ?? null,
        ownerSoftwareId: ownerSoftwareId ?? null,
        content,
        evidence,
      });
      await insertSubjects(tx, ws, item.id, 1, judged.rows);
      await record(tx, actor, 'created', item, content.title, { revisionNo: 1 });
      return { data: { id: item.id, itemNo: item.itemNo }, version: String(item.rowVersion) };
    },
  };

  const revise: MenuActionDeclaration = {
    spec: base('revise', 'version'),
    authorize,
    validate: (input) => validateItemInput('revise', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('revise', input);
      const before = await lockExisting(tx, actor, value.id, 'itemRevise');
      if (before.publicationState === 'archived') throw invalid('id', 'archived');
      const { id: _id, evidence, subjects, changeNote, ...content } = value;
      // #1196 f: `subjects` omitted keeps the previous revision's links; a list (even empty) replaces them.
      const judged =
        subjects === undefined
          ? null
          : await judgeSubjects(tx, actor.workspace_id, (await ownerModelOf(tx, actor.workspace_id, before.id)) ?? '', subjects);
      if (judged && judged.errors.length > 0) throw new MenuActionInvalidError(judged.errors);
      const item = await appendRevision(tx, actor.workspace_id, actor.actor_id, before, content, changeNote, evidence);
      if (judged) await insertSubjects(tx, actor.workspace_id, item.id, item.latestRevisionNo, judged.rows);
      else await carrySubjects(tx, actor.workspace_id, item.id, before.latestRevisionNo, item.latestRevisionNo);
      await record(tx, actor, 'revised', item, content.title, { revisionNo: item.latestRevisionNo });
      return {
        data: { id: item.id, itemNo: item.itemNo, revisionNo: item.latestRevisionNo },
        version: String(item.rowVersion),
      };
    },
  };

  const assess: MenuActionDeclaration = {
    spec: base('assess', 'version'),
    authorize,
    validate: (input) => validateItemInput('assess', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('assess', input);
      const before = await lockExisting(tx, actor, value.id, 'itemAssess');
      if (before.publicationState === 'archived') throw invalid('id', 'archived');
      const prior = value.dimension === 'verification' ? before.verificationState : before.processingState;
      if (prior === value.newState) throw invalid('newState', 'unchanged');
      const item = await appendAssessment(tx, ws, actor.actor_id, before, value.dimension, value.newState, value.rationale);
      await record(tx, actor, 'assessed', item, await latestTitle(tx, ws, item), {
        revisionNo: item.latestRevisionNo,
        dimension: value.dimension,
        priorState: prior,
        newState: value.newState,
      });
      return { data: { id: item.id, itemNo: item.itemNo }, version: String(item.rowVersion) };
    },
  };

  const derive: MenuActionDeclaration = {
    spec: base('derive', 'none'),
    authorize,
    validate: (input) => validateItemInput('derive', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('derive', input);
      const errors: FieldError[] = [];
      if (!(await itemExists(tx, ws, value.sourceItemId))) {
        errors.push({ path: ['sourceItemId'], code: 'not_found' });
      } else if (!(await revisionExists(tx, ws, value.sourceItemId, value.sourceRevisionNo))) {
        errors.push({ path: ['sourceRevisionNo'], code: 'not_found' });
      }
      errors.push(...(await ownerErrors(tx, ws, value)));
      if (errors.length > 0) throw new MenuActionInvalidError(errors);
      const { sourceItemId, sourceRevisionNo, ownerModelId, ownerSoftwareId, ...content } = value;
      const item = await insertItem(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        ownerModelId: ownerModelId ?? null,
        ownerSoftwareId: ownerSoftwareId ?? null,
        content,
        evidence: [],
      });
      await insertDerivedLink(tx, ws, actor.actor_id, item.id, sourceItemId, sourceRevisionNo);
      await record(tx, actor, 'derived', item, content.title, { revisionNo: 1, sourceItemId, sourceRevisionNo });
      return { data: { id: item.id, itemNo: item.itemNo }, version: String(item.rowVersion) };
    },
  };

  const setArchived: MenuActionDeclaration = {
    spec: base('setArchived', 'version'),
    authorize,
    validate: (input) => validateItemInput('setArchived', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('setArchived', input);
      const before = await lockExisting(tx, actor, value.id, 'itemSetArchived');
      const target = value.archived ? 'archived' : 'published';
      // Same value: nothing changes, nothing is audited, the current version is answered.
      if (before.publicationState === target) {
        return { data: { id: before.id, itemNo: before.itemNo }, version: String(before.rowVersion) };
      }
      const item = await setPublicationState(tx, ws, actor.actor_id, before, target);
      await record(tx, actor, value.archived ? 'archived' : 'restored', item, await latestTitle(tx, ws, item));
      return { data: { id: item.id, itemNo: item.itemNo }, version: String(item.rowVersion) };
    },
  };

  return [create, revise, assess, derive, setArchived];
}
