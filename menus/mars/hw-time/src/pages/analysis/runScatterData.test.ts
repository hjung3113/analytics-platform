import { describe, expect, it } from 'vitest';
import type { HwTimeRuns } from '../../endpoints';
import { shapeRunScatter, type RunScatterSettings } from './runScatterData';

const normal = { value: 3, lower: 2, upper: 4, status: 'normal' as const };
const data: HwTimeRuns = {
  points: [
    { id: 'r1', at: '2026-09-19T10:00:00', equipmentId: 'EQ-001', moduleId: 'LK1', motion: 'Pump', seconds: 8, judgement: { ...normal, value: 8, status: 'over' }, motions: { Pump: { ...normal, value: 8, status: 'over' }, Vent: normal }, module: { value: 11, lower: null, upper: null, status: 'over' } },
    { id: 'r2', at: '2026-09-19T11:00:00', equipmentId: 'EQ-002', moduleId: 'LK1', motion: 'Pump', seconds: 1, judgement: { ...normal, value: 1, status: 'under' }, motions: { Pump: { ...normal, value: 1, status: 'under' }, Vent: normal }, module: { value: 4, lower: null, upper: null, status: 'under' } },
  ], shown: 2, total: 576, daily: [],
  bounds: [
    { equipmentId: 'EQ-001', moduleId: 'LK1', motion: 'Pump', lower: 2, upper: 4 },
    { equipmentId: 'EQ-002', moduleId: 'LK1', motion: 'Pump', lower: 2, upper: 4 },
  ],
};
const settings: RunScatterSettings = { axis: 'equipment-module', color: 'equipment', value: 'motion' };

describe('categorical run scatter shaping for #2332', () => {
  it.each([
    ['equipment-module', ['EQ-001 · LK1', 'EQ-002 · LK1']],
    ['equipment', ['EQ-001', 'EQ-002']],
    ['module', ['LK1']],
  ] as const)('shapes %s categories and per-category bounds without a numeric time axis', (axis, order) => {
    const shaped = shapeRunScatter(data, { ...settings, axis }, ['Pump', 'Vent'], 'ko');
    expect(shaped.xCategories.order).toEqual(order);
    expect(shaped.points[0]!.category).toBe(order[0]);
    expect(shaped.points.every(point => point.x === null)).toBe(true);
    expect(shaped.xCategories.bounds.get(order[0]!)).toEqual({ lower: 2, upper: 4 });
    expect(shaped.xCategories.jitter).toBe(0.6);
  });
  it.each([
    ['equipment', ['EQ-001', 'EQ-002']],
    ['module', ['LK1', 'LK1']],
    ['status', ['over', 'under']],
  ] as const)('shapes %s colour keys and the server-supplied status', (color, keys) => {
    const shaped = shapeRunScatter(data, { ...settings, color }, ['Pump', 'Vent'], 'ko');
    expect(shaped.points.map(p => p.groupColorKey)).toEqual(keys);
    expect(shaped.points[0]!.status).toMatchObject({ tone: 'danger', label: 'HTM 상한 초과' });
    expect(shaped.points[1]!.status).toMatchObject({ tone: 'warning', label: 'HTM 하한 미달' });
  });
  it('sums only checked Motions for Module time and removes every bound band', () => {
    const shaped = shapeRunScatter(data, { ...settings, value: 'module' }, ['Vent'], 'ko');
    expect(shaped.points.map(p => p.value)).toEqual([3, 3]);
    expect(shaped.points.map(p => p.motion)).toEqual([null, null]);
    expect(shaped.xCategories.bounds.size).toBe(0);
    expect(shaped.points[0]!.status?.tone).toBe('danger'); // server Module roll-up, never rejudged by the client
  });
  it('keeps a missing checked Motion unknown, and keeps distinct conflicting bounds visible to the integrator', () => {
    const changed = { ...data, bounds: [{ ...data.bounds[0]! }, { ...data.bounds[1]!, lower: 3, upper: 5 }] };
    const module = shapeRunScatter(changed, { ...settings, value: 'module' }, ['Missing'], 'ko');
    expect(module.points[0]!.value).toBeNull();
    const shaped = shapeRunScatter(changed, { ...settings, axis: 'module' }, ['Pump'], 'ko');
    expect(shaped.xCategories.bounds.has('LK1')).toBe(false);
    expect(shaped.boundConflicts).toEqual([{ category: 'LK1', bounds: changed.bounds }]);
  });
});
