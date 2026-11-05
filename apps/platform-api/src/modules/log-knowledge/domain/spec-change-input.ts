// Value checks and normalisation of the spec change actions (#1196 c, design v0.6 §15.2). Pure and DB-free; the
// engine's `validate` and the handlers share these functions. What only the database can judge (unknown software,
// the key against the published revision, range overlap, caps per model) is the handler's.
// Codes: `required`, `too_long`, `malformed`, `too_large` (change_json cap), `target_mismatch` (a name that does not
// spell the target key). `change_json` v1 (closed): added {after}, removed {before},
// changed {before, after}, behavior {}; before/after per target kind: module {name, parentModule}, event {name,
// triggerRule, detailDocRef}, field = the stored field shape, relation {ruleRef}.

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { NAME_MAX, toCodeKey } from './code-key.js';
import { MODULE_EVENT_TARGET_SCHEMAS, canonical, isRecord, kindEnum, nameText, optionalText, refText, under, uuidText as uuid } from './input-kit.js';
import { fieldErrors, specFieldSchema, storedField } from './spec-input.js';
import { SPEC_TARGET_KINDS, TARGET_KEY_MAX, type SpecTargetKind, type SpecTargetRef, buildTargetKey } from './spec-target-key.js';

export const SPEC_CHANGE_KINDS = ['added', 'removed', 'changed', 'behavior'] as const;
export type SpecChangeKindValue = (typeof SPEC_CHANGE_KINDS)[number];
export const SPEC_CHANGE_JSON_MAX_BYTES = 16 * 1024;
export const SPEC_CHANGE_NOTE_MAX = 1000;
export const SPEC_CHANGE_EVIDENCE_MAX = 500;
/** Open (not retired) changes per model, judged under the model lock. */
export const SPEC_CHANGES_OPEN_MAX = 500;

const TARGET_SCHEMAS = {
  ...MODULE_EVENT_TARGET_SCHEMAS,
  field: z.object({ module: refText, event: refText, field: nameText(NAME_MAX) }).strict({ message: 'malformed' }),
  relation: z
    .object({ sourceModule: refText, sourceEvent: refText, predicate: nameText(100), targetModule: refText, targetEvent: refText })
    .strict({ message: 'malformed' }),
} as const;

const VALUE_SCHEMAS = {
  module: z
    .object({ name: nameText(NAME_MAX), parentModule: refText.nullish().transform((v) => v ?? null) })
    .strict({ message: 'malformed' }),
  event: z
    .object({ name: nameText(NAME_MAX), triggerRule: optionalText(2000).optional(), detailDocRef: optionalText(2000).optional() })
    .strict({ message: 'malformed' })
    .transform((v) => ({ name: v.name, triggerRule: v.triggerRule ?? null, detailDocRef: v.detailDocRef ?? null })),
  field: specFieldSchema.transform((f) => storedField(f)),
  relation: z.object({ ruleRef: optionalText(2000).optional() }).strict({ message: 'malformed' }).transform((v) => ({ ruleRef: v.ruleRef ?? null })),
} as const;

export interface ChangeFields {
  targetKind: SpecTargetKind;
  target: SpecTargetRef;
  targetKey: string;
  changeKind: SpecChangeKindValue;
  change: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  note: string | null;
  evidenceRef: string | null;
}

/** The name a value spells must be the target's key (a rename changes the display name, never the key). */
function nameMatches(ref: SpecTargetRef, value: Record<string, unknown>): boolean {
  if (ref.kind === 'module') return toCodeKey(String(value.name)) === ref.module;
  if (ref.kind === 'event') return toCodeKey(String(value.name)) === ref.event;
  if (ref.kind === 'field') return value.name === ref.field;
  return true;
}

