import { describe, expect, it } from 'vitest';
import { COHORTS, comparisonFor, daysInPeriod, evidenceFor } from './timeCompareFixture';

describe('RCC comparison selection', () => {
  it('uses the selected calendar range and cohort in the daily values', () => {
    const days = daysInPeriod('2026-09-19T00:00:00', '2026-09-26T00:00:00');
    expect(days).toHaveLength(7);
    expect(daysInPeriod('2026-09-26T00:00:00', '2026-09-27T00:00:00')).toEqual([]);
    expect(daysInPeriod('2026-09-19T09:00:00', '2026-09-21T00:00:00')).toEqual(['2026-09-20']);
    const first = comparisonFor(days, 'A', null, COHORTS[0]);
    const second = comparisonFor(days, 'A', null, COHORTS[1]);
    expect(second.totalBaseline).not.toEqual(first.totalBaseline);
    expect(second.stepBaseline['20:3']).not.toEqual(first.stepBaseline['20:3']);
  });

  it('keeps modest deviations among ordinary equipment and clear slow outliers after rollup', () => {
    const comparison = comparisonFor(14, 'A', null);
    const delta = (equipment: string) =>
      comparison.equipment.find(item => item.id === equipment)!.steps['20:3']! - comparison.stepBaseline['20:3']!;
    expect(delta('EQ-008')).toBeGreaterThan(4);
    expect(delta('EQ-009')).toBeGreaterThan(4);
    const ordinary = comparison.equipment.slice(0, 7).map(item => delta(item.id));
    expect(Math.min(...ordinary)).toBeLessThan(-0.3);
    expect(Math.max(...ordinary)).toBeGreaterThan(0.1);
    expect(Math.max(...ordinary.map(Math.abs))).toBeLessThan(1.2);
  });

  it('keeps all comparable scatter columns when the run table focuses on EQ-008', () => {
    const evidence = evidenceFor(14, 'A', '20:3', 'EQ-008');
    const scatterEquipment = new Set(evidence.scatterRuns.map(run => run.equipment));
    expect(scatterEquipment).toEqual(new Set(evidence.equipment));
    expect(scatterEquipment.size).toBe(9);
    expect(scatterEquipment.has('EQ-010')).toBe(false);
    expect(new Set(evidence.runs.map(run => run.equipment))).toEqual(new Set(['EQ-008']));
  });
});
