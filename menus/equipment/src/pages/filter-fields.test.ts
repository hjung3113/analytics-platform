import { describe, expect, it, vi } from 'vitest';
import { equipmentPageFilterFields, resetEquipmentPageFilters } from './filter-fields';

describe('equipment PageFilterBar URL fields (#54)', () => {
  it('writes q/status/maker keys, resets page on changes, and clears all filter keys', () => {
    const setPage = vi.fn();
    const fields = equipmentPageFilterFields({
      q: '', status: '', maker: 'ZZZ', makers: ['ACME', 'ZZZ'], lang: 'ko', setPage,
    });
    const q = fields.find(field => field.key === 'q');
    const status = fields.find(field => field.key === 'status');
    const maker = fields.find(field => field.key === 'maker');
    expect(q?.kind).toBe('search');
    expect(status?.kind).toBe('select');
    expect(maker?.kind).toBe('select');
    if (q?.kind !== 'search' || status?.kind !== 'select' || maker?.kind !== 'select') throw new Error('Expected equipment filter field kinds');

    expect(maker.options).toContainEqual({ value: 'ZZZ', label: 'ZZZ' });
    q.onValueChange('PHOTO');
    status.onValueChange('maintenance');
    maker.onValueChange('ACME');
    expect(setPage.mock.calls).toEqual([
      [{ q: 'PHOTO', page: null }, { replace: true }],
      [{ status: 'maintenance', page: null }],
      [{ maker: 'ACME', page: null }],
    ]);

    resetEquipmentPageFilters(setPage);
    expect(setPage).toHaveBeenLastCalledWith({ q: null, status: null, maker: null, page: null });
  });
});