/** The change-describing fields shared by `specChangeAdd` and the replacement of `specChangeRetire`. */
export function parseChangeFields(raw: Record<string, unknown>, prefix: readonly string[] = []): { ok: true; value: ChangeFields } | { ok: false; errors: FieldError[] } {
  const envelope = z
    .object({
      targetKind: kindEnum(SPEC_TARGET_KINDS),
      changeKind: kindEnum(SPEC_CHANGE_KINDS),
      target: z.unknown(),
      change: z.unknown().optional(),
      note: optionalText(SPEC_CHANGE_NOTE_MAX).optional(),
      evidenceRef: optionalText(SPEC_CHANGE_EVIDENCE_MAX).optional(),
    })
    .safeParse(raw);
  if (!envelope.success) return { ok: false, errors: under(prefix, fieldErrors(envelope.error)) };
  const { targetKind, changeKind } = envelope.data;
  const errors: FieldError[] = [];

  if (!isRecord(envelope.data.target)) errors.push({ path: [...prefix, 'target'], code: 'required' });
  const target = TARGET_SCHEMAS[targetKind].safeParse(envelope.data.target);
  if (isRecord(envelope.data.target) && !target.success) errors.push(...under([...prefix, 'target'], fieldErrors(target.error)));
  const ref: SpecTargetRef | null = target.success ? ({ kind: targetKind, ...target.data } as SpecTargetRef) : null;

  const value = VALUE_SCHEMAS[targetKind];
  const rawChange = envelope.data.change ?? {};
  const change: ChangeFields['change'] = {};
  const wantBefore = changeKind === 'removed' || changeKind === 'changed';
  const wantAfter = changeKind === 'added' || changeKind === 'changed';
  if (!isRecord(rawChange)) errors.push({ path: [...prefix, 'change'], code: 'malformed' });
  else {
    const allowed = [...(wantBefore ? ['before'] : []), ...(wantAfter ? ['after'] : [])];
    for (const key of Object.keys(rawChange)) if (!allowed.includes(key)) errors.push({ path: [...prefix, 'change', key], code: 'malformed' });
    for (const side of ['before', 'after'] as const) {
      if (!(side === 'before' ? wantBefore : wantAfter)) continue;
      const parsed = value.safeParse(rawChange[side]);
      if (rawChange[side] === undefined) errors.push({ path: [...prefix, 'change', side], code: 'required' });
      else if (!parsed.success) errors.push(...under([...prefix, 'change', side], fieldErrors(parsed.error)));
      else {
        change[side] = parsed.data as Record<string, unknown>;
        // A name that spells another key would silently address a different target.
        if (side === 'after' && ref && !nameMatches(ref, change[side] as Record<string, unknown>)) errors.push({ path: [...prefix, 'change', side, 'name'], code: 'target_mismatch' });
      }
    }
  }
  if (changeKind === 'behavior' && !envelope.data.note) errors.push({ path: [...prefix, 'note'], code: 'required' });

  const targetKey = ref ? buildTargetKey(ref) : '';
  if (ref && targetKey.length > TARGET_KEY_MAX) errors.push({ path: [...prefix, 'target'], code: 'too_long' });
  if (new TextEncoder().encode(JSON.stringify(change)).length > SPEC_CHANGE_JSON_MAX_BYTES) errors.push({ path: [...prefix, 'change'], code: 'too_large' });
  if (errors.length > 0 || !ref) return { ok: false, errors };
  return {
    ok: true,
    value: { targetKind, target: ref, targetKey, changeKind, change, note: envelope.data.note ?? null, evidenceRef: envelope.data.evidenceRef ?? null },
  };
}

const range = {
  softwareId: uuid.transform(canonical),
  endsBeforeSoftwareId: uuid.nullish().transform((v) => (v === null || v === undefined ? null : canonical(v))),
};

export type SpecChangeOp = 'specChangeAdd' | 'specChangeRetire' | 'specChangeConfirm';

export interface SpecChangeAddValue extends ChangeFields {
  modelId: string;
  softwareId: string;
  endsBeforeSoftwareId: string | null;
}
export interface SpecChangeRetireValue {
  changeId: string;
  replacement: (ChangeFields & { softwareId: string; endsBeforeSoftwareId: string | null }) | null;
}

const parseRange = (raw: Record<string, unknown>) =>
  z.object({ softwareId: range.softwareId, endsBeforeSoftwareId: range.endsBeforeSoftwareId }).safeParse({ softwareId: raw.softwareId, endsBeforeSoftwareId: raw.endsBeforeSoftwareId });

export function parseSpecChangeAdd(raw: Record<string, unknown>, prefix: readonly string[] = [], withModel = true): { ok: true; value: SpecChangeAddValue } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const head = z.object({ modelId: withModel ? uuid : z.unknown().optional() }).safeParse(raw);
  if (!head.success) errors.push(...under(prefix, fieldErrors(head.error)));
  const r = parseRange(raw);
  if (!r.success) errors.push(...under(prefix, fieldErrors(r.error)));
  const fields = parseChangeFields(raw, prefix);
  if (!fields.ok) errors.push(...fields.errors);
  if (errors.length > 0 || !r.success || !fields.ok) return { ok: false, errors };
  return { ok: true, value: { ...fields.value, modelId: withModel ? canonical(String(raw.modelId)) : '', softwareId: r.data.softwareId, endsBeforeSoftwareId: r.data.endsBeforeSoftwareId } };
}

export function parseSpecChangeRetire(raw: Record<string, unknown>): { ok: true; value: SpecChangeRetireValue } | { ok: false; errors: FieldError[] } {
  const id = z.object({ changeId: uuid }).safeParse(raw);
  const errors: FieldError[] = id.success ? [] : fieldErrors(id.error);
  let replacement: SpecChangeRetireValue['replacement'] = null;
  if (raw.replacement !== undefined && raw.replacement !== null) {
    if (!isRecord(raw.replacement)) errors.push({ path: ['replacement'], code: 'malformed' });
    else {
      const parsed = parseSpecChangeAdd(raw.replacement, ['replacement'], false);
      if (parsed.ok) replacement = parsed.value;
      else errors.push(...parsed.errors);
    }
  }
  if (errors.length > 0 || !id.success) return { ok: false, errors };
  return { ok: true, value: { changeId: canonical(id.data.changeId), replacement } };
}

export function parseSpecChangeConfirm(raw: Record<string, unknown>): { ok: true; value: { changeId: string } } | { ok: false; errors: FieldError[] } {
  const id = z.object({ changeId: uuid }).safeParse(raw);
  return id.success ? { ok: true, value: { changeId: canonical(id.data.changeId) } } : { ok: false, errors: fieldErrors(id.error) };
}

export function validateSpecChange(op: SpecChangeOp, input: Record<string, unknown>): FieldError[] {
  const parsed = op === 'specChangeAdd' ? parseSpecChangeAdd(input) : op === 'specChangeRetire' ? parseSpecChangeRetire(input) : parseSpecChangeConfirm(input);
  return parsed.ok ? [] : parsed.errors;
}
