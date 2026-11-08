// Value checks of the investigation write actions and read params (#1468 b). Pure and DB-free; what needs the database
// (the round, the row, the version) is the handler's. Codes as the other modules: `required`, `malformed`, `too_long`,
// `too_many`, `duplicate`. Filter KEYS are restricted to identifier-like names because the audit row carries the keys
// (never the values): a key can never hold a value or free text.

import { z } from 'zod';

import { requiredText, uuid } from '../../../lib/input/fields.js';
import { unsafeText } from '../../../lib/text-safety.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { type SampleSet, parseSampleSet } from '../../log-lifecycle/index.js';
import { parseHandoff } from './handoff.js';
import { type EvidenceKey, type EvidenceRef, parseEvidenceKey, parseEvidenceRef } from './evidence.js';

export const TITLE_MAX = 200;
export const FILTER_KEYS_MAX = 50;
export const FILTER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
export const FILTER_TEXT_MAX = 500;
export const FILTER_LIST_MAX = 50;
export const ORIGINS = ['standalone', 'round'] as const;

export type Filters = Record<string, string | number | boolean | null | (string | number | boolean | null)[]>;
type Parse<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const err = (path: string[], code: string): { ok: false; errors: FieldError[] } => ({ ok: false, errors: [{ path, code }] });

function scalarOk(v: unknown): boolean {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return !unsafeText(v) && [...v].length <= FILTER_TEXT_MAX;
  return false;
}

/** A filter set: at most 50 identifier-named keys, each a scalar or a list (at most 50) of scalars; no nesting. */
export function parseFilters(raw: unknown): Parse<Filters> {
  if (raw === undefined || raw === null) return err(['filters'], 'required');
  if (!isRecord(raw)) return err(['filters'], 'malformed');
  const keys = Object.keys(raw);
  if (keys.length > FILTER_KEYS_MAX) return err(['filters'], 'too_many');
  const out: Filters = {};
  for (const key of keys) {
    if (!FILTER_KEY_PATTERN.test(key)) return err(['filters', key], 'malformed');
    const value = raw[key];
    if (Array.isArray(value)) {
      if (value.length > FILTER_LIST_MAX) return err(['filters', key], 'too_many');
      if (!value.every(scalarOk)) return err(['filters', key], 'malformed');
      out[key] = value as (string | number | boolean | null)[];
    } else if (scalarOk(value)) {
      out[key] = value as string | number | boolean | null;
    } else {
      return err(['filters', key], 'malformed');
    }
  }
  return { ok: true, value: out };
}

const NON_ENUM = { errorMap: (_i: unknown, ctx: { data: unknown }) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) };

const KNOWN = ['required', 'too_long', 'malformed', 'too_many', 'duplicate'];
function zodErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'required' });
  }
  return out;
}

export const EXPLORER_INPUT_KEYS = {
  investigationCreate: ['title', 'origin', 'sampleSet', 'roundId'],
  investigationUpdate: ['id', 'title', 'filters'],
  evidenceAdd: ['id', 'ref'],
  evidenceRemove: ['id', 'ref'],
  investigationArchive: ['id'],
  evidenceHandoff: ['id', 'refs', 'target'],
} as const;
export type ExplorerOp = keyof typeof EXPLORER_INPUT_KEYS;

export type CreateInput =
  | { title: string; origin: 'standalone'; sampleSet: SampleSet }
  | { title: string; origin: 'round'; roundId: string };

export function parseCreate(input: Record<string, unknown>): Parse<CreateInput> {
  const head = z
    .object({ title: requiredText(TITLE_MAX), origin: z.enum(ORIGINS, NON_ENUM) })
    .safeParse({ title: input.title, origin: input.origin });
  if (!head.success) return { ok: false, errors: zodErrors(head.error) };
  const { title, origin } = head.data;
  if (origin === 'standalone') {
    if (input.roundId !== undefined && input.roundId !== null) return err(['roundId'], 'malformed');
    const set = parseSampleSet(input.sampleSet);
    return set.ok ? { ok: true, value: { title, origin, sampleSet: set.value } } : { ok: false, errors: [...set.errors] };
  }
  if (input.sampleSet !== undefined && input.sampleSet !== null) return err(['sampleSet'], 'malformed');
  const round = uuid.safeParse(input.roundId);
  if (!round.success) return { ok: false, errors: zodErrors(round.error).map((e) => ({ ...e, path: ['roundId'] })) };
  return { ok: true, value: { title, origin, roundId: round.data.toLowerCase() } };
}

export type UpdateInput = { id: string; title?: string; filters?: Filters };

export function parseUpdate(input: Record<string, unknown>): Parse<UpdateInput> {
  const id = uuid.safeParse(input.id);
  if (!id.success) return { ok: false, errors: zodErrors(id.error).map((e) => ({ ...e, path: ['id'] })) };
  const value: UpdateInput = { id: id.data.toLowerCase() };
  if (input.title !== undefined) {
    const title = requiredText(TITLE_MAX).safeParse(input.title);
    if (!title.success) return { ok: false, errors: zodErrors(title.error).map((e) => ({ ...e, path: ['title'] })) };
    value.title = title.data;
  }
  if (input.filters !== undefined) {
    const filters = parseFilters(input.filters);
    if (!filters.ok) return filters;
    value.filters = filters.value;
  }
  if (value.title === undefined && value.filters === undefined) return err(['title'], 'required');
  return { ok: true, value };
}

function parseIdOnly(input: Record<string, unknown>): Parse<{ id: string }> {
  const id = uuid.safeParse(input.id);
  return id.success ? { ok: true, value: { id: id.data.toLowerCase() } } : { ok: false, errors: zodErrors(id.error).map((e) => ({ ...e, path: ['id'] })) };
}
export const parseArchive = parseIdOnly;

export function parseEvidenceAdd(input: Record<string, unknown>): Parse<{ id: string; ref: EvidenceRef }> {
  const id = parseIdOnly(input);
  if (!id.ok) return id;
  const ref = parseEvidenceRef(input.ref);
  return ref.ok ? { ok: true, value: { id: id.value.id, ref: ref.value } } : ref;
}

export function parseEvidenceRemove(input: Record<string, unknown>): Parse<{ id: string; ref: EvidenceKey }> {
  const id = parseIdOnly(input);
  if (!id.ok) return id;
  const ref = parseEvidenceKey(input.ref);
  return ref.ok ? { ok: true, value: { id: id.value.id, ref: ref.value } } : ref;
}

export function validateExplorerInput(op: ExplorerOp, input: Record<string, unknown>): FieldError[] {
  const parsed =
    op === 'investigationCreate'
      ? parseCreate(input)
      : op === 'investigationUpdate'
        ? parseUpdate(input)
        : op === 'evidenceAdd'
          ? parseEvidenceAdd(input)
          : op === 'evidenceRemove'
            ? parseEvidenceRemove(input)
            : op === 'evidenceHandoff'
              ? parseHandoff(input)
              : parseArchive(input);
  return parsed.ok ? [] : parsed.errors;
}
