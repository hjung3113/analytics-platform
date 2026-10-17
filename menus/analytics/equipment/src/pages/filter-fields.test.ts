import { describe, expect, it, vi } from 'vitest';
import { equipmentPageFilterFields } from './filter-fields';

describe('equipment PageFilterBar draft fields (#54, ADR-0037)', () => {
  it('shows the draft values and edits only the draft', () => {
    const set = vi.fn();
    const setPage = vi.fn();
    const fields = equipmentPageFilterFields({
      values: { q: 'PHO', status: '', maker: 'ZZZ' }, set, makers: ['ACME', 'ZZZ'], lang: 'ko',
    });
    const q = fields.find(field => field.key === 'q');
    const status = fields.find(field => field.key === 'status');
    const maker = fields.find(field => field.key === 'maker');
    expect(q?.kind).toBe('search');
    expect(status?.kind).toBe('select');
    expect(maker?.kind).toBe('select');
    if (q?.kind !== 'search' || status?.kind !== 'select' || maker?.kind !== 'select') throw new Error('Expected equipment filter field kinds');

    expect([q.value, status.value, maker.value]).toEqual(['PHO', '', 'ZZZ']);
    expect(maker.options).toContainEqual({ value: 'ZZZ', label: 'ZZZ' });
    q.onValueChange('PHOTO');
    status.onValueChange('maintenance');
    maker.onValueChange('ACME');
    expect(set.mock.calls).toEqual([['q', 'PHOTO'], ['status', 'maintenance'], ['maker', 'ACME']]);
    expect(setPage).not.toHaveBeenCalled();
  });
});
