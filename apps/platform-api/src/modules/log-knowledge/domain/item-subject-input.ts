// Value checks of the optional `subjects[]` of the item writes (#1196 f, design v0.6 §15.2). Pure and DB-free. A
// subject is the module or event a knowledge item revision is ABOUT, pointed to by stable key (`module_key` or
// `module_key/event_key`, `toCodeKey` spelling, same grammar as the SW change targets) — never a spec row id, so the
// link survives new spec revisions. What only the database can judge (the model is the item's owner model, the key
// exists in the current published revision) is the handler's.
// Codes: `required`, `malformed`, `too_long` (more than `ITEM_SUBJECTS_MAX`), `duplicate` (the same model, kind and key twice).

import type { FieldError } from '../../menu-dispatch/types.js';
import { parseModuleEventTarget, uuidText } from './concept-input.js';

export const ITEM_SUBJECTS_MAX = 20;
export const SUBJECT_RELATIONS = ['about', 'context'] as const;
export type SubjectRelation = (typeof SUBJECT_RELATIONS)[number];

export interface ItemSubjectValue {
  modelId: string;
  targetKind: 'module' | 'event';
  targetKey: string;
  subjectRelation: SubjectRelation;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `undefined` / `null` = the field was not sent (a revise then carries the previous revision's subjects). */
export function parseSubjects(raw: unknown): { ok: true; value: ItemSubjectValue[] | undefined } | { ok: false; errors: FieldError[] } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!Array.isArray(raw)) return { ok: false, errors: [{ path: ['subjects'], code: 'malformed' }] };
  if (raw.length > ITEM_SUBJECTS_MAX) return { ok: false, errors: [{ path: ['subjects'], code: 'too_long' }] };
  const errors: FieldError[] = [];
  const out: ItemSubjectValue[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const at = ['subjects', String(i)];
    if (!isRecord(entry)) {
      errors.push({ path: at, code: 'malformed' });
      return;
    }
    const model = uuidText.safeParse(entry.modelId);
    if (!model.success) errors.push({ path: [...at, 'modelId'], code: entry.modelId === undefined ? 'required' : 'malformed' });
    const target = parseModuleEventTarget(entry, at);
    if (!target.ok) errors.push(...target.errors);
    let relation: SubjectRelation = 'about';
    if (entry.relation !== undefined && entry.relation !== null) {
      if (typeof entry.relation === 'string' && (SUBJECT_RELATIONS as readonly string[]).includes(entry.relation)) relation = entry.relation as SubjectRelation;
      else errors.push({ path: [...at, 'relation'], code: 'malformed' });
    }
    if (!model.success || !target.ok) return;
    const modelId = model.data.toLowerCase();
    const key = `${modelId}|${target.value.targetKind}|${target.value.targetKey}`;
    if (seen.has(key)) {
      errors.push({ path: at, code: 'duplicate' });
      return;
    }
    seen.add(key);
    out.push({ modelId, targetKind: target.value.targetKind, targetKey: target.value.targetKey, subjectRelation: relation });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}
