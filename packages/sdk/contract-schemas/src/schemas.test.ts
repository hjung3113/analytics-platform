import { describe, expect, it } from 'vitest';
import { apiResponseSchema, assessmentSchema, endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema, toJsonSchema, trustSchema } from './index.ts';
import { z } from 'zod/v4';
import { contextCapabilitySchema } from './menu-query.ts';
import { CONTEXT_KEYS } from './vocab.ts';

const trust = { updatedAt: '2026-10-28T09:00:00+09:00', dataThrough: null, coverage: null, provisional: false, source: 'mes' };

describe('Trust (06 §18)', () => {
  it('accepts an instant with offset or Z and nullable dataThrough/coverage', () => {
    expect(trustSchema.safeParse(trust).success).toBe(true);
    expect(trustSchema.safeParse({ ...trust, updatedAt: '2026-10-28T00:00:00Z', dataThrough: '2026-10-27T23:59:59Z', coverage: 0.5 }).success).toBe(true);
  });

  it('rejects a wall-clock updatedAt (no offset)', () => {
    expect(trustSchema.safeParse({ ...trust, updatedAt: '2026-10-28T09:00:00' }).success).toBe(false);
  });

  it.each([
    ['empty list', []],
    ['duplicate versions', ['v1', 'v1']],
    ['empty string', ['']],
  ])('rejects sourceLogicVersions with %s', (_name, sourceLogicVersions) => {
    expect(trustSchema.safeParse({ ...trust, sourceLogicVersions }).success).toBe(false);
  });

  it('accepts distinct non-empty versions and the field omitted', () => {
    expect(trustSchema.safeParse({ ...trust, sourceLogicVersions: ['v1', 'v2'] }).success).toBe(true);
  });

  it('JSON Schema carries the same constraint', () => {
    const versions = (toJsonSchema(trustSchema).properties as Record<string, Record<string, unknown>>).sourceLogicVersions;
    expect(versions).toMatchObject({ type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } });
  });
});

