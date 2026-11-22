import { describe, expect, it } from 'vitest';
import { comparisonUnits } from './comparisonUnits';
import { COHORTS, EQUIPMENT, comparisonFor, evidenceFor, equipmentForTarget } from './timeCompareFixture';

describe('RCC round-two comparison', () => {
  it('keeps the shared Recipe as two usage rows with different PPID and Layer', () => {
    const units = comparisonUnits('recipe', { recipe: ['RCP-042'] });
    expect(units.map(unit => unit.label)).toEqual(['RCP-042 · PPID-204 · L2', 'RCP-042 · PPID-318 · L1']);
    expect(new Set(units.map(unit => unit.id)).size).toBe(2);
  });

  it('keeps both Recipes when a PPID contains two uses of one Layer', () => {
    const secondRecipe = { ...COHORTS[0], id: '204-2-099', recipe: 'RCP-099' };
    const [unit] = comparisonUnits('ppid', { ppid: ['PPID-204'] }, [COHORTS[0], secondRecipe]);
    expect(unit?.usages.map(usage => usage.recipe)).toEqual(['RCP-042', 'RCP-099']);
    expect(comparisonUnits('recipe', { recipe: ['RCP-099'], layer: ['L3'] }, [COHORTS[0], secondRecipe])).toEqual([]);
  });

  it('limits comparison and evidence to the applied shell target', () => {
    const [first, second] = EQUIPMENT;
    const facts = [
      { equipmentId: first!.targetId, room: 'PHOTO', axes: { prcGroups: ['PRC-PHOTO-0'] } },
      { equipmentId: second!.targetId, room: 'PHOTO', axes: { prcGroups: ['PRC-PHOTO-1'] } },
    ];
    const { equipment: targets } = equipmentForTarget(facts, { roomNames: ['PHOTO'], prcGroups: ['PRC-PHOTO-1'], condition: null, selection: [first!.targetId, second!.targetId] });
    expect(comparisonFor(14, 'A', null, COHORTS[0], targets).equipment.map(item => item.id)).toEqual(['EQ-002']);
    expect(evidenceFor(14, 'A', '20:3', null, null, COHORTS[0], targets).equipment).toEqual(['EQ-002']);
  });

  it('includes Lot IDs with several unique wafers in an equipment lot', () => {
    const { runs } = evidenceFor(1, 'A', '20:3', 'EQ-008');
    expect(new Set(runs.map(run => run.lot)).size).toBe(1);
    expect(runs[0]?.lot).toMatch(/^LOT-/);
    expect(new Set(runs.map(run => run.wafer)).size).toBeGreaterThan(1);
  });
});
