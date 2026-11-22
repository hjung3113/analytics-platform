import { describe, expect, it } from 'vitest';
import { DAYS, EQUIPMENT, STRUCTURES, comparisonFor, evidenceFor, periodValue } from './timeCompareFixture';

describe('RCC comparison fixture', () => {
  it('supplies 14 days, a 9:3 split and distinct Step 20 executions', () => {
    expect(DAYS).toHaveLength(14);
    expect(EQUIPMENT.filter(item => item.structure === 'A')).toHaveLength(9);
    expect(EQUIPMENT.filter(item => item.structure === 'B')).toHaveLength(3);
    expect(STRUCTURES.A).toHaveLength(18);
    const first = evidenceFor(14, 'A', '20:2', 'EQ-008');
    const second = evidenceFor(14, 'A', '20:3', 'EQ-008');
    expect(first.runs.length).toBeGreaterThan(40);
    expect(first.runs[0]?.id).not.toBe(second.runs[0]?.id);
    expect(first.trends[0]?.values).not.toEqual(second.trends[0]?.values);
  });

  it('keeps the supplied daily value and rolls up daily values with weights when complete', () => {
    expect(periodValue([{ value: 4, count: 0 }])).toBe(4);
    expect(periodValue([{ value: 3, count: 1 }, { value: 6, count: 2 }])).toBe(5);
    expect(periodValue([{ value: 3, count: 1 }, { value: 6 }])).toBe(4.5);
  });

  it('compares only the selected structure, with a slower Step and separate L1 totals', () => {
    const a = comparisonFor(14, 'A', null);
    const b = comparisonFor(14, 'B', 'EQ-010');
    const slow = a.equipment.find(item => item.id === 'EQ-008')!;
    expect(a.equipment.filter(item => item.held)).toHaveLength(3);
    expect(b.equipment.filter(item => item.held)).toHaveLength(9);
    expect(a.equipment.find(item => item.id === 'EQ-010')?.steps['20:3']).toBeUndefined();
    expect(slow.steps['20:3']! - a.stepBaseline['20:3']!).toBeGreaterThan(3);
    expect(slow.total).not.toBeCloseTo(Object.values(slow.steps).reduce((sum, value) => sum + value, 0));
    expect(b.stepBaseline['20:3']).toBe(b.equipment.find(item => item.id === 'EQ-010')?.steps['20:3']);
  });

  it('keeps held equipment out of selected Step evidence', () => {
    const evidence = evidenceFor(7, 'A', '20:3', 'EQ-010');
    expect(new Set(evidence.runs.map(run => run.equipment)).size).toBe(9);
    expect(evidence.trends[0]?.values).toHaveLength(7);
    expect(evidence.runs.some(run => run.equipment === 'EQ-010')).toBe(false);
  });
});
