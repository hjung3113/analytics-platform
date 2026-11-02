import { describe, expect, it } from 'vitest';

import { PAGE_SIZE_MAX, Q_MAX, logKnowledgeContribution, parseListParams } from '../catalog-endpoints.js';
import { MODEL_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS } from '../repositories/catalog-read.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const parse = (params: Record<string, unknown>) =>
  parseListParams(params, MODEL_SORT_IDS, ['vendorId', 'processId']);

describe('parseListParams', () => {
  it('takes defaults for absent keys', () => {
    expect(parse({})).toMatchObject({
      ok: true,
      value: { q: null, status: 'active', page: 0, pageSize: 50, sorting: [{ id: 'code', desc: false }], vendorId: null, processId: null },
    });
  });

  it('accepts a full valid set', () => {
    const result = parse({
      q: 'ab',
      status: 'all',
      page: 2,
      pageSize: PAGE_SIZE_MAX,
      sorting: [{ id: 'vendorName', desc: true }],
      vendorId: UUID,
      processId: null,
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['q is a number', { q: 3 }],
    ['q is too long', { q: 'a'.repeat(Q_MAX + 1) }],
    ['q has a NUL', { q: 'a\u0000b' }],
    ['unknown status', { status: 'deleted' }],
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
    ['vendorId not a uuid', { vendorId: 'abc' }],
    ['processId a number', { processId: 7 }],
  ])('refuses: %s', (_name, params) => {
    expect(parse(params).ok).toBe(false);
  });

  it('each endpoint accepts only its own sort columns', () => {
    expect(parseListParams({ sorting: [{ id: 'softwareCount', desc: false }] }, VENDOR_SORT_IDS, []).ok).toBe(false);
    expect(parseListParams({ sorting: [{ id: 'versionLabel', desc: true }] }, SOFTWARE_SORT_IDS, ['modelId']).ok).toBe(true);
  });
});

describe('logKnowledgeContribution declarations', () => {
  const endpoints = logKnowledgeContribution({ db: {} as never, checkService: {} as never }).endpoints ?? [];

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
    ['logKnowledge.models', ['q', 'status', 'page', 'pageSize', 'sorting', 'vendorId', 'processId']],
    ['logKnowledge.softwareVersions', ['q', 'status', 'page', 'pageSize', 'sorting', 'modelId']],
    ['logKnowledge.vendors', ['q', 'status', 'page', 'pageSize', 'sorting']],
    ['logKnowledge.processes', ['q', 'status', 'page', 'pageSize', 'sorting']],
  ])('%s allow-lists exactly its params', (id, keys) => {
    expect(endpoints.find((e) => e.spec.id === id)?.spec.paramKeys).toEqual(keys);
  });

  it('validate refuses an invalid value instead of answering empty', () => {
    const models = endpoints.find((e) => e.spec.id === 'logKnowledge.models');
    expect(models?.validate({ status: 'nope' })).toMatchObject({ ok: false });
    expect(models?.validate({})).toEqual({ ok: true });
  });
});
