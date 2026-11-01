import { z } from 'zod/v4';
import { DATE_FILTER_OPS, ENUM_FILTER_OPS, INSTANT_FILTER_OPS, NUMBER_FILTER_OPS, TEXT_FILTER_OPS } from './vocab.ts';

// The shared table-filter wire shape (ADR-0105): `ColumnFilter` is what a client sends in `filters`, `ColumnFilterSpec` is
// what a server declares per field. Semantics (blank values, negated operators excluding blanks, case folding, date and
// instant range ends) live in the contracts' column-filters.ts header and real-server-checklist; JSON Schema carries the
// shape only. Which operators a given field accepts, `requires` and `multiple: false` are enforced by the server with the
// field's spec, not by this schema.

/** Field id: non-empty, no `:` (the URL codec splits on it). */
const fieldId = z.string().regex(/^[^:]+$/);
const opOf = <T extends readonly [string, ...string[]]>(ops: T) => z.enum(ops);
/** Wall-clock `YYYY-MM-DD` (06 §6.3). Calendar validity is a runtime check. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** `from` inclusive, `to` exclusive; either may be absent. Date fields: `YYYY-MM-DD`; instant fields: ISO instants. */
const range = z.strictObject({ from: z.string().optional(), to: z.string().optional() });

export const columnFilterSchema = z.union([
  z.strictObject({ id: fieldId, op: z.enum(['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals']), value: z.string() }),
  z.strictObject({ id: fieldId, op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']), value: z.number() }),
  z.strictObject({ id: fieldId, op: z.literal('between'), value: z.tuple([z.number(), z.number()]) }),
  z.strictObject({ id: fieldId, op: z.literal('between'), value: range }),
  z.strictObject({ id: fieldId, op: z.enum(['before', 'after']), value: day }),
  z.strictObject({ id: fieldId, op: z.enum(['in', 'notIn']), value: z.array(z.string()).min(1) }),
  z.strictObject({ id: fieldId, op: z.enum(['isEmpty', 'isNotEmpty']) }),
]);

const requires = z.array(fieldId).optional();
const optionSchema = z.strictObject({ value: z.string(), label: z.string() });

export const columnFilterSpecSchema = z.union([
  z.strictObject({ kind: z.literal('text'), ops: z.array(opOf(TEXT_FILTER_OPS)).optional(), caseSensitive: z.literal(true).optional(), requires }),
  z.strictObject({ kind: z.literal('number'), ops: z.array(opOf(NUMBER_FILTER_OPS)).optional(), requires }),
  z.strictObject({ kind: z.literal('date'), ops: z.array(opOf(DATE_FILTER_OPS)).optional(), requires }),
  z.strictObject({ kind: z.literal('instant'), ops: z.array(opOf(INSTANT_FILTER_OPS)).optional(), requires }),
  z.strictObject({ kind: z.literal('enum'), options: z.array(optionSchema), ops: z.array(opOf(ENUM_FILTER_OPS)).optional(), multiple: z.literal(false).optional(), requires }),
]);
