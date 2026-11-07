// Zod building blocks shared by the log-knowledge action inputs that spell spec targets (spec change #1196 c,
// concept mapping and Item subject #1196 e/f). Pure; the value rules (codes `required`, `too_long`, `malformed`)
// and the uuid spelling live in `src/lib/input/fields.ts` (#1411) once, so no log-knowledge input keeps a copy.
// What remains here is this module's own spelling of the shared pieces: normalised spec-target names and the
// target schemas.

import { z } from 'zod';

import { bounded, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { NAME_MAX, toCodeKey } from './code-key.js';
import { normalizeSpecName } from './spec-input.js';

/** Ids are accepted in any spelling and always handled in the DB's lower-case. */
export const canonical = (v: string): string => v.toLowerCase();
export { bounded, uuid as uuidText };
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