describe('Assessment and ApiResponse', () => {
  it('rejects an unknown kind', () => {
    expect(assessmentSchema.safeParse({ kind: 'nope', state: 'clear' }).success).toBe(false);
  });

  it('ApiResponse requires data (null allowed) and takes the data schema', () => {
    const schema = apiResponseSchema(z.array(z.number()));
    const base = { outcome: 'ok', assessments: [], trust: null, correlationId: 'c1' };
    expect(schema.safeParse({ ...base, data: [1] }).success).toBe(true);
    expect(schema.safeParse({ ...base, data: null }).success).toBe(true);
    expect(schema.safeParse({ ...base, data: ['x'] }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(false);
  });
});

describe('MenuQuery context', () => {
  it('wall-clock from/to: no Z, offset, fraction or date-only', () => {
    expect(menuQueryContextSchema.safeParse({ from: '2026-10-28T00:00:00', to: null }).success).toBe(true);
    for (const from of ['2026-10-28', '2026-10-28T00:00:00Z', '2026-10-28T00:00:00+09:00', '2026-10-28T00:00:00.5']) {
      expect(menuQueryContextSchema.safeParse({ from }).success).toBe(false);
    }
  });

  it('every field is optional and null is distinct from an empty set', () => {
    expect(menuQueryContextSchema.safeParse({}).success).toBe(true);
    expect(menuQueryContextSchema.safeParse({ roomNames: [], lineNames: null, condition: { axis: ['a'] }, membershipBasis: 'asOf' }).success).toBe(true);
    expect(menuQueryContextSchema.safeParse({ membershipBasis: 'other' }).success).toBe(false);
  });

  const SET_KEYS = ['roomNames', 'lineNames', 'prcGroups', 'selection', 'lotIds', 'recipeIds'] as const;

  it.each(SET_KEYS)('%s: rejects duplicate, blank and whitespace-only IDs; keeps null, [] and untrimmed IDs', (key) => {
    const ok = (value: unknown) => menuQueryContextSchema.safeParse({ [key]: value }).success;
    expect(ok(['b', 'a'])).toBe(true);
    expect(ok([])).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok([' a ', 'A', 'a'])).toBe(true);
    expect(ok(['b', 'b'])).toBe(false);
    expect(ok([''])).toBe(false);
    expect(ok(['\u3000 \t'])).toBe(false);
    expect(ok(['\ud800'])).toBe(false);
  });

  it.each(SET_KEYS)('%s: JSON Schema carries uniqueItems and non-blank item pattern', (key) => {
    const props = toJsonSchema(menuQueryContextSchema).properties as Record<string, { anyOf: Record<string, unknown>[] }>;
    const array = props[key].anyOf.find((branch) => branch.type === 'array');
    expect(array).toMatchObject({ uniqueItems: true, items: { type: 'string', pattern: expect.any(String) } });
    const pattern = new RegExp((array!.items as { pattern: string }).pattern);
    expect(pattern.test('a')).toBe(true);
    expect(pattern.test(' a ')).toBe(true);
    expect(pattern.test('')).toBe(false);
    expect(pattern.test(' \u00a0\u2003\u3000')).toBe(false);
  });

  it('condition: non-empty map of non-empty, distinct, non-blank value lists', () => {
    const ok = (condition: unknown) => menuQueryContextSchema.safeParse({ condition }).success;
    expect(ok({ maker: ['a', 'b'], model: ['x'] })).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok({ maker: [] })).toBe(false);
    expect(ok({ maker: [''] })).toBe(false);
    expect(ok({ maker: ['a', 'a'] })).toBe(false);
    expect(ok({ '': ['a'] })).toBe(false);
    expect(ok({})).toBe(false);
  });

  it('condition: JSON Schema carries the same constraints', () => {
    const props = toJsonSchema(menuQueryContextSchema).properties as Record<string, { anyOf: Record<string, unknown>[] }>;
    const map = props.condition.anyOf.find((branch) => branch.type === 'object');
    expect(map).toMatchObject({
      minProperties: 1,
      propertyNames: { type: 'string', pattern: expect.any(String) },
      additionalProperties: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: expect.any(String) } },
    });
  });

  it('MenuQuery takes any params; the artifact lists the key as required', () => {
    expect(menuQuerySchema.safeParse({ endpoint: 'a.b', context: {}, params: null }).success).toBe(true);
    expect(toJsonSchema(menuQuerySchema).required).toEqual(['endpoint', 'context', 'params']);
  });
});

describe('endpoint declaration', () => {
  const base = { id: 'a.b', menuId: 'm', paramKeys: ['x'], permission: 'analytics:view', requiresScope: true, context: { time: 'apply' }, kinds: ['collection'], mergeTimeDomain: false };

  it('accepts a declaration and rejects `unsupported` as a declared capability', () => {
    expect(endpointDeclarationSchema.safeParse(base).success).toBe(true);
    expect(endpointDeclarationSchema.safeParse({ ...base, context: { time: 'unsupported' } }).success).toBe(false);
  });

  it('capability vocabulary is exactly apply and reference, in runtime and artifact', () => {
    expect(contextCapabilitySchema.options).toEqual(['apply', 'reference']);
    const context = (toJsonSchema(endpointDeclarationSchema).properties as Record<string, { properties: Record<string, unknown> }>).context;
    expect(Object.values(context.properties)).toEqual(CONTEXT_KEYS.map(() => ({ type: 'string', enum: ['apply', 'reference'] })));
  });

  it('rejects an unknown assessment kind; the artifact forbids unknown keys', () => {
    expect(endpointDeclarationSchema.safeParse({ ...base, kinds: ['nope'] }).success).toBe(false);
    expect(toJsonSchema(endpointDeclarationSchema)).toMatchObject({ additionalProperties: false });
  });
});

describe('JSON Schema export', () => {
  it('is 2020-12 and integers would carry safe-integer bounds', () => {
    expect(toJsonSchema(trustSchema).$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(toJsonSchema(z.number().int())).toMatchObject({ type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 });
  });
});
