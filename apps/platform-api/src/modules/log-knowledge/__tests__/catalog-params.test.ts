import { describe, expect, it } from 'vitest';

import { PAGE_SIZE_MAX, Q_MAX, logKnowledgeContribution, parseListParams } from '../catalog-endpoints.js';
import { CATALOG_FILTER_SPECS } from '../domain/catalog-filters.js';
import { MODEL_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS } from '../repositories/catalog-read.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const parse = (params: Record<string, unknown>) =>
  parseListParams(params, MODEL_SORT_IDS, CATALOG_FILTER_SPECS.models);

describe('parseListParams', () => {
  it('takes defaults for absent keys', () => {
    expect(parse({})).toMatchObject({
      ok: true,
      value: { q: null, page: 0, pageSize: 50, sorting: [{ id: 'code', desc: false }], conditions: {} },
    });
  });

  it('accepts a full valid set', () => {
    const result = parse({
      q: 'ab',
      page: 2,
      pageSize: PAGE_SIZE_MAX,
      sorting: [{ id: 'vendorName', desc: true }],
      filters: [
        { id: 'active', op: 'in', value: ['true'] },
        { id: 'vendorId', op: 'notIn', value: [UUID] },
        { id: 'processes', op: 'isEmpty' },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        conditions: {
          active: { op: 'in', values: ['true'] },
          vendorId: { op: 'notIn', values: [UUID] },
          processes: { op: 'isEmpty', values: [] },
        },
      },
    });
  });

  it.each([
    ['q is a number', { q: 3 }],
    ['q is too long', { q: 'a'.repeat(Q_MAX + 1) }],
    ['q has a NUL', { q: 'a\u0000b' }],
    ['the removed status param shape', { filters: 'active' }],
    ['negative page', { page: -1 }],
    ['fractional page', { page: 1.5 }],
    ['string page', { page: '1' }],
    ['pageSize 0', { pageSize: 0 }],
    ['pageSize over the bound', { pageSize: PAGE_SIZE_MAX + 1 }],
    ['sorting not a list', { sorting: 'code' }],
    ['too many sort keys', { sorting: ['code', 'name', 'active', 'createdAt'].map((id) => ({ id, desc: false })) }],
    ['sort column off the whitelist', { sorting: [{ id: 'passwordHash', desc: false }] }],
    ['sort key with an extra field', { sorting: [{ id: 'code', desc: false, x: 1 }] }],
    ['sort desc not boolean', { sorting: [{ id: 'code', desc: 'yes' }] }],
    ['the same column twice', { sorting: [{ id: 'code', desc: false }, { id: 'code', desc: true }] }],
    ['explicit null filters', { filters: null }],
    ['explicit null page', { page: null }],
    ['explicit null pageSize', { pageSize: null }],
    ['explicit null sorting', { sorting: null }],
    ['unknown field', { filters: [{ id: 'codeKey', op: 'in', value: ['x'] }] }],
    ['field of another endpoint', { filters: [{ id: 'modelId', op: 'in', value: [UUID] }] }],
    ['operator outside the field ops', { filters: [{ id: 'active', op: 'isEmpty' }] }],
    ['text operator on an enum', { filters: [{ id: 'vendorId', op: 'contains', value: 'a' }] }],
    ['two conditions on one field', { filters: [{ id: 'active', op: 'in', value: ['true'] }, { id: 'active', op: 'notIn', value: ['false'] }] }],
    ['active with two values (multiple: false)', { filters: [{ id: 'active', op: 'in', value: ['true', 'false'] }] }],
    ['active value not true/false', { filters: [{ id: 'active', op: 'in', value: ['yes'] }] }],
    ['active value a boolean, not a string', { filters: [{ id: 'active', op: 'in', value: [true] }] }],
    ['vendorId not a uuid', { filters: [{ id: 'vendorId', op: 'in', value: ['abc'] }] }],
    ['in with no values', { filters: [{ id: 'vendorId', op: 'in', value: [] }] }],
    ['in with a scalar value', { filters: [{ id: 'vendorId', op: 'in', value: UUID }] }],
    ['isEmpty with a value', { filters: [{ id: 'processes', op: 'isEmpty', value: [UUID] }] }],
    ['a filter with an extra key', { filters: [{ id: 'active', op: 'in', value: ['true'], x: 1 }] }],
    ['a filter that is not an object', { filters: ['active'] }],
    ['id with a colon', { filters: [{ id: 'active:x', op: 'in', value: ['true'] }] }],
    ['inherited property name as a field', { filters: [{ id: 'constructor', op: 'in', value: ['x'] }] }],
  ])('refuses: %s', (_name, params) => {
    expect(parse(params).ok).toBe(false);
  });

  it('accepts null as "no search" for q, and an empty or absent filters as no condition', () => {
    expect(parse({ q: null })).toMatchObject({ ok: true, value: { q: null, conditions: {} } });
    expect(parse({ filters: [] })).toMatchObject({ ok: true, value: { conditions: {} } });
  });

  it.each([
    ['isNotEmpty', { id: 'processes', op: 'isNotEmpty' }],
    ['in on the array cell', { id: 'processes', op: 'in', value: [UUID] }],
    ['notIn on the array cell', { id: 'processes', op: 'notIn', value: [UUID, UUID.replace('3', '4')] }],
  ])('models: processes accepts %s', (_name, filter) => {
    expect(parse({ filters: [filter] }).ok).toBe(true);
  });

  it('the removed bespoke params are no longer filters', () => {
    // paramKeys no longer carry them (the dispatcher refuses an unlisted key); the parser ignores them,
    // so the only way to filter is `filters`.
    expect(parse({ filters: [{ id: 'status', op: 'in', value: ['active'] }] }).ok).toBe(false);
  });

  it('each endpoint accepts only its own sort columns', () => {
    expect(parseListParams({ sorting: [{ id: 'softwareCount', desc: false }] }, VENDOR_SORT_IDS, CATALOG_FILTER_SPECS.vendors).ok).toBe(false);
    expect(parseListParams({ sorting: [{ id: 'versionLabel', desc: true }] }, SOFTWARE_SORT_IDS, CATALOG_FILTER_SPECS.softwareVersions).ok).toBe(true);
  });
});

