// Value checks and normalisation of the model spec write actions (#1196 b1, ADR-0111, design v0.6 §15.5). Pure and
// DB-free. One zod schema per action, shared by the engine's `validate`, the handler (which parses again for the
// typed, normalised value) and the tests. What only the database can judge (unknown model, an open draft, a state)
// is the handler's. Codes: `required`, `too_long`, `malformed`, `too_large` (call caps), `duplicate`, `not_found`
// (dangling reference), `cycle`, `rows_or_text` (a save carries exactly one of rows or text, #1196 b2).
//
// Names are normalised at SAVE: NFC, trimmed, inner whitespace collapsed. Keys are `toCodeKey` of the name; a
// reference (parent module, relation end) is a name or key, resolved through `toCodeKey` too.

import { z } from 'zod';

import { REQUIRED, bounded, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../../lib/text-safety.js';
import { NAME_MAX, toCodeKey } from './code-key.js';

export const SPEC_SCHEMA_VERSION = 1;
export const SPEC_FIELD_TYPES = ['string', 'int', 'float', 'bool', 'enum', 'timestamp'] as const;
export const SPEC_ROWS_MAX = 2000;
export const SPEC_BODY_MAX_BYTES = 512 * 1024;
export const REJECT_REASON_MAX = 500;
const TEXT_MAX = 2000;
const PREDICATE_MAX = 100;
const FIELDS_MAX = 200;
const ALLOWED_VALUES_MAX = 200;
const LINK_MAX = 2000;

/** Names: NFC, trimmed, inner whitespace runs collapsed to one space. */
export const normalizeSpecName = (value: string): string => value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** A required name: normalised, non-blank. */
const nameText = (max: number) =>
  bounded(max)
    .refine((v) => normalizeSpecName(v) !== '', { message: 'required' })
    .transform(normalizeSpecName);

/** An optional free text: absent, null or blank → null; otherwise trimmed. */
const optionalText = (max: number) =>
  bounded(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));

/** A reference to a module or event: a name or key; resolved with `toCodeKey`. */
const refText = nameText(NAME_MAX).transform(toCodeKey);

export const specFieldSchema = z
  .object({
    name: nameText(NAME_MAX),
    type: z.enum(SPEC_FIELD_TYPES, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    unit: optionalText(100).optional(),
    allowedValues: z.array(nameText(NAME_MAX), REQUIRED).max(ALLOWED_VALUES_MAX, { message: 'too_long' }).optional(),
    description: bounded(TEXT_MAX).transform((v) => v.trim()),
  })
  .strict({ message: 'malformed' });
export type SpecField = z.infer<typeof specFieldSchema>;

/** The stored shape of a field: no undefined keys, `null` units dropped (the closed v1 schema has no null). */
export function storedField(field: SpecField): Record<string, unknown> {
  const out: Record<string, unknown> = { name: field.name, type: field.type, description: field.description };
  if (field.unit) out.unit = field.unit;
  if (field.allowedValues !== undefined) out.allowedValues = field.allowedValues;
  return out;
}

const moduleRow = z
  .object({ name: nameText(NAME_MAX), parentModule: refText.nullish() })
  .strict({ message: 'malformed' });
const eventRow = z
  .object({
    module: refText,
    name: nameText(NAME_MAX),
    fields: z.array(specFieldSchema, REQUIRED).max(FIELDS_MAX, { message: 'too_long' }).nullish(),
    triggerRule: optionalText(TEXT_MAX).optional(),
    detailDocRef: optionalText(TEXT_MAX).optional(),
  })
  .strict({ message: 'malformed' });
const relationRow = z
  .object({
    sourceModule: refText,
    sourceEvent: refText,
    predicate: nameText(PREDICATE_MAX),
    targetModule: refText,
    targetEvent: refText,
    ruleRef: optionalText(TEXT_MAX).optional(),
  })
  .strict({ message: 'malformed' });

/** The one row schema per TSV `kind` (#1196 b2): the TSV parser validates each parsed row with these, so text and
 *  structured calls converge on identical rows (design §15.5). */
export const SPEC_ROW_SCHEMAS = { module: moduleRow, event: eventRow, relation: relationRow } as const;

export const sourceDocRefSchema = z
  .object({
    docLabel: nameText(NAME_MAX),
    docVersion: nameText(NAME_MAX),
    link: bounded(LINK_MAX)
      .optional()
      .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim())),
  })
  .strict({ message: 'malformed' })
  .transform((v): SourceDocRef => (v.link === undefined ? { docLabel: v.docLabel, docVersion: v.docVersion } : { docLabel: v.docLabel, docVersion: v.docVersion, link: v.link }));
export interface SourceDocRef {
  docLabel: string;
  docVersion: string;
  link?: string;
}

const rows = <T extends z.ZodTypeAny>(row: T) => z.array(row, REQUIRED).max(SPEC_ROWS_MAX, { message: 'too_large' }).nullish().transform((v) => v ?? []);

