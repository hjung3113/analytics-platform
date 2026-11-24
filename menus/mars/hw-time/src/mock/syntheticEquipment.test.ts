import { readFileSync } from 'node:fs';
import { EQUIPMENT } from '@ap/mock-server';
import { equipmentNumber, syntheticEquipmentIds } from './syntheticEquipment';
import { describe, expect, it } from 'vitest';

describe('shared synthetic population rule', () => {
  it('uses the resolved master IDs, at most 24, in master order (#2868)', () => {
    expect(syntheticEquipmentIds([])).toEqual([]);
    expect(syntheticEquipmentIds(EQUIPMENT.slice(1, 2))).toEqual(['MEM-PHOTO-0105']);
    const large = syntheticEquipmentIds(EQUIPMENT);
    expect(large).toEqual(EQUIPMENT.slice(0, 24).map(e => e.equipmentId));
    expect(large.at(-1)).toBe('MEM-CVD-0146');
  });
  it('seeds values by the position in the Site master list, however the population is narrowed', () => {
    expect(equipmentNumber('MEM-PHOTO-0103')).toBe(1);
    expect(equipmentNumber('MEM-PHOTO-0106')).toBe(3);
    expect(equipmentNumber(EQUIPMENT.find(e => e.site === 'FDRY')!.equipmentId)).toBe(1);
    expect(() => equipmentNumber('EQ-002')).toThrow();
  });
  it.each(['overview', 'newPanels', 'hwTime'])('%s consumes the single mock helper', name => {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
    expect(source).toContain("from './syntheticEquipment'");
    expect(source).not.toMatch(/function syntheticEquipmentIds|MAX_(SYNTHETIC_)?EQUIPMENT/);
  });
});
