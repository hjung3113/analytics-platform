import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { EQUIPMENT } from '@ap/mock-server';
import type { HwTimeMatrix, HwTimeMotionStats } from '../endpoints';
import { hwTimeOverviewMock, overviewRuns } from './overview';

const context = { ...emptyGlobal, from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };

describe('overview run sampling', () => {
  it.each(['Pump', 'Vent', 'DoorOpen', 'DoorClose'])('includes every out-of-bound %s run in at most 400 points', motion => {
    const ids = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
    const full = overviewRuns(ids, { moduleType: 'LK', drillModule: 'LK1', drillMotion: motion }, context, { sample: false });
    const sample = overviewRuns(ids, { moduleType: 'LK', drillModule: 'LK1', drillMotion: motion }, context, { sample: true });
    expect(sample.total).toBe(576);
    expect(sample.shown).toBe(sample.points.length);
    expect(sample.shown).toBeLessThanOrEqual(400);
    expect(sample.shown).toBeLessThan(sample.total);
    const outside = full.points.filter(p => p.judgement.status === 'over' || p.judgement.status === 'under');
    expect(outside.length).toBeGreaterThan(0);
    expect(sample.points.map(p => p.id)).toEqual(expect.arrayContaining(outside.map(p => p.id)));
    const moduleOutside = full.points.filter(p => p.module.status === 'over' || p.module.status === 'under');
    expect(sample.points.map(p => p.id)).toEqual(expect.arrayContaining(moduleOutside.map(p => p.id)));
    expect(sample.bounds).toHaveLength(ids.length);
    expect(sample.points.every(p => p.moduleId === 'LK1' && p.motion === motion && Object.keys(p.motions).length === 4)).toBe(true);
    expect(sample.points.every(p => p.at >= context.from! && p.at < context.to! && !/[Z+]/.test(p.at))).toBe(true);
    expect(overviewRuns(ids, { moduleType: 'LK', drillModule: 'LK1', drillMotion: motion }, context, { sample: true })).toEqual(sample);
  });

  it('aggregates daily means and server judgements from the full source before sampling', () => {
    const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' };
    const ids = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
    const full = overviewRuns(ids, params, context, { sample: false });
    const sample = overviewRuns(ids, params, context, { sample: true });
    expect(sample.daily).toEqual(full.daily);
    expect(sample.daily.map(p => p.judgement.status)).toEqual(expect.arrayContaining(['over', 'normal']));
    for (const point of sample.daily) {
      const runs = full.points.filter(p => p.equipmentId === point.equipmentId && p.at.slice(0, 10) === point.at.slice(0, 10));
      expect(point.seconds).toBeCloseTo(runs.reduce((sum, p) => sum + p.seconds, 0) / runs.length);
      expect(point.judgement.value).toBe(point.seconds);
      expect(point.module.value).toBeCloseTo(Object.values(point.motions).reduce((sum, j) => sum + j.value!, 0));
      expect(point.module.lower).toBeNull();
      expect(point.module.upper).toBeNull();
    }
  });

  it('validates the Module type and drill at the server boundary', () => {
    const endpoint = hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.runs')!;
    expect(endpoint.validate?.({ params: { moduleType: 'PM', drillModule: 'LK1', drillMotion: 'Pump' }, context })).toBeTruthy();
    expect(endpoint.validate?.({ params: { moduleType: 'PM', drillModule: 'PM1', drillMotion: 'Pump' }, context })).toBeNull();
  });
  it('rejects an invalid Motion before checking the deeper Module in a run request', () => {
    const endpoint = hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.runs')!;
    expect(endpoint.validate?.({ params: { moduleType: 'PM', drillMotion: 'Pick', drillModule: 'LK1' }, context })).toBe('drillMotion must belong to moduleType');
  });
});

describe('overview server projections', () => {
  const invoke = (endpoint: string, params: Record<string, string>) => hwTimeOverviewMock.find(e => e.spec.id === endpoint)!.handle({ equipment: EQUIPMENT.slice(0, 8), context, params, actor: 'engineer' });
  it.each(['PM', 'TR'])('%s remains Recipe-unsplit, with no Module bounds', typeId => {
    const data = invoke('hwTime.matrix', { moduleType: typeId }) as HwTimeMatrix;
    expect(data.equipment).toHaveLength(24);
    expect(data.cells.length).toBeLessThanOrEqual(data.limits.maxRows);
    expect(data.cells.every(cell => cell.module.status === 'unjudgeable' && cell.module.reason === 'recipe-unsplit' && cell.module.lower === null && cell.module.upper === null)).toBe(true);
  });
  it('LK provides both severity levels and one Motion average over all picked equipment', () => {
    const data = invoke('hwTime.matrix', { moduleType: 'LK' }) as HwTimeMatrix;
    const statuses = data.cells.flatMap(cell => Object.values(cell.motions).map(j => j.status));
    expect(statuses).toEqual(expect.arrayContaining(['over', 'under', 'normal']));
    expect(data.cells.every(cell => cell.module.lower === null && cell.module.upper === null)).toBe(true);
    const stats = invoke('hwTime.motionStats', { moduleType: 'LK', drillModule: 'LK1' }) as HwTimeMotionStats;
    expect(stats.rows[0]!.judgement.status).toBe('over');
    expect(stats.rows[1]!.judgement.status).toBe('under');
    const values = data.cells.filter(cell => cell.moduleId === 'LK1').map(cell => cell.motions.Pump!.value!);
    expect(stats.rows[0]!.judgement.value).toBeCloseTo(values.reduce((sum, value) => sum + value, 0) / values.length);
  });
  it('an explicit empty resolved population returns empty datasets without inventing equipment', () => {
    for (const endpoint of hwTimeOverviewMock) {
      const data = endpoint.handle({ equipment: [], context, actor: 'engineer', params: { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' } });
      expect(endpoint.isEmpty?.(data)).toBe(true);
    }
  });
});
