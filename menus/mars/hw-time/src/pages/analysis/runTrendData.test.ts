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
  daily('MEM-PHOTO-0103', '2026-09-19T00:00:00', 8, 'over'), daily('MEM-PHOTO-0103', '2026-09-20T00:00:00', 1, 'under'),
  daily('MEM-PHOTO-0105', '2026-09-19T00:00:00', 3, 'normal'),
] };

describe('daily run trend shaping for #2333', () => {
  it('maps server daily averages to one daily line per equipment and preserves weaker under status', () => {
    const shaped = shapeRunTrend(data.daily, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko');
    expect(shaped.series).toHaveLength(2);
    expect(shaped.series[0]).toMatchObject({ id: 'MEM-PHOTO-0103', kind: 'line', points: [['09-19', 8], ['09-20', 1]] });
    expect(shaped.pointStatusOf({ x: '09-19', seriesId: 'MEM-PHOTO-0103', value: 8 })?.tone).toBe('danger');
    expect(shaped.pointStatusOf({ x: '09-20', seriesId: 'MEM-PHOTO-0103', value: 1 })?.tone).toBe('warning');
    expect(shaped.pointStatus).toBe(shaped.pointStatusOf);
    expect(shaped.boundLabels).toEqual({ lower: 'HTM 하한', upper: 'HTM 상한', band: 'HTM' });
    expect(shaped.bounds.size).toBe(0);
    expect(shaped.bandPolicy).toBe('single-equipment-only');
  });
  it('exposes per-time bounds only for a single equipment and none for Module time', () => {
    const one = data.daily.filter(p => p.equipmentId === 'MEM-PHOTO-0103').map((p, i) => ({ ...p, judgement: { ...p.judgement, upper: 4 + i } }));
    expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko').bounds.get('09-19')).toEqual({ lower: 2, upper: 4 });
    expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko').bounds.get('09-20')).toEqual({ lower: 2, upper: 5 });
    const module = shapeRunTrend(one, { color: 'module', value: 'module' }, ['Vent'], 'ko');
    expect(module.series[0]!.points.map(([, value]) => value)).toEqual([3, 3]);
    expect(module.bounds.size).toBe(0);
  });
  it('keeps one line per equipment with per-point status colours when colour is status', () => {
    const shaped = shapeRunTrend(data.daily, { color: 'status', value: 'motion' }, ['Pump'], 'ko');
    expect(shaped.series).toHaveLength(2);
    expect(shaped.series.every(series => series.color === 'chart-status-good')).toBe(true);
    expect(shaped.pointColorKeyOf({ x: '09-20', seriesId: 'MEM-PHOTO-0103', value: 1 })).toBe('under');
  });
});

it.each(['ko', 'en'] as const)('uses a sorted daily category domain with MM-DD labels in %s, retaining missing equipment days', lang => {
  const shaped = shapeRunTrend([...data.daily].reverse(), { color: 'equipment', value: 'motion' }, ['Pump'], lang);
  expect(shaped.series.find(s => s.id === 'MEM-PHOTO-0103')!.points).toEqual([['09-19', 8], ['09-20', 1]]);
  expect(shaped.series.find(s => s.id === 'MEM-PHOTO-0105')!.points).toEqual([['09-19', 3], ['09-20', null]]);
  expect(shaped.pointStatusOf({ x: '09-20', seriesId: 'MEM-PHOTO-0103', value: 1 })?.tone).toBe('warning');
});
it('counts equipment verdicts, excludes unjudgeable, and uses the selected value judgement', () => {
  const unknown = { ...data.daily[0]!, equipmentId: 'MEM-PHOTO-0106', judgement: { value: null, lower: null, upper: null, status: 'unjudgeable' as const, reason: 'no-criteria' as const } };
  const shaped = shapeRunTrend([...data.daily, unknown], { color: 'equipment', value: 'motion' }, ['Pump'], 'ko');
  expect(shaped.verdictSeries).toMatchObject([
    { id: 'over', name: '상한 초과', kind: 'bar', color: 'chart-status-critical', points: [['09-19', 1], ['09-20', 0]] },
    { id: 'under', name: '하한 미달', kind: 'bar', color: 'chart-status-warn', points: [['09-19', 0], ['09-20', 1]] },
  ]);
  const module = shapeRunTrend(data.daily.map(p => ({ ...p, module: { ...p.module, status: 'normal' as const } })), { color: 'equipment', value: 'module' }, ['Vent'], 'ko');
  expect(module.verdictSeries.every(s => s.points.every(([, value]) => value === 0))).toBe(true);
});
it('clears the preceding equipment bound on a day without criteria', () => {
  const one = data.daily.filter(p => p.equipmentId === 'MEM-PHOTO-0103').map((p, i) => i === 0 ? p : { ...p, judgement: { ...p.judgement, lower: null, upper: null } });
  expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'ko').bounds.get('09-20')).toEqual({});
});
it('keeps distinct years when MM-DD would merge two daily categories', () => {
  const one = [data.daily[0]!, { ...data.daily[0]!, at: '2027-09-19T00:00:00' }];
  expect(shapeRunTrend(one, { color: 'equipment', value: 'motion' }, ['Pump'], 'en').categories).toEqual(['2026-09-19', '2027-09-19']);
});