export const SPEC_INPUT_SCHEMAS = {
  draftCreate: z.object({ modelId: uuid, sourceDocRef: sourceDocRefSchema }),
  draftSave: z.object({
    revisionId: uuid,
    mode: z.enum(['append', 'replace'], { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    sourceDocRef: sourceDocRefSchema.optional(),
    modules: rows(moduleRow),
    events: rows(eventRow),
    relations: rows(relationRow),
    // #1196 b2: the text input (TSV of a .txt file or pasted text) — exactly one of rows or text per call.
    format: z.enum(['tsv', 'paste'], { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }).optional(),
    text: z
      .string(REQUIRED)
      .superRefine((value, ctx) => {
        if (unsafeText(value)) ctx.addIssue({ code: 'custom', message: 'malformed' });
      })
      .optional(),
  }),
  publish: z.object({ revisionId: uuid }),
  reject: z.object({
    revisionId: uuid,
    reason: bounded(REJECT_REASON_MAX)
      .refine((v) => v.trim() !== '', { message: 'required' })
      .transform((v) => v.trim()),
  }),
} as const;

export type SpecOp = keyof typeof SPEC_INPUT_SCHEMAS;
export type SpecInput<Op extends SpecOp> = z.infer<(typeof SPEC_INPUT_SCHEMAS)[Op]>;

const KNOWN = ['required', 'too_long', 'malformed', 'too_large'];
export function fieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : issue.code === 'unrecognized_keys' ? 'malformed' : 'required' });
  }
  return out;
}
export function parseSpecInput<Op extends SpecOp>(
  op: Op,
  input: Record<string, unknown>,
): { ok: true; value: SpecInput<Op> } | { ok: false; errors: FieldError[] } {
  if (op === 'draftSave') {
    if (typeof input.text === 'string') {
      // A text call is capped on the text itself: the JSON envelope would inflate every tab (#1196 b2).
      if (new TextEncoder().encode(input.text).length > SPEC_BODY_MAX_BYTES) {
        return { ok: false, errors: [{ path: ['input'], code: 'too_large' }] };
      }
    } else {
      // The body cap is judged on the raw input first: a larger spec streams in several calls.
      if (new TextEncoder().encode(JSON.stringify(input)).length > SPEC_BODY_MAX_BYTES) {
        return { ok: false, errors: [{ path: ['input'], code: 'too_large' }] };
      }
      const count = ['modules', 'events', 'relations'].reduce((n, k) => n + (Array.isArray(input[k]) ? (input[k] as unknown[]).length : 0), 0);
      if (count > SPEC_ROWS_MAX) return { ok: false, errors: [{ path: ['input'], code: 'too_large' }] };
    }
  }
  const parsed = SPEC_INPUT_SCHEMAS[op].safeParse(input);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (op === 'draftSave') {
    // #1196 b2: exactly one of structured rows (a non-empty array) or text; `format` names the text's provenance.
    const data = parsed.data as SpecInput<'draftSave'>; // `op` names the schema that produced it
    const hasRows = data.modules.length > 0 || data.events.length > 0 || data.relations.length > 0;
    const hasText = data.text !== undefined;
    if (hasRows === hasText) return { ok: false, errors: [{ path: ['input'], code: 'rows_or_text' }] };
    if (hasText && data.format === undefined) return { ok: false, errors: [{ path: ['format'], code: 'required' }] };
    if (!hasText && data.format !== undefined) return { ok: false, errors: [{ path: ['text'], code: 'required' }] };
  }
  return { ok: true, value: parsed.data as SpecInput<Op> };
}

export function validateSpecInput(op: SpecOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseSpecInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}

// ---- dependency planning of one save call ------------------------------------------------------------------------

export type ModuleRowInput = z.infer<typeof moduleRow>;
export type EventRowInput = z.infer<typeof eventRow>;
export type RelationRowInput = z.infer<typeof relationRow>;

/** What the draft already holds, by key. */
export interface DraftIndex {
  moduleKeys: ReadonlySet<string>;
  /** `qualifiedKey(moduleKey, eventKey)` */
  eventKeys: ReadonlySet<string>;
  /** `relationEdgeKey(source, predicate, target)` of every relation the draft already stores. */
  relationEdges: ReadonlySet<string>;
}
export const qualifiedKey = (moduleKey: string, eventKey: string): string => `${moduleKey}\u0000${eventKey}`;
/** The stored identity of a relation edge: the columns of `spec_event_relation_edge_uq`, by key. */
export const relationEdgeKey = (source: string, predicate: string, target: string): string => `${source}\u0001${predicate}\u0001${target}`;

export interface PlannedModule {
  index: number;
  key: string;
  name: string;
  parentKey: string | null;
  depth: number;
}
export interface PlannedEvent {
  index: number;
  moduleKey: string;
  key: string;
  name: string;
  fields: Record<string, unknown>[];
  triggerRule: string | null;
  detailDocRef: string | null;
}
export interface PlannedRelation {
  index: number;
  sourceModule: string;
  sourceEvent: string;
  predicate: string;
  targetModule: string;
  targetEvent: string;
  ruleRef: string | null;
}

export type SpecPlan =
  | { ok: true; modules: PlannedModule[]; events: PlannedEvent[]; relations: PlannedRelation[] }
  | { ok: false; errors: FieldError[] };

