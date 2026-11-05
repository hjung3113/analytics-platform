/**
 * Pure view model of the Item subject link (#1196 f, design v0.6 §15.2): the editor's picker tree (built from the owner
 * model's published spec, with search and the 20 cap), the write payload, the detail chips and their link target.
 * No JSX, no hooks.
 */
import type { ColumnFilter } from '@ap/contracts';
import { ITEM_SUBJECT_LIMITS, type ConceptKind, type ConceptTargetBody, type ItemSubject, type ItemSubjectInput, type SubjectRelation, type SubjectState } from '../../endpoints';
import { decodeKey, encodeKey, eventIdentity, eventsOf, modulesOf, type Spec } from '../spec/specModel';
import type { Words } from '../spec/conceptModel';

export const SUBJECT_RELATION_LABEL: Record<SubjectRelation, Words> = { about: { ko: '직접 다루는 대상', en: 'Directly about' }, context: { ko: '배경', en: 'Background' } };
export const SUBJECT_STATE_LABEL: Record<SubjectState, Words> = { resolved: { ko: '연결됨', en: 'Linked' }, gone: { ko: '대상 사라짐', en: 'Target gone' }, no_spec: { ko: '명세 없음', en: 'No specification' } };
export const SUBJECT_LIMIT = ITEM_SUBJECT_LIMITS.subjects;

export type ChipTone = 'success' | 'warning' | 'neutral';
const TONE: Record<SubjectState, ChipTone> = { resolved: 'success', gone: 'warning', no_spec: 'neutral' };
export type SubjectLink = { menuId: 'log-knowledge-spec'; params: { modelId: string }; page: Record<string, string> };
/** Only a resolved subject opens the spec detail: `tab=spec&event=<key>` (a module: `tab=spec&module=<key>`). */
export function subjectLink(s: Pick<ItemSubject, 'modelId' | 'targetKind' | 'targetKey' | 'state'>): SubjectLink | null {
  if (s.state !== 'resolved') return null;
  return { menuId: 'log-knowledge-spec', params: { modelId: s.modelId }, page: { tab: 'spec', [s.targetKind === 'event' ? 'event' : 'module']: s.targetKind === 'module' ? decodeKey(s.targetKey) : s.targetKey } };
}
export type SubjectChip = { key: string; label: string; modelName: string; kind: ConceptKind; relation: Words; state: Words; stateKey: SubjectState; tone: ChipTone; link: SubjectLink | null };
export const subjectChip = (s: ItemSubject): SubjectChip => ({
  key: `${s.modelId}|${s.targetKind}|${s.targetKey}`, label: s.targetName ?? s.targetKey, modelName: s.modelName, kind: s.targetKind,
  relation: SUBJECT_RELATION_LABEL[s.subjectRelation], state: SUBJECT_STATE_LABEL[s.state], stateKey: s.state, tone: TONE[s.state], link: subjectLink(s),
});
/** Directly-about targets first, then background; stable by model name and key. */
export const subjectChips = (subjects: readonly ItemSubject[] | undefined): SubjectChip[] =>
  [...(subjects ?? [])].sort((a, b) => Number(a.subjectRelation === 'context') - Number(b.subjectRelation === 'context') || a.modelName.localeCompare(b.modelName) || a.targetKey.localeCompare(b.targetKey)).map(subjectChip);

/** The item list filter that finds the items about one target key (pair it with `ownerModelId`). */
export const subjectFilter = (targetKey: string): ColumnFilter => ({ id: 'subject', op: 'in', value: [targetKey] });

// ---- picker -----------------------------------------------------------------------------------------------------

export type PickerNode = { kind: ConceptKind; key: string; name: string; moduleKey: string; eventKey?: string; path: string[]; children: PickerNode[]; matched: boolean };
/** The model spec as a pick tree: Modules (nested by parent) holding their child Modules and Events. Every node is selectable. */
export function buildPickerTree(spec: Spec | null | undefined): PickerNode[] {
  if (!spec) return [];
  const modules = modulesOf(spec), events = eventsOf(spec);
  const make = (moduleKey: string, trail: string[], seen: Set<string>): PickerNode => {
    const m = modules.find(x => x.moduleKey === moduleKey)!, path = [...trail, m.name], next = new Set(seen).add(moduleKey);
    const subs = modules.filter(c => c.parentKey === moduleKey && !next.has(c.moduleKey)).map(c => make(c.moduleKey, path, next));
    const evs = events.filter(e => e.moduleKey === moduleKey).map((e): PickerNode => ({ kind: 'event', key: eventIdentity(e), name: e.name, moduleKey, eventKey: e.eventKey, path: [...path, e.name], children: [], matched: true }));
    return { kind: 'module', key: encodeKey(moduleKey), name: m.name, moduleKey, path, children: [...subs, ...evs], matched: true };
  };
  return modules.filter(m => m.parentKey === null || !modules.some(p => p.moduleKey === m.parentKey)).map(m => make(m.moduleKey, [], new Set()));
}
const fold = (v: string): string => v.normalize('NFKC').toLowerCase();
/** Search by name or key: matching nodes plus their ancestors (`matched: false`), so the path stays readable. Blank = the whole tree. */
export function searchPickerTree(tree: readonly PickerNode[], query: string): PickerNode[] {
  const q = fold(query.trim());
  if (q === '') return tree.map(n => ({ ...n }));
  const walk = (n: PickerNode): PickerNode | null => {
    const kids = n.children.map(walk).filter((c): c is PickerNode => c !== null);
    const hit = fold(n.name).includes(q) || fold(n.key).includes(q);
    return hit || kids.length > 0 ? { ...n, matched: hit, children: hit && kids.length === 0 ? n.children : kids } : null;
  };
  return tree.map(walk).filter((n): n is PickerNode => n !== null);
}

