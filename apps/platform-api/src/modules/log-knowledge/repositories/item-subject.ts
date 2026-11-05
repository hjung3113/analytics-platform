// Item subject link storage and resolution (#1196 f, design v0.6 §15.2): `knowledge.item_revision_subject` only, every
// statement scoped to the workspace, insert-only (the runtime role holds no UPDATE or DELETE). A subject is a stable
// key — module or event of a model — with no FK to any spec row, so a new spec revision keeps the link. Resolution
// joins the model's CURRENT published revision by key: `resolved` (the key is there), `gone` (the revision no longer
// holds it) or `no_spec` (the model has no published revision).

import { and, asc, eq, sql } from 'drizzle-orm';

import { equipmentModels, itemRevisionSubjects, knowledgeItems, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import type { ItemSubjectValue } from '../domain/item-subject-input.js';
import { currentTargetsOf, loadCurrentTargets } from './spec-targets.js';

const s = itemRevisionSubjects;

export type SubjectState = 'resolved' | 'gone' | 'no_spec';

export interface ResolvedSubject {
  modelId: string;
  modelName: string;
  targetKind: string;
  targetKey: string;
  subjectRelation: string;
  specRevNoAtLink: number | null;
  state: SubjectState;
  /** The target's display name in the current published revision; null unless `resolved`. */
  targetName: string | null;
}

/** The model an item belongs to: its owner model, or the model of its owner SW version. Null when the item is not in the workspace. */
export async function ownerModelOf(tx: Tx, workspaceId: string, itemId: string): Promise<string | null> {
  const [row] = await tx
    .select({
      modelId: sql<string | null>`coalesce(${knowledgeItems.ownerModelId}, (select sv.model_id from knowledge.software_version sv where sv.workspace_id = ${knowledgeItems.workspaceId} and sv.id = ${knowledgeItems.ownerSoftwareId}))`,
    })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, itemId)));
  return row?.modelId ?? null;
}

/** The model of a SW version (the owner of a new item can be a SW version). */
export async function softwareModelId(tx: Tx, workspaceId: string, softwareId: string): Promise<string | null> {
  const [row] = await tx
    .select({ modelId: softwareVersions.modelId })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.id, softwareId)));
  return row?.modelId ?? null;
}

/**
 * Judges the subjects of a write against the item's owner model: every subject must name that model
 * (`model_mismatch`), and when the model has a published spec the key must exist in its CURRENT revision
 * (`not_found`). A model without a published revision accepts any well-formed key (`spec_rev_no_at_link` null, read
 * back as `no_spec` until a spec is published).
 */
export async function judgeSubjects(
  tx: Tx,
  workspaceId: string,
  ownerModelId: string,
  subjects: readonly ItemSubjectValue[],
): Promise<{ errors: FieldError[]; rows: (ItemSubjectValue & { specRevNoAtLink: number | null })[] }> {
  const current = subjects.length > 0 ? await currentTargetsOf(tx, workspaceId, ownerModelId) : null;
  const errors: FieldError[] = [];
  const rows: (ItemSubjectValue & { specRevNoAtLink: number | null })[] = [];
  subjects.forEach((subject, i) => {
    const at = ['subjects', String(i)];
    if (subject.modelId !== ownerModelId) {
      errors.push({ path: [...at, 'modelId'], code: 'model_mismatch' });
      return;
    }
    const found = current?.targets.get(subject.targetKey);
    if (current && (!found || found.kind !== subject.targetKind)) {
      errors.push({ path: [...at, 'targetKey'], code: 'not_found' });
      return;
    }
    rows.push({ ...subject, specRevNoAtLink: current?.revisionNo ?? null });
  });
  return { errors, rows };
}

export async function insertSubjects(
  tx: Tx,
  workspaceId: string,
  itemId: string,
  revisionNo: number,
  rows: readonly (ItemSubjectValue & { specRevNoAtLink: number | null })[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(s).values(
    rows.map((r) => ({
      workspaceId,
      itemId,
      revisionNo,
      modelId: r.modelId,
      targetKind: r.targetKind,
      targetKey: r.targetKey,
      subjectRelation: r.subjectRelation,
      specRevNoAtLink: r.specRevNoAtLink,
    })),
  );
}

/** A revise that sends no `subjects` keeps the previous revision's links: they are copied to the new revision, link-time spec revision included. */
export async function carrySubjects(tx: Tx, workspaceId: string, itemId: string, fromRevisionNo: number, toRevisionNo: number): Promise<void> {
  await tx.execute(sql`
    INSERT INTO knowledge.item_revision_subject
      (workspace_id, item_id, revision_no, model_id, target_kind, target_key, subject_relation, spec_rev_no_at_link)
    SELECT workspace_id, item_id, ${toRevisionNo}::int, model_id, target_kind, target_key, subject_relation, spec_rev_no_at_link
    FROM knowledge.item_revision_subject
    WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND revision_no = ${fromRevisionNo}`);
}

/** The subjects of one item revision, resolved against each model's current published spec. */
export async function resolvedSubjects(tx: Tx, workspaceId: string, itemId: string, revisionNo: number): Promise<ResolvedSubject[]> {
  const rows = await tx
    .select({ row: s, modelName: equipmentModels.name })
    .from(s)
    .innerJoin(equipmentModels, and(eq(equipmentModels.workspaceId, s.workspaceId), eq(equipmentModels.id, s.modelId)))
    .where(and(eq(s.workspaceId, workspaceId), eq(s.itemId, itemId), eq(s.revisionNo, revisionNo)))
    .orderBy(asc(s.modelId), asc(s.targetKind), asc(s.targetKey));
  const current = await loadCurrentTargets(tx, workspaceId, [...new Set(rows.map((r) => r.row.modelId))]);
  return rows.map(({ row, modelName }) => {
    const model = current.get(row.modelId);
    const target = model?.targets.get(row.targetKey);
    const state: SubjectState = !model ? 'no_spec' : target && target.kind === row.targetKind ? 'resolved' : 'gone';
    return {
      modelId: row.modelId,
      modelName,
      targetKind: row.targetKind,
      targetKey: row.targetKey,
      subjectRelation: row.subjectRelation,
      specRevNoAtLink: row.specRevNoAtLink,
      state,
      targetName: state === 'resolved' ? (target?.name ?? null) : null,
    };
  });
}
