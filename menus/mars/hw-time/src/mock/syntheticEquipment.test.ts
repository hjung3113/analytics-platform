import { readFileSync } from 'node:fs';
import { EQUIPMENT } from '@ap/mock-server';
import { syntheticEquipmentIds } from './syntheticEquipment';
import { describe, expect, it } from 'vitest';

describe('shared synthetic population rule', () => {
  it('preserves zero, multiplier, cap and stable sequential IDs', () => {
    expect(syntheticEquipmentIds([])).toEqual([]);
    expect(syntheticEquipmentIds(EQUIPMENT.slice(0, 1))).toEqual(['EQ-001', 'EQ-002', 'EQ-003']);
    const large = syntheticEquipmentIds(Array.from({ length: 20 }, () => EQUIPMENT[0]!));
    expect(large).toHaveLength(24);
    expect(large.at(-1)).toBe('EQ-024');
  });
  it.each(['overview', 'newPanels', 'hwTime'])('%s consumes the single mock helper', name => {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), 'utf8');
    expect(source).toContain("from './syntheticEquipment'");
    expect(source).not.toMatch(/function syntheticEquipmentIds|MAX_(SYNTHETIC_)?EQUIPMENT/);
  });
});
