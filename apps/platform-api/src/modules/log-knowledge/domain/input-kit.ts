// Zod building blocks shared by the log-knowledge action inputs that spell spec targets (spec change #1196 c,
// concept mapping and Item subject #1196 e/f). Pure; the value rules (codes `required`, `too_long`, `malformed`)
// live here once so the two parsers cannot drift. Other log-knowledge inputs keep their own copies for now (backlog).

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../platform-port/text-safety.js';
import { NAME_MAX, toCodeKey } from './code-key.js';
import { normalizeSpecName } from './spec-input.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are accepted in any spelling and always handled in the DB's lower-case. */
export const canonical = (v: string): string => v.toLowerCase();
const REQUIRED = { required_error: 'required', invalid_type_error: 'required' };
const length = (value: string): number => [...value].length;
export const uuidText = z.string(REQUIRED).refine((v) => UUID.test(v), { message: 'malformed' });
export const bounded = (max: number) =>
  z.string(REQUIRED).superRefine((value, ctx) => {
    if (unsafeText(value)) ctx.addIssue({ code: 'custom', message: 'malformed' });
    else if (length(value) > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
  });
export const nameText = (max: number) =>
  bounded(max)
    .refine((v) => normalizeSpecName(v) !== '', { message: 'required' })
    .transform(normalizeSpecName);
export const optionalText = (max: number) =>
  bounded(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));
export const kindEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
/** A module / event key spelling, normalised like every spec target (`toCodeKey`). */
export const refText = nameText(NAME_MAX).transform(toCodeKey);

/** The module and event target shapes (a change also targets fields and relations; see `spec-change-input.ts`). */
export const MODULE_EVENT_TARGET_SCHEMAS = {
  module: z.object({ module: refText }).strict({ message: 'malformed' }),
  event: z.object({ module: refText, event: refText }).strict({ message: 'malformed' }),
} as const;

export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const under = (prefix: readonly string[], errors: FieldError[]): FieldError[] => errors.map((e) => ({ path: [...prefix, ...e.path], code: e.code }));
