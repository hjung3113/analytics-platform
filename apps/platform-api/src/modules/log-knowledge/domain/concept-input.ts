// Value checks of the concept mapping actions and reads (#1196 e, design v0.6 §15.4). Pure and DB-free; the engine's
// `validate` and the handlers share these functions. What only the database can judge (unknown model or concept, the
// key against the published revision, an existing pair, the one-confirmed rule) is the handler's.
// Codes: `required`, `too_long`, `malformed`, `required_one` (exactly one of `conceptId` / `canonicalLabel`),
// `same_target` (a pair of one target with itself).

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../platform-port/text-safety.js';
import { NAME_MAX, toCodeKey } from './code-key.js';
import { fieldErrors, normalizeSpecName } from './spec-input.js';
import { type SpecTargetKind, type SpecTargetRef, TARGET_KEY_MAX, buildTargetKey } from './spec-target-key.js';

export const CONCEPT_KINDS = ['module', 'event'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];
export const CONCEPT_RELATIONS = ['equivalent', 'related'] as const;
export const CONCEPT_REVIEW_STATES = ['proposed', 'confirmed', 'rejected'] as const;
export const CONCEPT_DESCRIPTION_MAX = 1000;
export const CONCEPT_REJECT_REASON_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonical = (v: string): string => v.toLowerCase();
const REQUIRED = { required_error: 'required', invalid_type_error: 'required' };
const length = (value: string): number => [...value].length;
export const uuidText = z.string(REQUIRED).refine((v) => UUID.test(v), { message: 'malformed' });
const bounded = (max: number) =>
  z.string(REQUIRED).superRefine((value, ctx) => {
    if (unsafeText(value)) ctx.addIssue({ code: 'custom', message: 'malformed' });
    else if (length(value) > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
  });
const nameText = (max: number) =>
  bounded(max)
    .refine((v) => normalizeSpecName(v) !== '', { message: 'required' })
    .transform(normalizeSpecName);
const optionalText = (max: number) =>
  bounded(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));
const kindEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
/** A module / event key spelling, normalised exactly like the SW change targets (`toCodeKey`). */
const refText = nameText(NAME_MAX).transform(toCodeKey);

const TARGET_SCHEMAS = {
  module: z.object({ module: refText }).strict({ message: 'malformed' }),
  event: z.object({ module: refText, event: refText }).strict({ message: 'malformed' }),
} as const;

export interface ConceptTarget {
  targetKind: ConceptKind;
  target: SpecTargetRef;
  targetKey: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const under = (prefix: readonly string[], errors: FieldError[]): FieldError[] => errors.map((e) => ({ path: [...prefix, ...e.path], code: e.code }));

/** `targetKind` + `target` of a module or event, with the stable key they spell. Shared with the Item subject link. */
export function parseModuleEventTarget(
  raw: Record<string, unknown>,
  prefix: readonly string[] = [],
): { ok: true; value: ConceptTarget } | { ok: false; errors: FieldError[] } {
  const kind = kindEnum(CONCEPT_KINDS).safeParse(raw.targetKind);
  const errors: FieldError[] = kind.success ? [] : [{ path: [...prefix, 'targetKind'], code: raw.targetKind === undefined ? 'required' : 'malformed' }];
  let ref: SpecTargetRef | null = null;
  if (!isRecord(raw.target)) errors.push({ path: [...prefix, 'target'], code: 'required' });
  else if (kind.success) {
    const parsed = TARGET_SCHEMAS[kind.data].safeParse(raw.target);
    if (parsed.success) ref = { kind: kind.data, ...parsed.data } as SpecTargetRef;
    else errors.push(...under([...prefix, 'target'], fieldErrors(parsed.error)));
  }
  const targetKey = ref ? buildTargetKey(ref) : '';
  if (ref && targetKey.length > TARGET_KEY_MAX) errors.push({ path: [...prefix, 'target'], code: 'too_long' });
  if (errors.length > 0 || !ref || !kind.success) return { ok: false, errors };
  return { ok: true, value: { targetKind: kind.data, target: ref, targetKey } };
}

export interface ConceptProposeValue extends ConceptTarget {
  modelId: string;
  conceptId: string | null;
  canonicalLabel: string | null;
  description: string | null;
  relationKind: (typeof CONCEPT_RELATIONS)[number];
  pairWith: (ConceptTarget & { modelId: string }) | null;
}

export function parseConceptPropose(raw: Record<string, unknown>): { ok: true; value: ConceptProposeValue } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const head = z
    .object({
      modelId: uuidText,
      conceptId: uuidText.nullish(),
      canonicalLabel: nameText(NAME_MAX).nullish(),
      description: optionalText(CONCEPT_DESCRIPTION_MAX).optional(),
      relationKind: kindEnum(CONCEPT_RELATIONS).nullish(),
    })
    .safeParse(raw);
  if (!head.success) errors.push(...fieldErrors(head.error));
  const target = parseModuleEventTarget(raw);
  if (!target.ok) errors.push(...target.errors);