export type SubjectPick = { kind: ConceptKind; key: string; relation: SubjectRelation };
export const pickId = (p: SubjectPick): string => `${p.kind}|${p.key}`;
export const atSubjectLimit = (picks: readonly SubjectPick[]): boolean => picks.length >= SUBJECT_LIMIT;
/** Adds a target (default relation: directly about). At the cap or already picked, the list is returned unchanged with the reason. */
export function addPick(picks: readonly SubjectPick[], node: SubjectPick | PickerNode, relation: SubjectRelation = 'about'): { picks: SubjectPick[]; error: 'too_many' | 'duplicate' | null } {
  const pick: SubjectPick = { kind: node.kind, key: node.key, relation: 'relation' in node ? node.relation : relation };
  if (picks.some(p => pickId(p) === pickId(pick))) return { picks: [...picks], error: 'duplicate' };
  if (atSubjectLimit(picks)) return { picks: [...picks], error: 'too_many' };
  return { picks: [...picks, pick], error: null };
}
export const removePick = (picks: readonly SubjectPick[], id: string): SubjectPick[] => picks.filter(p => pickId(p) !== id);
export const setPickRelation = (picks: readonly SubjectPick[], id: string, relation: SubjectRelation): SubjectPick[] => picks.map(p => (pickId(p) === id ? { ...p, relation } : p));
/** The picks an existing item starts from (its latest revision's subjects). */
export const picksOf = (subjects: readonly ItemSubject[] | undefined): SubjectPick[] => (subjects ?? []).map(s => ({ kind: s.targetKind, key: s.targetKey, relation: s.subjectRelation }));

/** `target` body of a write from an escaped stable key. */
export function targetBodyOf(kind: ConceptKind, key: string): ConceptTargetBody {
  const [module = '', event = ''] = key.split('/').map(decodeKey);
  return kind === 'module' ? { module } : { module, event };
}
export const toSubjectInputs = (modelId: string, picks: readonly SubjectPick[]): ItemSubjectInput[] =>
  picks.map(p => ({ modelId, targetKind: p.kind, target: targetBodyOf(p.kind, p.key), relation: p.relation }));

export type SubjectsPayload = { send: false } | { send: true; subjects: ItemSubjectInput[]; blocked: ItemSubject[] };
/**
 * `subjects` of an `itemRevise`: unchanged picks are NOT sent (the server carries the previous links, link-time spec revision
 * included, so a `gone` or `no_spec` subject survives an edit of another field). A changed list replaces them; a kept
 * `gone` subject would be refused (`not_found`), so it is returned in `blocked` for the editor to ask the user to remove.
 */
export function subjectsPayload(modelId: string, initial: readonly ItemSubject[] | undefined, picks: readonly SubjectPick[]): SubjectsPayload {
  const before = picksOf(initial), same = before.length === picks.length && before.every(b => picks.some(p => pickId(p) === pickId(b) && p.relation === b.relation));
  if (same) return { send: false };
  const goneIds = new Set((initial ?? []).filter(s => s.state === 'gone').map(s => `${s.targetKind}|${s.targetKey}`));
  return { send: true, subjects: toSubjectInputs(modelId, picks), blocked: (initial ?? []).filter(s => goneIds.has(`${s.targetKind}|${s.targetKey}`) && picks.some(p => pickId(p) === `${s.targetKind}|${s.targetKey}`)) };
}

const SUBJECT_CODE: Record<string, Words> = {
  too_long: { ko: `대상은 ${SUBJECT_LIMIT}개까지 고를 수 있습니다.`, en: `At most ${SUBJECT_LIMIT} targets.` },
  duplicate: { ko: '같은 대상이 두 번 들어 있습니다.', en: 'The same target appears twice.' },
  model_mismatch: { ko: '대상은 Item을 소유한 모델의 명세에서만 고를 수 있습니다.', en: 'Targets must come from the owner model.' },
  not_found: { ko: '현행 명세에 없는 대상입니다.', en: 'Not in the current specification.' },
  malformed: { ko: '대상 형식을 확인해 주세요.', en: 'Check the target.' },
  required: { ko: '필수 값입니다.', en: 'This field is required.' },
};
export const subjectErrorText = (code: string): Words => SUBJECT_CODE[code] ?? { ko: '입력을 확인해 주세요.', en: 'Check this input.' };
