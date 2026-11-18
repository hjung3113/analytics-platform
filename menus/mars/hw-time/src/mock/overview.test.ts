import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { EQUIPMENT } from '@ap/mock-server';
import { HW_TIME_MODULE_TYPES, type HwTimeDistribution, type HwTimeMatrix, type HwTimeMotionStats } from '../endpoints';
import { hwTimeOverviewMock, overviewRuns } from './overview';

const context = { ...emptyGlobal, from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const lkType = HW_TIME_MODULE_TYPES.find(type => type.id === 'LK')!;

describe('overview distribution', () => {
  const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' };
  const invoke = (equipment = EQUIPMENT.slice(0, 8), input = params) => hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.distribution')!.handle({ equipment, context, params: input, actor: 'engineer' }) as HwTimeDistribution;
  it.each(lkType.modules.flatMap(drillModule => lkType.motions.map(drillMotion => ({ drillModule, drillMotion }))))('has a centred spread, a minority near tail and two rare large values for %j', drill => {
    const data = invoke(undefined, { ...params, ...drill });
    const ids = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
    const full = overviewRuns(ids, { ...params, ...drill }, context, { sample: false });
    const { lower, upper } = data.bounds as { lower: number; upper: number };
    const inside = full.points.filter(point => point.seconds >= lower && point.seconds <= upper);
    const over = full.points.filter(point => point.seconds > upper);
    const under = full.points.filter(point => point.seconds < lower);
    const rare = over.filter(point => point.seconds > upper + 1.5);
    expect(inside.length / full.total).toBeGreaterThan(0.8);
    expect(over.length / full.total).toBeGreaterThanOrEqual(0.02);
    expect(over.length / full.total).toBeLessThanOrEqual(0.15);
    expect(under.length).toBeGreaterThan(0);
    expect(under.length / full.total).toBeLessThan(0.1);
    expect(rare).toHaveLength(2);
    expect(rare.every(point => point.seconds >= upper + 2 && point.seconds <= upper + 3)).toBe(true);
    expect(Math.max(...over.filter(point => !rare.includes(point)).map(point => point.seconds))).toBeLessThanOrEqual(upper + 1.5);
    expect(new Set(inside.map(point => Math.floor(point.seconds / 0.25))).size).toBeGreaterThanOrEqual(4);
    const mean = inside.reduce((sum, point) => sum + point.seconds, 0) / inside.length;
    expect((mean - lower) / (upper - lower)).toBeGreaterThanOrEqual(0.4);
    expect((mean - lower) / (upper - lower)).toBeLessThanOrEqual(0.55);
    const peak = data.bins.reduce((tallest, bin) => bin.count > tallest.count ? bin : tallest);
    expect(peak.start).toBeGreaterThan(lower + (upper - lower) * 0.2);
    expect(peak.end).toBeLessThan(upper - (upper - lower) * 0.1);
    expect(invoke(undefined, { ...params, ...drill })).toEqual(data);
  });
  it('bins every full-population run at a fixed 0.25 seconds, including empty intervals', () => {
    const data = invoke();
    const ids = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
    const full = overviewRuns(ids, params, context, { sample: false });
    expect(data.total).toBe(576);
    expect(data.equipment).toBe(24);
    expect(data.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(full.total);
    expect(data.total).toBeGreaterThan(overviewRuns(ids, params, context, { sample: true }).shown);
    expect(data.bins.some(bin => bin.count === 0)).toBe(true);
    for (const [index, bin] of data.bins.entries()) {
      expect(bin.end - bin.start).toBe(0.25);
      if (index) expect(bin.start).toBe(data.bins[index - 1]!.end);
      expect(bin.count).toBe(full.points.filter(point => point.seconds >= bin.start && point.seconds < bin.end).length);
    }
  });
  it.each(['Pump', 'Vent', 'DoorOpen', 'DoorClose'])('uses the same %s HTM bounds as the Motion table', drillMotion => {
    const data = invoke(undefined, { ...params, drillMotion });
    const stats = hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.motionStats')!.handle({ equipment: EQUIPMENT.slice(0, 8), context, params, actor: 'engineer' }) as HwTimeMotionStats;
    const judgement = stats.rows.find(row => row.motion === drillMotion)!.judgement;
    expect(data.bounds).toEqual({ lower: judgement.lower, upper: judgement.upper });
  });
  it('counts only the runs of the linked verdict and date, the same population as the scatter', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
    const all = invoke(undefined, params).total;
    for (const link of [{ verdict: 'over' as const }, { verdict: 'under' as const }, { date: '2026-09-20' }, { verdict: 'normal' as const, date: '2026-09-21' }]) {
      const linked = invoke(undefined, { ...params, ...link });
      const runs = overviewRuns(ids, { ...params, ...link }, context, { sample: false });
      expect(linked.total).toBe(runs.total);
      expect(linked.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(runs.total);
      expect(linked.total).toBeGreaterThan(0);
      expect(linked.total).toBeLessThan(all);
    }
  });
  it('keeps Recipe-unsplit Motion bounds absent and handles an empty population', () => {
    expect(invoke(undefined, { moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump' }).bounds).toEqual({ lower: null, upper: null });
    expect(invoke([])).toMatchObject({ bins: [], total: 0, equipment: 0 });
  });
  it('validates the new endpoint with the same drill constraints and ownership as runs', () => {
    const endpoint = hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.distribution')!;
    const runs = hwTimeOverviewMock.find(e => e.spec.id === 'hwTime.runs')!;
    // Single- and multi-equipment inputs are specific to lent runs (#2490).
    const { equipmentId: _single, equipmentIds: _multiple, ...runsParamKeys } = runs.spec.paramKeys as Record<string, unknown>;
    expect({ ...endpoint.spec, id: runs.spec.id }).toEqual({ ...runs.spec, paramKeys: runsParamKeys });
    expect(endpoint.validate?.({ params, context })).toBeNull();
    // A valid in-range link must pass: validation needs the request context for the date range.
    expect(endpoint.validate?.({ params: { ...params, verdict: 'over', date: '2026-09-20' }, context })).toBeNull();
    expect(endpoint.validate?.({ params: { ...params, verdict: 'bogus' }, context })).toBeTruthy();
    expect(endpoint.validate?.({ params: { ...params, date: '2020-01-01' }, context })).toBeTruthy();
    expect(endpoint.validate?.({ params: { ...params, drillModule: 'PM2' }, context })).toBeTruthy();
    expect(endpoint.validate?.({ params: { ...params, drillMotion: 'Pick' }, context })).toBeTruthy();
  });
});

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
  it.each(lkType.motions)('default step 3 LK/%s matrix has three verdicts and visible value spread', motion => {
    const data = invoke('hwTime.matrix', { moduleType: 'LK' }) as HwTimeMatrix;
    const cells = data.cells.map(cell => cell.motions[motion]!);
    const counts = cells.reduce<Record<string, number>>((result, cell) => { result[cell.status] = (result[cell.status] ?? 0) + 1; return result; }, {});
    const values = cells.map(cell => cell.value!);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(new Set(cells.map(cell => cell.status)).size).toBeGreaterThanOrEqual(3);
    expect(counts.normal).toBeGreaterThan(cells.length / 2);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(mean * 0.2);
    for (const module of data.modules) expect(new Set(data.cells.filter(cell => cell.moduleId === module).map(cell => cell.motions[motion]!.value!.toFixed(2))).size).toBeGreaterThan(12);
    expect(data.cells.some(cell => cell.moduleId === data.modules[0] && cell.motions[motion]!.value !== data.cells.find(other => other.equipmentId === cell.equipmentId && other.moduleId === data.modules[1])?.motions[motion]!.value)).toBe(true);
  });
  it('provides a deterministic Module-Motion long tail beyond the first two Pareto bars', () => {
    const data = invoke('hwTime.matrix', { moduleType: 'LK' }) as HwTimeMatrix;
    const counts = data.modules.flatMap(module => data.motions.map(motion => data.cells.filter(cell => cell.moduleId === module && cell.motions[motion.id]?.status === 'over').length)).sort((a, b) => b - a);
    expect(counts.filter(count => count > 0).length).toBeGreaterThanOrEqual(6);
    expect(counts[0]).toBeGreaterThan(counts.at(-1)!);
    expect((counts[0]! + counts[1]!) / counts.reduce((sum, count) => sum + count, 0)).toBeLessThan(0.8);
    expect(invoke('hwTime.matrix', { moduleType: 'LK' })).toEqual(data);
  });
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
    expect(stats.rows[0]!.judgement.status).toBe('normal');
    expect(stats.rows[1]!.judgement.status).toBe('normal');
    for (const moduleId of lkType.modules) {
      expect(data.cells.find(cell => cell.equipmentId === 'EQ-003' && cell.moduleId === moduleId)?.module.status).toBe('over');
      expect(data.cells.find(cell => cell.equipmentId === 'EQ-006' && cell.moduleId === moduleId)?.module.status).toBe('under');
      expect(data.cells.find(cell => cell.equipmentId === 'EQ-001' && cell.moduleId === moduleId)?.module.status).toBe('normal');
    }
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
