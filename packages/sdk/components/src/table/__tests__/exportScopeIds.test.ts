import { describe, expect, it } from 'vitest';
import { exportScopeIds, type TableExportRequest } from '../useTableSelection';

// #556c: how an exportRows helper reads request.scope — exclusions must survive, and `all` must never read as the ids / whole-result mode.
describe('exportScopeIds', () => {
  const read = (scope: TableExportRequest['scope']) => exportScopeIds(scope);

  it('selected → ids mode with that list', () => {
    expect(read({ kind: 'selected', ids: ['a', 'b'] })).toEqual({ mode: 'ids', ids: ['a', 'b'] });
  });

  it('filtered → ids mode with null (every filtered row)', () => {
    expect(read({ kind: 'filtered' })).toEqual({ mode: 'ids', ids: null });
  });

  it('all → all-except mode that keeps the non-empty exclusions', () => {
    expect(read({ kind: 'all', excludedIds: ['x', 'y'] })).toEqual({ mode: 'all-except', excludedIds: ['x', 'y'] });
  });
});
