import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal, type ColumnFilter } from '@ap/contracts';
import { logKnowledgeMock, resetCatalog } from './index';
import { modelProfile } from './models';

type Row = Record<string, unknown>;
type Params = { q?: string | null; page?: number; pageSize?: number; sorting?: { id: string; desc: boolean }[]; filters?: ColumnFilter[] };
const endpoint = (id: string) => logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${id}`)!;
const judge = (id: string, params: unknown) => endpoint(id).validate?.({ context: emptyGlobal, params }) ?? null;
const run = (id: string, params: unknown) => endpoint(id).handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' });
const explore = (params: Params = {}) => {
  expect(judge('exploreModels', params)).toBeNull();
  return run('exploreModels', params) as { rows: Row[]; total: number };
};
const idOf = (code: string) => explore({ pageSize: 200 }).rows.find(r => r.code === code)!.id as string;

beforeEach(resetCatalog);

describe('logKnowledge.exploreModels', () => {
  it('answers the models rows with a modelItemCount (0 without an item store)', () => {
    const { rows, total } = explore({ sorting: [{ id: 'code', desc: false }] });
    expect(total).toBe(6);
    expect(rows.map(r => r.code)).toEqual(['A-100', 'A-200', 'B-10', 'B-20', 'B-30', 'G-1']);
    expect(rows[0]).toMatchObject({ vendorName: 'Alpha Semicap', softwareCount: 2, latestSoftwareLabel: 'v2.0', modelItemCount: 0 });
    expect(rows.every(r => r.modelItemCount === 0)).toBe(true);
  });

  it('filters, searches and sorts like the models read', () => {
    expect(explore({ filters: [{ id: 'active', op: 'in', value: ['true'] }] }).total).toBe(4);
    expect(explore({ q: 'beta' }).rows.map(r => r.code)).toEqual(['B-10', 'B-20', 'B-30']);
    expect(explore({ sorting: [{ id: 'name', desc: true }], pageSize: 2 }).rows.map(r => r.code)).toEqual(['G-1', 'B-30']);
    expect(explore({ filters: [{ id: 'processes', op: 'isEmpty' }] }).rows.map(r => r.code)).toEqual(['B-20', 'G-1']);
  });

  it('refuses what the models read refuses', () => {
    expect(judge('exploreModels', { pageSize: 201 })).toMatch(/pageSize/);
    expect(judge('exploreModels', { sorting: [{ id: 'modelItemCount', desc: false }] })).toMatch(/not supported/);
    expect(judge('exploreModels', { filters: [{ id: 'bogus', op: 'in', value: ['x'] }] })).toMatch(/invalid filter/);
  });
});

describe('logKnowledge.modelProfile', () => {
  it('answers model, vendor, processes, every software version newest first, and the model item count', () => {
    const profile = run('modelProfile', { modelId: idOf('A-100') }) as NonNullable<ReturnType<typeof modelProfile>>;
    expect(profile.model).toMatchObject({ code: 'A-100', name: 'Alpha 100', active: true, vendor: { code: 'ALPHA', name: 'Alpha Semicap', active: true } });
    expect(profile.model.processes.map(p => p.name)).toEqual(['Deposition', 'Etch']);
    expect(profile.softwareVersions.map(s => s.versionLabel)).toEqual(['v2.0', 'v1.0']);
    expect(profile.softwareVersions[0]).toMatchObject({ name: 'Major', active: true, itemCount: 0 });
    expect(profile).toMatchObject({ truncated: false, modelItems: { total: 0 } });
  });

  it('lists inactive versions and a model without versions or processes', () => {
    expect(modelProfile(idOf('B-10'))!.softwareVersions).toEqual([expect.objectContaining({ versionLabel: 'v3.1', active: false })]);
    expect(modelProfile(idOf('B-20'))).toMatchObject({ softwareVersions: [], model: { processes: [] } });
    expect(modelProfile(idOf('G-1'))!.model.vendor.active).toBe(false);
  });

  it('answers null for an unknown id and for an id of another kind, and refuses a non-uuid', () => {
    expect(run('modelProfile', { modelId: '00000003-0000-4000-8000-0000000000ff' })).toBeNull();
    expect(run('modelProfile', { modelId: '00000001-0000-4000-8000-000000000001' })).toBeNull();
    expect(judge('modelProfile', { modelId: 'nope' })).toMatch(/uuid/);
    expect(judge('modelProfile', {})).toMatch(/uuid/);
  });
});
