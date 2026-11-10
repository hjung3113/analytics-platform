import { beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, emptyGlobal, groupId, type ColumnFilter, type FieldError, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, setRole, type AnyMockAction } from '@ap/mock-server';
import { SPEC_PUBLISH_PERMISSION, modelSpecEndpointSpecs, specActionSpecs, CATALOG_MANAGE_PERMISSION, ITEM_PUBLISH_PERMISSION, LOG_KNOWLEDGE_MODELS_MENU_ID, catalogActionSpecs, catalogEndpointSpecs, itemActionSpecs, importApply, importCancel, importDetailEndpoint, importPaste, importResolve, importValidate, itemEndpointSpecs, modelEndpointSpecs, searchEndpointSpecs, topViewActionSpecs, topViewEndpointSpecs } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog } from './index';

type Row = Record<string, unknown>;
type Params = { q?: string | null; page?: number; pageSize?: number; sorting?: { id: string; desc: boolean }[]; filters?: ColumnFilter[] };
const endpoint = (id: string) => logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${id}`)!;
const judge = (id: string, params: Params) => endpoint(id).validate?.({ context: emptyGlobal, params }) ?? null;
const read = (id: string, params: Params = {}) => {
  expect(judge(id, params)).toBeNull();
  return endpoint(id).handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' }) as { rows: Row[]; total: number };
};
const codes = (id: string, params: Params = {}) => read(id, params).rows.map(r => r.code);
const flt = (id: string, op: string, value?: unknown) => ({ id, op, ...(value === undefined ? {} : { value }) }) as ColumnFilter;

const action = (id: string): AnyMockAction => logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${id}`)!;
const errors = (id: string, input: Row): string[] => (action(id).validate?.(input) ?? []).map((e: FieldError) => `${e.path.join('.')}:${e.code}`);
const run = (id: string, input: Row) => {
  expect(action(id).validate?.(input) ?? []).toEqual([]);
  return action(id).handle({ input, actor: 'admin', scopeId: null }) as { data: Row; version: string };
};
const idOf = (id: string, code: string) => read(id, { pageSize: 200 }).rows.find(r => r.code === code)!.id as string;

beforeEach(resetCatalog);

describe('seed ids (the app conformance test addresses them by sequence)', () => {
  it('vendors 1-3, processes 4-7, models 8-13, software 14-17 in the documented order', () => {
    const uuid = (kind: number, n: number) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
    expect(idOf('vendors', 'ALPHA')).toBe(uuid(1, 1));
    expect(idOf('processes', 'ETCH')).toBe(uuid(2, 4));
    expect(idOf('models', 'A-100')).toBe(uuid(3, 8));
    expect(read('softwareVersions').rows.find(r => r.code === 'v1.0')!.id).toBe(uuid(4, 14));
  });
});

