import { describe, expect, it } from 'vitest';
import { HierarchyFailure, type ApiResponse } from '@ap/contracts';
import { createModelHierarchySource, modelHierarchyCurrentNode } from './hierarchy';

const ok = (data: unknown): ApiResponse<unknown> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'hierarchy' });
describe('model hierarchy Source adapter', () => {
  it('maps children, ancestors and search while forwarding cancellation', async () => {
    const calls: unknown[] = [];
    const source = createModelHierarchySource(async (params, signal) => { calls.push([params, signal]); return ok(params.op === 'ancestors' ? [] : { nodes: [], nextCursor: 'next' }); });
    const signal = new AbortController().signal;
    expect(await source.listChildren({ parentId: null, limit: 2, signal })).toEqual({ nodes: [], nextCursor: 'next' });
    expect(await source.resolveAncestors('v/one', signal)).toEqual([]);
    expect(await source.searchNodes!({ query: '식각', cursor: 'next', signal })).toEqual({ nodes: [], nextCursor: 'next' });
    expect(calls).toEqual([
      [{ op: 'children', parentId: null, limit: 2 }, signal],
      [{ op: 'ancestors', nodeId: 'v/one' }, signal],
      [{ op: 'search', query: '식각', cursor: 'next' }, signal],
    ]);
  });
  it.each(['forbidden', 'deleted', 'error'] as const)('preserves explicit %s failure', async kind => {
    const source = createModelHierarchySource(async () => kind === 'forbidden' ? { ...ok(null), outcome: 'forbidden' } : ok({ failure: kind }));
    await expect(source.listChildren({ parentId: null })).rejects.toMatchObject(new HierarchyFailure(kind));
  });
  it('rejects a late response after cancellation, even if transport ignores the signal', async () => {
    let finish: (value: ApiResponse<unknown>) => void = () => {};
    const source = createModelHierarchySource(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = source.listChildren({ parentId: null, signal: controller.signal });
    controller.abort(); finish(ok({ nodes: [{ id: 'late' }] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

const vendor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const process = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const model = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const software = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const modelNode = `v/${vendor}/p/${process}/m/${model}`;
const current = (menuId: string, page: Record<string, string>) => modelHierarchyCurrentNode({ menuId, params: {}, page: key => page[key] ?? null });
describe('model hierarchy current node from object-only URL keys', () => {
  it.each(['log-model-project', 'log-model-round'])('marks the model or SW placement on %s', menu => {
    expect(current(menu, { node: modelNode })).toBe(modelNode);
    expect(current(menu, { node: `${modelNode}/s/${software}` })).toBe(`${modelNode}/s/${software}`);
    expect(current(menu, { node: `v/${vendor}/p/none/m/${model}` })).toBe(`v/${vendor}/p/none/m/${model}`);
    expect(current(menu, {})).toBeNull();
  });
  it.each(['', `v/${vendor}`, `v/${vendor}/p/${process}`, `${modelNode}/s/label`, `${modelNode}/s/${software}/extra`, `v/${vendor}/p/식각/m/${model}`, `${modelNode}?q=label`])('rejects malformed or incomplete project node %s', node => {
    expect(current('log-model-project', { node })).toBeNull();
  });
  it('restores list placements including unassigned models and ignores node outside hidden routes', () => {
    expect(current('log-models', { vendorId: vendor, processId: process, modelId: model })).toBe(modelNode);
    expect(current('log-models', { vendorId: vendor, processId: 'none', modelId: model })).toBe(`v/${vendor}/p/none/m/${model}`);
    expect(current('log-models', { vendorId: vendor })).toBe(`v/${vendor}`);
    expect(current('log-models', { vendorId: vendor, processId: process })).toBe(`v/${vendor}/p/${process}`);
    expect(current('log-models', { modelId: model })).toBeNull();
    expect(current('log-validation-requests', { node: modelNode })).toBeNull();
  });
});
