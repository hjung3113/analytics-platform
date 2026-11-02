import { DATE_OPS, ENUM_OPS, INSTANT_OPS, NUMBER_OPS, TEXT_OPS, validateFilters, type ColumnFilter, type ColumnFilterSpec } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { columnFilterSchema, columnFilterSpecSchema, toJsonSchema } from './index.ts';
import { DATE_FILTER_OPS, ENUM_FILTER_OPS, INSTANT_FILTER_OPS, NUMBER_FILTER_OPS, TEXT_FILTER_OPS } from './vocab.ts';

describe('column filter schema agrees with @ap/contracts (ADR-0105)', () => {
  it('operator lists equal the contracts lists', () => {
    expect([...TEXT_FILTER_OPS]).toEqual([...TEXT_OPS]);
    expect([...NUMBER_FILTER_OPS]).toEqual([...NUMBER_OPS]);
    expect([...DATE_FILTER_OPS]).toEqual([...DATE_OPS]);
    expect([...INSTANT_FILTER_OPS]).toEqual([...INSTANT_OPS]);
    expect([...ENUM_FILTER_OPS]).toEqual([...ENUM_OPS]);
  });

  // One valid sample per (kind, op); the Zod schema and validateFilters must both accept it.
  const cases: [ColumnFilterSpec, ColumnFilter][] = [
    ...TEXT_OPS.map((op): [ColumnFilterSpec, ColumnFilter] => [{ kind: 'text' }, op === 'isEmpty' || op === 'isNotEmpty' ? { id: 'f', op } : { id: 'f', op, value: 'x' }]),
    ...NUMBER_OPS.map((op): [ColumnFilterSpec, ColumnFilter] => [{ kind: 'number' }, op === 'isEmpty' || op === 'isNotEmpty' ? { id: 'f', op } : op === 'between' ? { id: 'f', op, value: [1, 2] } : { id: 'f', op, value: 1 }]),
    ...DATE_OPS.map((op): [ColumnFilterSpec, ColumnFilter] => [{ kind: 'date' }, op === 'isEmpty' || op === 'isNotEmpty' ? { id: 'f', op } : op === 'between' ? { id: 'f', op, value: { from: '2026-01-01' } } : { id: 'f', op, value: '2026-01-01' }]),
    ...INSTANT_OPS.map((op): [ColumnFilterSpec, ColumnFilter] => [{ kind: 'instant' }, op === 'between' ? { id: 'f', op, value: { to: '2026-01-01T00:00:00Z' } } : { id: 'f', op }]),
    ...ENUM_OPS.map((op): [ColumnFilterSpec, ColumnFilter] => [{ kind: 'enum', options: [{ value: 'a', label: 'A' }] }, op === 'isEmpty' || op === 'isNotEmpty' ? { id: 'f', op } : { id: 'f', op, value: ['a'] }]),
  ];
  it.each(cases)('accepts %j / %j in both', (spec, filter) => {
    expect(columnFilterSchema.safeParse(filter).success).toBe(true);
    expect(columnFilterSpecSchema.safeParse(spec).success).toBe(true);
    expect(validateFilters([filter], { f: spec })).toEqual({ ok: true });
  });

  it.each<[string, unknown]>([
    ['unknown operator', { id: 'f', op: 'like', value: 'x' }],
    ['colon in id', { id: 'a:b', op: 'isEmpty' }],
    ['value on isEmpty', { id: 'f', op: 'isEmpty', value: 1 }],
    ['string for a number op', { id: 'f', op: 'gt', value: '1' }],
    ['empty in list', { id: 'f', op: 'in', value: [] }],
    ['date not YYYY-MM-DD', { id: 'f', op: 'after', value: '2026-1-1' }],
    ['extra key', { id: 'f', op: 'isEmpty', extra: 1 }],
  ])('rejects %s', (_name, filter) => expect(columnFilterSchema.safeParse(filter).success).toBe(false));

  it('spec pieces: caseSensitive/multiple are literal flags, ops must belong to the kind', () => {
    expect(columnFilterSpecSchema.safeParse({ kind: 'text', caseSensitive: true, requires: ['t'] }).success).toBe(true);
    expect(columnFilterSpecSchema.safeParse({ kind: 'text', caseSensitive: false }).success).toBe(false);
    expect(columnFilterSpecSchema.safeParse({ kind: 'enum', options: [], multiple: false, ops: ['in'] }).success).toBe(true);
    expect(columnFilterSpecSchema.safeParse({ kind: 'enum', options: [], multiple: true }).success).toBe(false);
    expect(columnFilterSpecSchema.safeParse({ kind: 'number', ops: ['contains'] }).success).toBe(false);
  });

  it('enum cell is scalar | many; other kinds do not take it', () => {
    expect(columnFilterSpecSchema.safeParse({ kind: 'enum', options: [], cell: 'many' }).success).toBe(true);
    expect(columnFilterSpecSchema.safeParse({ kind: 'enum', options: [], cell: 'scalar' }).success).toBe(true);
    expect(columnFilterSpecSchema.safeParse({ kind: 'enum', options: [], cell: 'list' }).success).toBe(false);
    expect(columnFilterSpecSchema.safeParse({ kind: 'text', cell: 'many' }).success).toBe(false);
  });

  it('the emitted JSON Schema closes the number tuple: exactly two items', () => {
    const branches = (toJsonSchema(columnFilterSchema).anyOf as { properties: { value: Record<string, unknown> } }[]).map(b => b.properties.value);
    const tuple = branches.find(v => Array.isArray(v.prefixItems));
    expect(tuple).toEqual({ type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], minItems: 2, maxItems: 2, items: false });
  });

  it.each<[string, unknown]>([
    ['empty tuple', []],
    ['one number', [1]],
    ['three numbers', [1, 2, 3]],
    ['non-number member', [1, 'x']],
  ])('number between rejects %s in the Zod source', (_name, value) => {
    expect(columnFilterSchema.safeParse({ id: 'n', op: 'between', value }).success).toBe(false);
  });
});
