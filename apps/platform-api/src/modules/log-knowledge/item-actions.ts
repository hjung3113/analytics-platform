// The knowledge item write actions of the log knowledge hub (#1197 w, ADR-0109): create, revise, assess, derive and
// set-archived. Right: `knowledge.item.publish` (workspace-scoped; Admin passes through the module bypass, a bare
// capability check refuses Admin). Rules: the workspace is the actor's and so is every id a write references; the
// owner of an item never changes; revisions, evidence, assessment events and links are only inserted; an archived
// item takes no revision or assessment; every successful write bumps `row_version` (create/derive start at 1) and
// writes its audit row in the same transaction. A refusal only the database can judge is a
// `MenuActionInvalidError` (field errors, never a 500). SetArchived to the value an item already has changes
// nothing and answers `ok` with the current version.

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
import { type ItemAuditType, ownerErrors, publishCreate, publishRevise, recordItemAudit } from './repositories/item-publish.js';
import {
  type ItemRow,
  appendAssessment,
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
  create: [...ownerFields, ...contentKeys, 'evidence', 'subjects', 'relations'],
  revise: ['id', ...contentKeys, 'evidence', 'subjects', 'relations', 'changeNote'],
  assess: ['id', 'dimension', 'newState', 'rationale'],
  derive: ['sourceItemId', 'sourceRevisionNo', ...ownerFields, ...contentKeys],
  setArchived: ['id', 'archived'],
} as const;

export interface ItemActionDeps {
  checkService: CheckService;
}

const invalid = (path: string, code: string) => new MenuActionInvalidError([{ path: [path], code }]);

export function itemActions(deps: ItemActionDeps): MenuActionDeclaration[] {
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
    type: ItemAuditType,
    item: ItemRow,
    title: string,
    extra: Record<string, unknown> = {},
  ) => recordItemAudit(tx, actor, type, item, title, extra);

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends keyof typeof INPUT_KEYS>(op: Op, input: Record<string, unknown>): ItemInput<Op> {
    const result = parseItemInput(op, input);
    if (!result.ok) throw new Error(`action item ${op}: validate passed but parse failed`);
    return result.value;
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
      const value = parsed('create', input);
      const { evidence, subjects, relations, ownerModelId, ownerSoftwareId, ...content } = value;
      const item = await publishCreate(tx, actor, { ownerModelId, ownerSoftwareId, content, evidence, subjects, relations });
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
      const { id: _id, evidence, subjects, relations, changeNote, ...content } = value;
      const item = await publishRevise(tx, actor, before, { content, evidence, subjects, relations, changeNote });
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
