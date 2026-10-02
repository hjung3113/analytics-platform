import { describe, expect, it } from 'vitest';
import type { EquipmentFilter } from '../endpoints';
import { exportParams } from './data';

// Table-owned export (#173): the page builds only the endpoint params — filters plus the selection ids.
// The file, outcome handling and toasts belong to PlatformDataTable.

describe('equipment-master export params', () => {
  const filter: EquipmentFilter = { q: 'etch', status: 'active', maker: 'ACME' };

  it('carries the page filters and ids for a selection export', () => {
    expect(exportParams(filter, { kind: 'selected', ids: ['ICH-PHOTO-0103', 'ICH-ET-102'] }))
      .toEqual({ q: 'etch', status: 'active', maker: 'ACME', ids: ['ICH-PHOTO-0103', 'ICH-ET-102'] });
  });

  it('uses ids: null for the all-filtered export so the server reads the whole filtered set', () => {
    expect(exportParams(filter, { kind: 'filtered' })).toEqual({ q: 'etch', status: 'active', maker: 'ACME', ids: null });
  });
});
