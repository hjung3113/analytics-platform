// The publish core shared by a direct item create / revise (`item-actions.ts`) and the approval of a draft
// (`review-actions.ts`, #1198 b): one function per kind writes the item rows, the subjects and the item's own audit row,
// so both paths leave identical rows. The caller owns the transaction, the authorization, the locking of an item to
// revise and the archived / version checks (their error paths differ). Every field error carries `prefix` first
// (`[]` for a direct write, `['proposal']` for an approval, whose input is the stored proposal).

import { createAuditService } from '../../core/audit/audit-service.js';
import type { Tx } from '../../../db/tx.js';
import { type FieldError, MenuActionInvalidError } from '../../menu-dispatch/types.js';
import type { PlatformActor } from '../../platform-port/permissions.js';
import type { EvidencePointer } from '../domain/item-input.js';
import type { ItemSubjectValue } from '../domain/item-subject-input.js';
import { carrySubjects, insertSubjects, judgeSubjects, ownerModelOf, softwareModelId } from './item-subject.js';
import { type ItemRow, type RevisionContent, appendRevision, checkOwner, insertItem } from './item-write.js';

export type ItemAuditType = 'created' | 'revised' | 'assessed' | 'derived' | 'archived' | 'restored';
type Actor = Pick<PlatformActor, 'workspace_id' | 'actor_id'>;

const audit = createAuditService();

/** The item's own audit row (`knowledge.item.<type>`), identical for every path that writes it. */
export const recordItemAudit = (
  tx: Tx,
  actor: Actor,
  type: ItemAuditType,
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

const prefixed = (prefix: readonly string[], errors: readonly FieldError[]): FieldError[] =>
  errors.map((e) => ({ path: [...prefix, ...e.path], code: e.code }));

/** The owner of a new item: unknown → `not_found`, inactive → `inactive`, on the owner field the caller set. */
export async function ownerErrors(
  tx: Tx,
  workspaceId: string,
  value: { ownerModelId?: string | null | undefined; ownerSoftwareId?: string | null | undefined },
  prefix: readonly string[] = [],
): Promise<FieldError[]> {
  const [path, check] = value.ownerModelId
    ? (['ownerModelId', await checkOwner(tx, workspaceId, { modelId: value.ownerModelId })] as const)
    : (['ownerSoftwareId', await checkOwner(tx, workspaceId, { softwareId: value.ownerSoftwareId ?? '' })] as const);
  return check === 'ok' ? [] : [{ path: [...prefix, path], code: check }];
}

export interface CreateCoreInput {
  ownerModelId?: string | null | undefined;
  ownerSoftwareId?: string | null | undefined;
  content: RevisionContent;
  evidence: readonly EvidencePointer[];
  subjects?: readonly ItemSubjectValue[] | undefined;
}

/** Owner check, subject judgement, item + revision 1 + subjects, `knowledge.item.created`. */
export async function publishCreate(
  tx: Tx,
  actor: Actor,
  input: CreateCoreInput,
  prefix: readonly string[] = [],
): Promise<ItemRow> {
  const ws = actor.workspace_id;
  const errors = await ownerErrors(tx, ws, input, prefix);
  if (errors.length > 0) throw new MenuActionInvalidError(errors);
  // #1196 f: the subjects name the owner's model (a SW-owned item: its SW version's model) and a target of its spec.
  const subjectModelId = input.ownerModelId ?? (await softwareModelId(tx, ws, input.ownerSoftwareId ?? ''));
  const judged = await judgeSubjects(tx, ws, subjectModelId ?? '', input.subjects ?? []);
  if (judged.errors.length > 0) throw new MenuActionInvalidError(prefixed(prefix, judged.errors));
  const item = await insertItem(tx, {
    workspaceId: ws,
    actorId: actor.actor_id,
    ownerModelId: input.ownerModelId ?? null,
    ownerSoftwareId: input.ownerSoftwareId ?? null,
    content: input.content,
    evidence: input.evidence,
  });
  await insertSubjects(tx, ws, item.id, 1, judged.rows);
  await recordItemAudit(tx, actor, 'created', item, input.content.title, { revisionNo: 1 });
  return item;
}

export interface ReviseCoreInput {
  content: RevisionContent;
  evidence: readonly EvidencePointer[];
  /** Omitted keeps the previous revision's links; a list (even empty) replaces them. */
  subjects?: readonly ItemSubjectValue[] | undefined;
  changeNote: string;
}

/** `before` is the locked, not archived item. Subject judgement, revision `latest + 1`, subjects, `knowledge.item.revised`. */
export async function publishRevise(
  tx: Tx,
  actor: Actor,
  before: ItemRow,
  input: ReviseCoreInput,
  prefix: readonly string[] = [],
): Promise<ItemRow> {
  const ws = actor.workspace_id;
  const judged =
    input.subjects === undefined
      ? null
      : await judgeSubjects(tx, ws, (await ownerModelOf(tx, ws, before.id)) ?? '', input.subjects);
  if (judged && judged.errors.length > 0) throw new MenuActionInvalidError(prefixed(prefix, judged.errors));
  const item = await appendRevision(tx, ws, actor.actor_id, before, input.content, input.changeNote, input.evidence);
  if (judged) await insertSubjects(tx, ws, item.id, item.latestRevisionNo, judged.rows);
  else await carrySubjects(tx, ws, item.id, before.latestRevisionNo, item.latestRevisionNo);
  await recordItemAudit(tx, actor, 'revised', item, input.content.title, { revisionNo: item.latestRevisionNo });
  return item;
}
