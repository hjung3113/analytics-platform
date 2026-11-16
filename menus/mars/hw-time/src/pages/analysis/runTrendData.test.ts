import { describe, expect, it } from 'vitest';
import type { HwTimeRuns } from '../../endpoints';
import { shapeRunTrend } from './runTrendData';

const daily = (equipmentId: string, at: string, seconds: number, status: 'normal' | 'over' | 'under') => ({
  id: `${equipmentId}.${at}`, equipmentId, moduleId: 'LK1', motion: 'Pump', at, seconds,
  judgement: { value: seconds, lower: 2, upper: 4, status },
  motions: { Pump: { value: seconds, lower: 2, upper: 4, status }, Vent: { value: 3, lower: 1, upper: 5, status: 'normal' as const } },
  module: { value: seconds + 3, lower: null, upper: null, status },
});
const data: HwTimeRuns = { points: [], shown: 0, total: 20, bounds: [], daily: [
  daily('EQ-001', '2026-09-19T00:00:00', 8, 'over'), daily('EQ-001', '2026-09-20T00:00:00', 1, 'under'),
  daily('EQ-002', '2026-09-19T00:00:00', 3, 'normal'),
] };

describe('daily run trend shaping for #2333', () => {
  it('maps server daily averages to one time line per equipment and preserves weaker under status', () => {
    const shaped = shapeRunTrend(data.daily, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko');
    expect(shaped.series).toHaveLength(2);
    expect(shaped.series[0]).toMatchObject({ id: 'EQ-001', kind: 'line', points: [['2026-09-19T00:00:00', 8], ['2026-09-20T00:00:00', 1]] });
    expect(shaped.pointStatusOf({ x: data.daily[0]!.at, seriesId: 'EQ-001', value: 8 })?.tone).toBe('danger');
    expect(shaped.pointStatusOf({ x: data.daily[1]!.at, seriesId: 'EQ-001', value: 1 })?.tone).toBe('warning');
    expect(shaped.pointStatus).toBe(shaped.pointStatusOf);
    expect(shaped.boundLabels).toEqual({ lower: 'HTM 하한', upper: 'HTM 상한', band: 'HTM' });
    expect(shaped.bounds.size).toBe(0);
    expect(shaped.bandPolicy).toBe('single-equipment-only');
  });
  it('exposes per-time bounds only for a single equipment and none for Module time', () => {
    const one = data.daily.filter(p => p.equipmentId === 'EQ-001').map((p, i) => ({ ...p, judgement: { ...p.judgement, upper: 4 + i } }));
    expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko').bounds.get(one[0]!.at)).toEqual({ lower: 2, upper: 4 });
    expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko').bounds.get(one[1]!.at)).toEqual({ lower: 2, upper: 5 });
    const module = shapeRunTrend(one, { color: 'module', value: 'module' }, ['Vent'], 'ko');
    expect(module.series[0]!.points.map(([, value]) => value)).toEqual([3, 3]);
    expect(module.bounds.size).toBe(0);
  });
  it('keeps one line per equipment with per-point status colours when colour is status', () => {
    const shaped = shapeRunTrend(data.daily, { color: 'status', value: 'motion' }, ['Pump'], 'ko');
    expect(shaped.series).toHaveLength(2);
    expect(shaped.series.every(series => series.color === 'chart-status-good')).toBe(true);
    expect(shaped.pointColorKeyOf({ x: data.daily[1]!.at, seriesId: 'EQ-001', value: 1 })).toBe('under');
  });
});