describe('catalog reads speak the table filter model', () => {
  it('answers every row without an active condition (the screen pins its own default)', () => {
    expect(codes('vendors')).toEqual(['ALPHA', 'BETA', 'GAMMA']);
    expect(codes('vendors', { filters: [] })).toEqual(['ALPHA', 'BETA', 'GAMMA']);
  });

  it.each([
    ['in [true]', flt('active', 'in', ['true']), ['ALPHA', 'BETA']],
    ['in [false]', flt('active', 'in', ['false']), ['GAMMA']],
    ['notIn [true]', flt('active', 'notIn', ['true']), ['GAMMA']],
    ['notIn [false]', flt('active', 'notIn', ['false']), ['ALPHA', 'BETA']],
  ])('active %s', (_n, filter, expected) => {
    expect(codes('vendors', { filters: [filter] })).toEqual(expected);
  });

  it('models: vendorId in / notIn, processes in / notIn / isEmpty / isNotEmpty over the array cell', () => {
    const alpha = idOf('vendors', 'ALPHA');
    const etch = idOf('processes', 'ETCH');
    const dep = idOf('processes', 'DEP');
    expect(codes('models', { filters: [flt('vendorId', 'in', [alpha])] })).toEqual(['A-100', 'A-200']);
    expect(codes('models', { filters: [flt('vendorId', 'notIn', [alpha])] })).toEqual(['B-10', 'B-20', 'B-30', 'G-1']);
    expect(codes('models', { filters: [flt('processes', 'in', [etch, dep])] })).toEqual(['A-100', 'A-200', 'B-30']);
    expect(read('models', { filters: [flt('processes', 'in', [etch, dep])] }).total).toBe(3);
    // at least one process AND none of the values: unmapped models are excluded
    expect(codes('models', { filters: [flt('processes', 'notIn', [dep])] })).toEqual(['A-200', 'B-10']);
    expect(codes('models', { filters: [flt('processes', 'isEmpty')] })).toEqual(['B-20', 'G-1']);
    expect(codes('models', { filters: [flt('processes', 'isNotEmpty'), flt('active', 'in', ['true'])] })).toEqual(['A-100', 'A-200', 'B-10']);
  });

  it('softwareVersions: releaseOrder is the registration order inside the model and a sort column', () => {
    const a100 = idOf('models', 'A-100');
    const byOrder = (desc: boolean) => read('softwareVersions', { filters: [flt('modelId', 'in', [a100])], sorting: [{ id: 'releaseOrder', desc }] }).rows.map(r => [r.code, r.releaseOrder]);
    expect(byOrder(false)).toEqual([['v1.0', 1], ['v2.0', 2]]);
    expect(byOrder(true)).toEqual([['v2.0', 2], ['v1.0', 1]]);
    expect(read('softwareVersions').rows.map(r => r.releaseOrder)).toEqual([1, 1, 2, 1]);
  });

  it('softwareVersions: modelId filter, the original label as code', () => {
    const a100 = idOf('models', 'A-100');
    expect(codes('softwareVersions', { filters: [flt('modelId', 'in', [a100])] })).toEqual(['v1.0', 'v2.0']);
    expect(read('softwareVersions').total).toBe(4);
  });

  it('id filter resolves exactly the rows asked for on every read', () => {
    const a100 = idOf('models', 'A-100');
    expect(codes('models', { filters: [flt('id', 'in', [a100])] })).toEqual(['A-100']);
    expect(codes('vendors', { filters: [flt('id', 'in', [idOf('vendors', 'BETA'), idOf('vendors', 'ALPHA')])] })).toEqual(['ALPHA', 'BETA']);
    expect(codes('processes', { filters: [flt('id', 'in', [idOf('processes', 'ETCH')])] })).toEqual(['ETCH']);
    expect(codes('softwareVersions', { filters: [flt('id', 'in', [a100])] })).toEqual([]);
    expect(codes('models', { filters: [flt('id', 'in', ['00000000-0000-4000-8000-00000000ffff'])] })).toEqual([]);
  });

  it('matches uuid filter values case-insensitively (the server compares uuid columns)', () => {
    const upper = (id: string) => id.toUpperCase();
    const a100 = idOf('models', 'A-100');
    const etch = idOf('processes', 'ETCH');
    expect(codes('softwareVersions', { filters: [flt('modelId', 'in', [upper(a100)])] })).toEqual(['v1.0', 'v2.0']);
    expect(codes('models', { filters: [flt('processes', 'in', [upper(etch)])] })).toEqual(codes('models', { filters: [flt('processes', 'in', [etch])] }));
    expect(codes('models', { filters: [flt('vendorId', 'notIn', [upper(idOf('vendors', 'ALPHA'))])] })).toEqual(['B-10', 'B-20', 'B-30', 'G-1']);
  });

  it('q matches the code key by prefix (width/case-insensitive) and the name by contains', () => {
    expect(codes('vendors', { q: 'alpha' })).toEqual(['ALPHA']);
    expect(codes('vendors', { q: 'SYSTEMS' })).toEqual(['BETA']);
    expect(codes('vendors', { q: '   ' })).toHaveLength(3);
  });

  it('pages with a total and sorts with an id tie-break', () => {
    const first = read('models', { page: 0, pageSize: 4, sorting: [{ id: 'active', desc: true }] });
    const second = read('models', { page: 1, pageSize: 4, sorting: [{ id: 'active', desc: true }] });
    expect(first.total).toBe(6);
    expect([...first.rows, ...second.rows].map(r => r.code)).toEqual(['A-100', 'A-200', 'B-10', 'B-20', 'B-30', 'G-1']);
    expect(read('models', { sorting: [{ id: 'vendorName', desc: true }] }).rows[0]!.code).toBe('G-1');
  });

  it('row shapes carry counts, vendor name and mapped processes', () => {
    expect(read('vendors').rows[0]).toMatchObject({ code: 'ALPHA', modelCount: 2, version: '1', active: true });
    const a100 = read('models').rows[0]!;
    expect(a100).toMatchObject({ code: 'A-100', vendorName: 'Alpha Semicap', softwareCount: 2, latestSoftwareLabel: 'v2.0' });
    expect(a100.processes).toEqual([{ id: idOf('processes', 'DEP'), name: 'Deposition' }, { id: idOf('processes', 'ETCH'), name: 'Etch' }]);
    expect(read('softwareVersions').rows[0]).toMatchObject({ versionLabel: 'v1.0', code: 'v1.0' });
  });

  it.each([
    ['unknown field', 'vendors', { filters: [flt('codeKey', 'in', ['x'])] }],
    ['field of another read', 'vendors', { filters: [flt('vendorId', 'in', ['00000001-0000-4000-8000-000000000001'])] }],
    ['operator outside the field ops', 'models', { filters: [flt('vendorId', 'isEmpty')] }],
    ['duplicate field', 'vendors', { filters: [flt('active', 'in', ['true']), flt('active', 'notIn', ['false'])] }],
    ['two values on active (multiple: false)', 'vendors', { filters: [flt('active', 'in', ['true', 'false'])] }],
    ['active value not true/false', 'vendors', { filters: [flt('active', 'in', ['yes'])] }],
    ['id value not a uuid', 'models', { filters: [flt('vendorId', 'in', ['x'])] }],
    ['sort off the whitelist', 'vendors', { sorting: [{ id: 'codeKey', desc: false }] }],
    ['pageSize over the bound', 'vendors', { pageSize: 201 }],
    ['negative page', 'vendors', { page: -1 }],
    ['extra property on a filter', 'vendors', { filters: [{ ...flt('active', 'in', ['true']), extra: 1 }] }],
    ['extra property on a sort key', 'vendors', { sorting: [{ id: 'code', desc: false, extra: 1 }] }],
  ])('refuses %s instead of answering an empty page', (_n, id, params) => {
    expect(judge(id, params as Params)).toEqual(expect.any(String));
  });
});

