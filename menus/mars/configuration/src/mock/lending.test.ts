import { describe, expect, it } from 'vitest';
import { EQUIPMENT as INVENTORY } from '@ap/mock-server';
import { EQUIPMENT } from '../endpoints';
import { configurationLending } from './lending';

describe('Configuration lending fixture', () => {
  it('maps every equipment column to equipment the mock inventory generates, in the declared room', () => {
    for (const site of ['MEM', 'FDRY', 'XIA']) {
      const authorized = INVENTORY.filter(row => row.site === site);
      const known = new Map(authorized.map(row => [row.equipmentId, row.room]));
      const { equipmentColumns } = configurationLending({ itemId: 'cfg-000000', equipment: EQUIPMENT } as never, site, authorized);
      const mapped = equipmentColumns.map(column => column.equipmentId).filter((id): id is string => id !== null);
      expect(mapped.length, site).toBeGreaterThan(0);
      expect(new Set(mapped).size, site).toBe(mapped.length);
      for (const id of mapped) expect(known.get(id), `${site} ${id}`).toBe(id.split('-')[1]);
    }
    const mem = configurationLending({ itemId: 'cfg-000000', equipment: EQUIPMENT } as never, 'MEM', INVENTORY.filter(row => row.site === 'MEM'));
    expect(mem.equipmentColumns.every(column => column.equipmentId !== null)).toBe(true);
  });
});