describe('logKnowledgeContribution declarations', () => {
  const endpoints = logKnowledgeContribution({ db: {} as never, checkService: {} as never }).endpoints?.filter(
    (e) => e.spec.menuId === 'log-knowledge-catalog' && !e.spec.id.startsWith('logKnowledge.import'),
  ) ?? [];

  it('declares the four reads under the owning menu with platform:view', () => {
    expect(endpoints.map((e) => e.spec.id)).toEqual([
      'logKnowledge.vendors',
      'logKnowledge.processes',
      'logKnowledge.models',
      'logKnowledge.softwareVersions',
    ]);
    for (const e of endpoints) {
      expect(e.spec).toMatchObject({ menuId: 'log-knowledge-catalog', permission: 'platform:view', requiresScope: false, mergeTimeDomain: false });
      expect(e.spec.context).toEqual({});
    }
  });

  it.each([
    ['logKnowledge.models', ['q', 'page', 'pageSize', 'sorting', 'filters']],
    ['logKnowledge.softwareVersions', ['q', 'page', 'pageSize', 'sorting', 'filters']],
    ['logKnowledge.vendors', ['q', 'page', 'pageSize', 'sorting', 'filters']],
    ['logKnowledge.processes', ['q', 'page', 'pageSize', 'sorting', 'filters']],
  ])('%s allow-lists exactly its params', (id, keys) => {
    expect(endpoints.find((e) => e.spec.id === id)?.spec.paramKeys).toEqual(keys);
  });

  it('validate refuses an invalid value instead of answering empty', () => {
    const models = endpoints.find((e) => e.spec.id === 'logKnowledge.models');
    expect(models?.validate({ filters: [{ id: 'active', op: 'in', value: ['nope'] }] })).toMatchObject({ ok: false });
    expect(models?.validate({})).toEqual({ ok: true });
  });
});