describe('catalog writes mirror the server rules', () => {
  it('creates a vendor with a version of 1, visible in the read, with a duplicate refused whatever the typed form', () => {
    const created = run('vendorCreate', { code: ' delta ', name: 'Delta' });
    expect(created).toMatchObject({ data: { code: ' delta ', name: 'Delta', active: true, version: '1' }, version: '1' });
    expect(codes('vendors').includes(' delta ')).toBe(true);
    expect(errors('vendorCreate', { code: 'DELTA', name: 'again' })).toEqual(['code:duplicate']);
    expect(errors('vendorCreate', { code: 'ｄｅｌｔａ', name: 'wide' })).toEqual(['code:duplicate']);
  });

  it.each([
    ['blank code', { code: '  ', name: 'x' }, ['code:required']],
    ['missing name', { code: 'x' }, ['name:required']],
    ['code too long', { code: 'x'.repeat(65), name: 'x' }, ['code:too_long']],
    ['NUL in the name', { code: 'x', name: 'a\u0000b' }, ['name:malformed']],
  ])('vendorCreate value error: %s', (_n, input, expected) => {
    expect(errors('vendorCreate', input)).toEqual(expected);
  });

  it('a model needs an active vendor and known, active processes; the same code under another vendor is allowed', () => {
    const alpha = idOf('vendors', 'ALPHA');
    const gamma = idOf('vendors', 'GAMMA');
    const litho = idOf('processes', 'LITHO');
    const unknown = '00000001-0000-4000-8000-0000000000ff';
    expect(errors('modelCreate', { vendorId: unknown, code: 'N1', name: 'n', processIds: [] })).toEqual(['vendorId:not_found']);
    expect(errors('modelCreate', { vendorId: gamma, code: 'N1', name: 'n', processIds: [] })).toEqual(['vendorId:inactive']);
    expect(errors('modelCreate', { vendorId: alpha, code: 'N1', name: 'n', processIds: [litho, unknown] })).toEqual(['processIds.0:inactive', 'processIds.1:not_found']);
    expect(errors('modelCreate', { vendorId: alpha, code: 'a-100', name: 'dup', processIds: [] })).toEqual(['code:duplicate']);
    expect(errors('modelCreate', { vendorId: idOf('vendors', 'BETA'), code: 'A-100', name: 'other vendor', processIds: [] })).toEqual([]);
    expect(errors('modelCreate', { vendorId: alpha, code: 'N1', name: 'n', processIds: [litho, litho] })).toEqual(['processIds.1:duplicate']);
  });

  it('a model update replaces its processes and bumps the version; an inactive process may stay but not be added', () => {
    const a100 = idOf('models', 'A-100');
    const cmp = idOf('processes', 'CMP');
    const litho = idOf('processes', 'LITHO');
    const input = { id: a100, code: 'A-100', name: 'Alpha 100 v2', processIds: [cmp] };
    expect(action('modelUpdate').version?.({ input, actor: 'admin', scopeId: null })).toBe('1');
    expect(run('modelUpdate', input)).toMatchObject({ data: { name: 'Alpha 100 v2', version: '2' }, version: '2' });
    expect(read('models').rows[0]!.processes).toEqual([{ id: cmp, name: 'Planarization' }]);
    expect(errors('modelUpdate', { ...input, processIds: [cmp, litho] })).toEqual(['processIds.1:inactive']);
  });

  it('an update to an unknown id is not_found for the version handler; renaming onto another row is a duplicate', () => {
    const unknown = '00000002-0000-4000-8000-0000000000ff';
    expect(action('vendorUpdate').version?.({ input: { id: unknown }, actor: 'admin', scopeId: null })).toBeNull();
    expect(errors('vendorUpdate', { id: unknown, code: 'x', name: 'x' })).toEqual([]);
    expect(errors('vendorUpdate', { id: idOf('vendors', 'BETA'), code: 'alpha', name: 'x' })).toEqual(['code:duplicate']);
    expect(errors('vendorUpdate', { id: idOf('vendors', 'BETA'), code: 'beta', name: 'x' })).toEqual([]);
  });

  it('set-active toggles without a cascade, and the same value changes nothing', () => {
    const alpha = idOf('vendors', 'ALPHA');
    const off = run('vendorSetActive', { id: alpha, active: false });
    expect(off).toMatchObject({ data: { active: false, version: '2' }, version: '2' });
    expect(read('models', { filters: [flt('vendorId', 'in', [alpha]), flt('active', 'in', ['true'])] }).total).toBe(2);
    expect(run('vendorSetActive', { id: alpha, active: false }).version).toBe('2');
    expect(run('vendorSetActive', { id: alpha, active: true }).version).toBe('3');
  });

  it('a software version needs an active model; its label is unique per model', () => {
    const a100 = idOf('models', 'A-100');
    expect(errors('softwareCreate', { modelId: a100, versionLabel: 'V1.0', name: '' })).toEqual(['versionLabel:duplicate']);
    expect(errors('softwareCreate', { modelId: idOf('models', 'B-30'), versionLabel: 'v9', name: '' })).toEqual(['modelId:inactive']);
    expect(run('softwareCreate', { modelId: a100, versionLabel: 'v9', name: '' }).data).toMatchObject({ code: 'v9', version: '1' });
  });
});