const at = (list: string, index: number, field: string): string[] => [list, String(index), field];

/**
 * Orders one call's rows for insertion (modules by parent depth, then events, then relations) and judges every
 * reference: a parent module or relation end must be in the draft already or elsewhere in the same call; a
 * qualified key is unique across draft and call; modules must not form a cycle. Errors are row-numbered (0-based).
 */
export function planSpecRows(
  draft: DraftIndex,
  input: { modules: ModuleRowInput[]; events: EventRowInput[]; relations: RelationRowInput[] },
): SpecPlan {
  const errors: FieldError[] = [];

  const callModules = new Map<string, { index: number; parentKey: string | null }>();
  input.modules.forEach((m, index) => {
    const key = toCodeKey(m.name);
    if (draft.moduleKeys.has(key) || callModules.has(key)) errors.push({ path: at('modules', index, 'name'), code: 'duplicate' });
    else callModules.set(key, { index, parentKey: m.parentModule ?? null });
  });
  const moduleKnown = (key: string) => draft.moduleKeys.has(key) || callModules.has(key);

  // Parent references; depth over the call's own modules (a parent already in the draft is depth 0).
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (key: string): number | 'cycle' => {
    const known = depth.get(key);
    if (known !== undefined) return known;
    const mod = callModules.get(key);
    if (!mod || mod.parentKey === null || !callModules.has(mod.parentKey)) {
      depth.set(key, 0);
      return 0;
    }
    if (visiting.has(key)) return 'cycle';
    visiting.add(key);
    const parent = depthOf(mod.parentKey);
    visiting.delete(key);
    if (parent === 'cycle') return 'cycle';
    depth.set(key, parent + 1);
    return parent + 1;
  };
  const planned: PlannedModule[] = [];
  input.modules.forEach((m, index) => {
    const key = toCodeKey(m.name);
    const mod = callModules.get(key);
    if (!mod || mod.index !== index) return; // a duplicate, already reported
    if (mod.parentKey !== null && !moduleKnown(mod.parentKey)) {
      errors.push({ path: at('modules', index, 'parentModule'), code: 'not_found' });
      return;
    }
    if (mod.parentKey === key) {
      errors.push({ path: at('modules', index, 'parentModule'), code: 'cycle' });
      return;
    }
    const d = depthOf(key);
    if (d === 'cycle') {
      errors.push({ path: at('modules', index, 'parentModule'), code: 'cycle' });
      return;
    }
    planned.push({ index, key, name: m.name, parentKey: mod.parentKey, depth: d });
  });
  planned.sort((a, b) => a.depth - b.depth || a.index - b.index);

  const callEvents = new Set<string>();
  const plannedEvents: PlannedEvent[] = [];
  input.events.forEach((e, index) => {
    const key = toCodeKey(e.name);
    if (!moduleKnown(e.module)) {
      errors.push({ path: at('events', index, 'module'), code: 'not_found' });
      return;
    }
    const q = qualifiedKey(e.module, key);
    if (draft.eventKeys.has(q) || callEvents.has(q)) {
      errors.push({ path: at('events', index, 'name'), code: 'duplicate' });
      return;
    }
    callEvents.add(q);
    plannedEvents.push({
      index,
      moduleKey: e.module,
      key,
      name: e.name,
      fields: (e.fields ?? []).map(storedField),
      triggerRule: e.triggerRule ?? null,
      detailDocRef: e.detailDocRef ?? null,
    });
  });
  const eventKnown = (q: string) => draft.eventKeys.has(q) || callEvents.has(q);

  const seenEdges = new Set<string>();
  const plannedRelations: PlannedRelation[] = [];
  input.relations.forEach((r, index) => {
    const source = qualifiedKey(r.sourceModule, r.sourceEvent);
    const target = qualifiedKey(r.targetModule, r.targetEvent);
    let ok = true;
    if (!eventKnown(source)) {
      errors.push({ path: at('relations', index, 'sourceEvent'), code: 'not_found' });
      ok = false;
    }
    if (!eventKnown(target)) {
      errors.push({ path: at('relations', index, 'targetEvent'), code: 'not_found' });
      ok = false;
    }
    if (!ok) return;
    if (source === target) {
      errors.push({ path: at('relations', index, 'targetEvent'), code: 'malformed' });
      return;
    }
    const edge = relationEdgeKey(source, r.predicate, target);
    // An edge the draft stores would die on `spec_event_relation_edge_uq` at insert time; report it here instead.
    if (seenEdges.has(edge) || draft.relationEdges.has(edge)) {
      errors.push({ path: at('relations', index, 'predicate'), code: 'duplicate' });
      return;
    }
    seenEdges.add(edge);
    plannedRelations.push({
      index,
      sourceModule: r.sourceModule,
      sourceEvent: r.sourceEvent,
      predicate: r.predicate,
      targetModule: r.targetModule,
      targetEvent: r.targetEvent,
      ruleRef: r.ruleRef ?? null,
    });
  });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, modules: planned, events: plannedEvents, relations: plannedRelations };
}
