/**
 * Value checks and current-spec lookups of the concept mapping and Item subject mocks (#1196 e/f). The mock keeps its own
 * copies of the server's pure rules (`domain/concept-input.ts`, `item-subject-input.ts`, `concept-similarity.ts`,
 * `concept-suggest.ts`, `repositories/spec-targets.ts`), never a server import. Codes: `required`, `too_long`,
 * `malformed`, `required_one`, `same_target`, `duplicate`; state codes (`not_found`, `none_published`, ...) are the handlers'.
 */
import type { FieldError } from '@ap/contracts';
import { isUuid, CONCEPT_KINDS, CONCEPT_LIMITS, CONCEPT_RELATIONS, ITEM_SUBJECT_LIMITS, type ConceptKind, type ConceptRelation, type ConceptSuggestion, type SubjectRelation } from '../endpoints';
import { nameError, specUnsafe } from './specInput';
import { escapeKey, eventKey, latestSpec } from './specStore';
import { toCodeKey } from './store';

export const NAME_MAX = 200;
export const TARGET_KEY_MAX = 1200;
type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const err = (path: readonly string[], code: string): FieldError => ({ path, code });
const code = (v: unknown, max: number): string | null => (typeof v !== 'string' ? 'required' : specUnsafe(v) ? 'malformed' : [...v].length > max ? 'too_long' : null);
export const uuidCode = (v: unknown): string | null => (typeof v !== 'string' ? 'required' : isUuid(v) ? null : 'malformed');
const oneOf = (v: unknown, values: readonly string[]): string | null => (v === undefined ? 'required' : typeof v === 'string' && values.includes(v) ? null : 'malformed');

export type TargetValue = { targetKind: ConceptKind; targetKey: string };

/** `targetKind` + `target` of a module or event and the stable key they spell (`toCodeKey` spelling, escaped like the server's `buildTargetKey`). */
export function parseModuleEventTarget(raw: Raw, prefix: readonly string[] = []): { ok: true; value: TargetValue } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const kindCode = oneOf(raw.targetKind, CONCEPT_KINDS);
  if (kindCode) errors.push(err([...prefix, 'targetKind'], kindCode));
  let key = '';
  if (!isRecord(raw.target)) errors.push(err([...prefix, 'target'], 'required'));
  else if (!kindCode) {
    const kind = raw.targetKind as ConceptKind;
    const fields = kind === 'module' ? ['module'] : ['module', 'event'];
    const names: string[] = [];
    for (const field of fields) {
      const checked = nameError(raw.target[field], NAME_MAX, field);
      if (checked.error) errors.push(err([...prefix, 'target', field], checked.error.code));
      else names.push(escapeKey(toCodeKey(checked.name)));
    }
    if (Object.keys(raw.target).some(k => !fields.includes(k))) errors.push(err([...prefix, 'target'], 'malformed'));
    key = names.join('/');
    if (errors.length === 0 && key.length > TARGET_KEY_MAX) errors.push(err([...prefix, 'target'], 'too_long'));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { targetKind: raw.targetKind as ConceptKind, targetKey: key } };
}

export type ProposeValue = TargetValue & {
  modelId: string; conceptId: string | null; canonicalLabel: string | null; description: string | null; relationKind: ConceptRelation;
  pairWith: (TargetValue & { modelId: string }) | null;
};

export function parseConceptPropose(raw: Raw): { ok: true; value: ProposeValue } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const modelCode = uuidCode(raw.modelId);
  if (modelCode) errors.push(err(['modelId'], modelCode));
  const conceptCode = raw.conceptId == null ? null : uuidCode(raw.conceptId);
  if (conceptCode) errors.push(err(['conceptId'], conceptCode));
  let label: string | null = null;
  if (raw.canonicalLabel != null) {
    const checked = nameError(raw.canonicalLabel, NAME_MAX, 'canonicalLabel');
    if (checked.error) errors.push(checked.error); else label = checked.name;
  }
  let description: string | null = null;
  if (raw.description != null) {
    const c = code(raw.description, CONCEPT_LIMITS.description);
    if (c) errors.push(err(['description'], c)); else description = (raw.description as string).trim() === '' ? null : (raw.description as string).trim();
  }
  if (raw.relationKind != null && oneOf(raw.relationKind, CONCEPT_RELATIONS)) errors.push(err(['relationKind'], 'malformed'));
  const target = parseModuleEventTarget(raw);
  if (!target.ok) errors.push(...target.errors);
  if ((raw.conceptId != null) === (raw.canonicalLabel != null)) errors.push(err(['concept'], 'required_one'));
  let pairWith: ProposeValue['pairWith'] = null;
  if (raw.pairWith != null) {
    if (!isRecord(raw.pairWith)) errors.push(err(['pairWith'], 'malformed'));
    else {
      const pairModel = uuidCode(raw.pairWith.modelId);
      if (pairModel) errors.push(err(['pairWith', 'modelId'], pairModel));
      const pairTarget = parseModuleEventTarget(raw.pairWith, ['pairWith']);
      if (!pairTarget.ok) errors.push(...pairTarget.errors);
      else if (!pairModel) {
        pairWith = { ...pairTarget.value, modelId: (raw.pairWith.modelId as string).toLowerCase() };
        if (target.ok && pairTarget.value.targetKind !== target.value.targetKind) errors.push(err(['pairWith', 'targetKind'], 'malformed'));
        else if (target.ok && !modelCode && pairWith.modelId === (raw.modelId as string).toLowerCase() && pairWith.targetKey === target.value.targetKey) errors.push(err(['pairWith'], 'same_target'));
      }
    }
  }
  if (errors.length > 0 || !target.ok) return { ok: false, errors };
  return {
    ok: true,
    value: { ...target.value, modelId: (raw.modelId as string).toLowerCase(), conceptId: raw.conceptId == null ? null : (raw.conceptId as string).toLowerCase(), canonicalLabel: label, description, relationKind: (raw.relationKind as ConceptRelation | undefined | null) ?? 'equivalent', pairWith },
  };
}