describe('registration with the mock adapter', () => {
  const menu = (id: string, permission: string, requiresScope = false) =>
    ({
      id, group: groupId('logKnowledge'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path: `/${id}`, permission, requiresScope,
      context: {}, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
    }) as unknown as MenuMeta;
  const adapter = () => createMockAdapter({
    endpoints: logKnowledgeMock, actions: logKnowledgeActionsMock,
    registry: { menus: [menu('log-knowledge-catalog', CATALOG_MANAGE_PERMISSION), menu(LOG_KNOWLEDGE_MODELS_MENU_ID, 'platform:view'), menu('log-knowledge-items', 'platform:view'), menu('log-knowledge-search', 'platform:view'), menu('home', 'platform:view')] },
    permissions: [...KERNEL_PERMISSIONS, CATALOG_MANAGE_PERMISSION, ITEM_PUBLISH_PERMISSION, SPEC_PUBLISH_PERMISSION],
  });

  it('registers the reads, the twelve catalog writes, the five item writes and the five import wizard actions and read, and the spec reads and writes (importMap stays API-only) (menu, permission and invalidates are valid)', () => {
    expect(() => adapter()).not.toThrow();
    expect(logKnowledgeMock.map(e => e.spec)).toEqual([...searchEndpointSpecs, ...catalogEndpointSpecs, ...modelEndpointSpecs, ...modelSpecEndpointSpecs, ...itemEndpointSpecs, importDetailEndpoint, ...topViewEndpointSpecs]);
    expect(logKnowledgeActionsMock.map(a => a.spec)).toEqual([...catalogActionSpecs, ...specActionSpecs, ...itemActionSpecs, importPaste, importValidate, importResolve, importCancel, importApply, ...topViewActionSpecs]);
  });

  it.each([['vendors'], ['processes'], ['models'], ['softwareVersions']])('%s: a query with no match answers ok with an empty page, like the server', async id => {
    const result = await adapter().menuQuery({ endpoint: `logKnowledge.${id}`, context: {}, params: { q: 'no-such-row-anywhere', page: 0, pageSize: 10, sorting: [], filters: [] } });
    expect(result).toMatchObject({ outcome: 'ok', data: { rows: [], total: 0 } });
  });

  it('a viewer and an engineer lack the write permission (forbidden); an admin writes', async () => {
    const a = adapter();
    const req = { action: 'logKnowledge.vendorCreate', context: {}, input: { code: 'NEWV', name: 'New' }, idempotencyKey: '3f2b8a40-6c1e-4d5a-9b7e-1a2b3c4d5e6f' };
    setRole('viewer');
    expect((await a.menuAction(req)).outcome).toBe('forbidden');
    setRole('engineer');
    expect((await a.menuAction(req)).outcome).toBe('forbidden');
    setRole('admin');
    expect((await a.menuAction(req)).outcome).toBe('ok');
    setRole('engineer');
  });
});
