import { describe, expect, it } from 'vitest';

import { type CatalogFilterFieldSpec, parseCatalogFilters } from '../catalog-filters.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const SPECS: Record<string, CatalogFilterFieldSpec> = {
  note: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'text', maxLength: 10 },
  wide: { ops: ['in'], multiple: true, cell: 'scalar', values: 'text' },
  who: { ops: ['in'], multiple: true, cell: 'scalar', values: 'uuid', literals: ['me'] },
  plain: { ops: ['in'], multiple: true, cell: 'scalar', values: 'uuid' },
};
const parse = (id: string, value: unknown[], op = 'in') => parseCatalogFilters([{ id, op, value }], SPECS);

describe('text filter values', () => {
  it('accepts non-blank text up to the cap and keeps it verbatim', () => {
    expect(parse('note', ['abc', 'x'.repeat(10)])).toEqual({
      ok: true,
      value: { note: { op: 'in', values: ['abc', 'x'.repeat(10)] } },
    });
  });

  it('defaults the cap to 200 characters', () => {
    expect(parse('wide', ['x'.repeat(200)]).ok).toBe(true);
    expect(parse('wide', ['x'.repeat(201)]).ok).toBe(false);
  });

  it.each([
    ['blank', ['  ']],
    ['empty', ['']],
    ['over the field cap', ['x'.repeat(11)]],
    ['a NUL', ['a\u0000b']],
    ['a lone surrogate', ['a\ud800']],
    ['not a string', [5]],
  ])('refuses %s', (_name, value) => {
    expect(parse('note', value as unknown[]).ok).toBe(false);
  });
});

describe('uuid fields with literals', () => {
  it('accepts the declared literal next to uuids', () => {
    expect(parse('who', ['me', UUID]).ok).toBe(true);
  });
  it('refuses other words, and any literal where none is declared', () => {
    expect(parse('who', ['you']).ok).toBe(false);
    expect(parse('plain', ['me']).ok).toBe(false);
  });
});
