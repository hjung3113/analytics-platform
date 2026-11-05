/**
 * Item subject links of the mock server (#1196 f, design v0.6 §15.2), the server's `repositories/item-subject.ts`: a
 * subject is a module or event of the item's OWNER model, pointed to by stable key (no spec row id), resolved on read
 * against the model's CURRENT published revision: `resolved`, `gone` (the revision no longer holds the key) or `no_spec`
 * (the model has no published revision).
 */
import { MockActionInvalid } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import type { ItemSubject } from '../endpoints';
import { currentTargets, type SubjectValue } from './conceptInput';
import type { ItemRec, SubjectRec } from './items';
import { byId } from './store';

/** The model an item belongs to: its owner model, or the model of its owner SW version. */
export const itemModelId = (rec: Pick<ItemRec, 'ownerModelId' | 'ownerSoftwareId'>): string => rec.ownerModelId ?? byId(rec.ownerSoftwareId)!.parentId!;

/**
 * The subjects of a write against the item's owner model: every subject must name that model (`model_mismatch`), and when
 * the model has a published spec the key must exist in its CURRENT revision (`not_found`). A model without a published
 * revision accepts any well-formed key (`specRevNoAtLink` null, read back as `no_spec`). Throws `MockActionInvalid`.
 */
export function judgeSubjects(ownerModelId: string, subjects: readonly SubjectValue[]): SubjectRec[] {
  const owner = ownerModelId.toLowerCase(), current = currentTargets(owner);
  const errors: FieldError[] = [], rows: SubjectRec[] = [];
  subjects.forEach((subject, i) => {
    const at = ['subjects', String(i)];
    if (subject.modelId !== owner) { errors.push({ path: [...at, 'modelId'], code: 'model_mismatch' }); return; }
    if (current && current.targets.get(subject.targetKey)?.kind !== subject.targetKind) { errors.push({ path: [...at, 'targetKey'], code: 'not_found' }); return; }
    rows.push({ modelId: owner, targetKind: subject.targetKind, targetKey: subject.targetKey, subjectRelation: subject.subjectRelation, specRevNoAtLink: current?.revisionNo ?? null });
  });
  if (errors.length > 0) throw new MockActionInvalid(errors);
  return rows;
}

/** The subjects of one item revision, resolved against each model's current published spec (model, kind, key order). */
export function resolvedSubjects(rec: ItemRec, revisionNo: number): ItemSubject[] {
  return [...(rec.subjects[revisionNo] ?? [])]
    .sort((x, y) => x.modelId.localeCompare(y.modelId) || x.targetKind.localeCompare(y.targetKind) || x.targetKey.localeCompare(y.targetKey))
    .map(s => {
      const current = currentTargets(s.modelId), target = current?.targets.get(s.targetKey);
      const found = target && target.kind === s.targetKind ? target : undefined;
      const state: ItemSubject['state'] = !current ? 'no_spec' : found ? 'resolved' : 'gone';
      return { modelId: s.modelId, modelName: byId(s.modelId)?.name ?? '', targetKind: s.targetKind, targetKey: s.targetKey, subjectRelation: s.subjectRelation, specRevNoAtLink: s.specRevNoAtLink, state, targetName: state === 'resolved' ? found!.name : null };
    });
}