  const hasConcept = raw.conceptId !== undefined && raw.conceptId !== null;
  const hasLabel = raw.canonicalLabel !== undefined && raw.canonicalLabel !== null;
  if (hasConcept === hasLabel) errors.push({ path: ['concept'], code: 'required_one' });

  let pairWith: ConceptProposeValue['pairWith'] = null;
  if (raw.pairWith !== undefined && raw.pairWith !== null) {
    if (!isRecord(raw.pairWith)) errors.push({ path: ['pairWith'], code: 'malformed' });
    else {
      const pairModel = uuidText.safeParse(raw.pairWith.modelId);
      if (!pairModel.success) errors.push(...under(['pairWith'], fieldErrors(pairModel.error).map((e) => ({ path: ['modelId'], code: e.code }))));
      const pairTarget = parseModuleEventTarget(raw.pairWith, ['pairWith']);
      if (!pairTarget.ok) errors.push(...pairTarget.errors);
      else if (pairModel.success) {
        pairWith = { ...pairTarget.value, modelId: canonical(pairModel.data) };
        if (target.ok && pairTarget.value.targetKind !== target.value.targetKind) errors.push({ path: ['pairWith', 'targetKind'], code: 'malformed' });
        else if (target.ok && head.success && pairWith.modelId === canonical(head.data.modelId) && pairWith.targetKey === target.value.targetKey) {
          errors.push({ path: ['pairWith'], code: 'same_target' });
        }
      }
    }
  }
  if (errors.length > 0 || !head.success || !target.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...target.value,
      modelId: canonical(head.data.modelId),
      conceptId: head.data.conceptId ? canonical(head.data.conceptId) : null,
      canonicalLabel: head.data.canonicalLabel ?? null,
      description: head.data.description ?? null,
      relationKind: head.data.relationKind ?? 'equivalent',
      pairWith,
    },
  };
}

export function parseConceptConfirm(raw: Record<string, unknown>): { ok: true; value: { mappingId: string } } | { ok: false; errors: FieldError[] } {
  const id = z.object({ mappingId: uuidText }).safeParse(raw);
  return id.success ? { ok: true, value: { mappingId: canonical(id.data.mappingId) } } : { ok: false, errors: fieldErrors(id.error) };
}

export function parseConceptReject(raw: Record<string, unknown>): { ok: true; value: { mappingId: string; reason: string } } | { ok: false; errors: FieldError[] } {
  const parsed = z
    .object({
      mappingId: uuidText,
      reason: bounded(CONCEPT_REJECT_REASON_MAX)
        .refine((v) => v.trim() !== '', { message: 'required' })
        .transform((v) => v.trim()),
    })
    .safeParse(raw);
  return parsed.success
    ? { ok: true, value: { mappingId: canonical(parsed.data.mappingId), reason: parsed.data.reason } }
    : { ok: false, errors: fieldErrors(parsed.error) };
}

export type ConceptOp = 'conceptPropose' | 'conceptConfirm' | 'conceptReject';

export function validateConcept(op: ConceptOp, input: Record<string, unknown>): FieldError[] {
  const parsed = op === 'conceptPropose' ? parseConceptPropose(input) : op === 'conceptConfirm' ? parseConceptConfirm(input) : parseConceptReject(input);
  return parsed.ok ? [] : parsed.errors;
}

export type { SpecTargetKind };
