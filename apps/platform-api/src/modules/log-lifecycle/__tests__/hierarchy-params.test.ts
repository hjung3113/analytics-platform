import { describe, expect, it } from 'vitest';
import { parseHierarchyParams } from '../domain/hierarchy-params.js';

const vendor = 'v/11111111-1111-4111-8111-111111111111';
describe('hierarchy params (#1449)', () => {
  it('defaults to 50 and clamps positive integer limits to 200', () => {
    expect(parseHierarchyParams({ op: 'children' })).toEqual({ ok: true, value: { op: 'children', parentId: null, limit: 50 } });
    expect(parseHierarchyParams({ op: 'search', query: '한빛', limit: 500 })).toMatchObject({ ok: true, value: { limit: 200 } });
    expect(parseHierarchyParams({ op: 'ancestors', nodeId: `${vendor}/p/none/m/22222222-2222-4222-8222-222222222222` }).ok).toBe(true);
  });
  it.each([
    {}, { op: 'other' }, { op: 'children', limit: 0 }, { op: 'children', limit: 1.2 },
    { op: 'children', limit: '50' }, { op: 'children', parentId: 'bad' },
    { op: 'children', nodeId: vendor }, { op: 'ancestors' }, { op: 'ancestors', nodeId: vendor, limit: 2 },
    { op: 'ancestors', nodeId: vendor, cursor: 'x' }, { op: 'search', query: '' },
    { op: 'search', query: 'x', parentId: vendor }, { op: 'search', query: 'x'.repeat(201) },
    { op: 'children', workspaceId: 'foreign' }, { op: 'children', cursor: '' },
  ])('refuses malformed or cross-operation params: %j', params => {
    expect(parseHierarchyParams(params).ok).toBe(false);
  });
});