export const confirmErrors = (raw: Raw): FieldError[] => { const c = uuidCode(raw.mappingId); return c ? [err(['mappingId'], c)] : []; };
export function rejectErrors(raw: Raw): FieldError[] {
  const errors = confirmErrors(raw);
  const r = code(raw.reason, CONCEPT_LIMITS.rejectReason) ?? ((raw.reason as string).trim() === '' ? 'required' : null);
  if (r) errors.push(err(['reason'], r));
  return errors;
}

export type SubjectValue = TargetValue & { modelId: string; subjectRelation: SubjectRelation };
/** `undefined` / `null` = the field was not sent (a revise then carries the previous revision's subjects). */
export function parseSubjects(raw: unknown): { ok: true; value: SubjectValue[] | undefined } | { ok: false; errors: FieldError[] } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!Array.isArray(raw)) return { ok: false, errors: [err(['subjects'], 'malformed')] };
  if (raw.length > ITEM_SUBJECT_LIMITS.subjects) return { ok: false, errors: [err(['subjects'], 'too_long')] };
  const errors: FieldError[] = [], out: SubjectValue[] = [], seen = new Set<string>();
  raw.forEach((entry, i) => {
    const at = ['subjects', String(i)];
    if (!isRecord(entry)) { errors.push(err(at, 'malformed')); return; }
    const modelCode = uuidCode(entry.modelId);
    if (modelCode) errors.push(err([...at, 'modelId'], modelCode));
    const target = parseModuleEventTarget(entry, at);
    if (!target.ok) errors.push(...target.errors);
    let relation: SubjectRelation = 'about';
    if (entry.relation != null) {
      if (entry.relation === 'about' || entry.relation === 'context') relation = entry.relation; else errors.push(err([...at, 'relation'], 'malformed'));
    }
    if (modelCode || !target.ok) return;
    const modelId = (entry.modelId as string).toLowerCase(), dedupe = `${modelId}|${target.value.targetKind}|${target.value.targetKey}`;
    if (seen.has(dedupe)) { errors.push(err(at, 'duplicate')); return; }
    seen.add(dedupe);
    out.push({ ...target.value, modelId, subjectRelation: relation });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

// ---- the current published spec as targets (`repositories/spec-targets.ts`) --------------------------------------------

export type SpecTarget = { kind: ConceptKind; name: string; fields: string[] };
export type ModelTargets = { revisionNo: number; targets: Map<string, SpecTarget> };
/** The module / event targets of a model's CURRENT published revision by stable key; `undefined` = no published revision (`no_spec`). */
export function currentTargets(modelId: string): ModelTargets | undefined {
  const rev = latestSpec(modelId);
  if (!rev) return undefined;
  const targets = new Map<string, SpecTarget>();
  for (const m of rev.modules) targets.set(escapeKey(m.moduleKey), { kind: 'module', name: m.name, fields: [] });
  for (const e of rev.events) {
    const module = rev.modules.find(m => m.id === e.moduleId);
    if (module) targets.set(eventKey(module.moduleKey, e.eventKey), { kind: 'event', name: e.name, fields: (Array.isArray(e.fields) ? e.fields : []).map(f => String((f as { name?: unknown } | null)?.name ?? '')).filter(n => n !== '') });
  }
  return { revisionNo: rev.revision.revisionNo, targets };
}

// ---- similarity proposals (`domain/concept-similarity.ts`, `concept-suggest.ts`) ----------------------------------------

export const SIMILARITY_MIN_SCORE = 0.5;
export const SUGGESTION_CAP = 500;
type Basis = NonNullable<ConceptSuggestion['basis']>;
const normalizeName = (v: string): string => v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const grams = (v: string): Set<string> => { const p = `  ${v} `, out = new Set<string>(); for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3)); return out; };
const jaccard = <T,>(a: ReadonlySet<T>, b: ReadonlySet<T>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0; for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
};
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
export function scoreTargets(a: Pick<SpecTarget, 'name' | 'fields'>, b: Pick<SpecTarget, 'name' | 'fields'>): { score: number; basis: Basis } {
  const x = normalizeName(a.name), y = normalizeName(b.name);
  const name = x === '' || y === '' ? 0 : x === y ? 1 : jaccard(grams(x), grams(y));
  const fa = new Set(a.fields.map(normalizeName).filter(n => n !== '')), fb = new Set(b.fields.map(normalizeName).filter(n => n !== ''));
  const overlap = fa.size === 0 || fb.size === 0 ? null : jaccard(fa, fb);
  const score = overlap === null ? name : name * 0.6 + overlap * 0.4;
  return { score: round3(score), basis: overlap === null ? { name_trgm: round3(name) } : { name_trgm: round3(name), field_overlap: round3(overlap) } };
}
