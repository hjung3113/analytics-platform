import { describe, expect, it } from 'vitest';
import { HW_TIME_MODULE_TYPES, type HwTimeMatrix } from '../../endpoints';
import { chartRows, panelCatalog, stepOf, stepPreset, validTrend, workspaceOptions } from './stepped';

const data: HwTimeMatrix = {
  equipment: ['MEM-PHOTO-0103'], modules: ['PM1', 'PM2'], motions: [{ id: 'Pump', color: 'chart-blue' }],
  cells: [2, 6].map((value, i) => ({ equipmentId: 'MEM-PHOTO-0103', moduleId: `PM${i + 1}`,
    motions: { Pump: { value, lower: null, upper: null, status: 'unjudgeable' } },
    module: { value, lower: null, upper: null, status: 'unjudgeable' } })), limits: { maxRows: 96 },
};
const selection = () => ({ modules: ['PM1', 'PM2'], motions: ['Pump'] });
describe('HW Time stepped declarations', () => {
  it.each([
    [null, null, null, 1], ['PM', null, null, 2], ['PM', 'Pump', null, 3], ['PM', 'Pump', 'PM2', 4],
  ] as const)('derives depth from %s/%s/%s', (type, motion, module, step) => expect(stepOf(type, motion, module)).toBe(step));
  it.each([1, 2, 3, 4] as const)('declares one preset with only the step-%s default panels', step => {
    const preset = stepPreset(step);
    const text = JSON.stringify(preset.layout);
    expect(text).toContain('tree'); expect(text).toContain('current');
    expect(text.includes('previous')).toBe(step > 1);
    expect(text).not.toContain('scatter'); expect(text).not.toContain('table');
    expect(workspaceOptions(step).find(option => option.id === 'group')?.hidden).toBe(step === 1 || step === 4);
  });
  it('uses a mean of checked Module sums per type and preserves unknown parts', () => {
    const shaped = chartRows({ depth: 1, matrices: { PM: data }, typeId: 'PM', motionId: null, moduleId: null, selection });
    expect(shaped.series.find(series => series.id === 'PM')?.points).toEqual([['MEM-PHOTO-0103', 4]]);
    const unknown = { ...data, cells: data.cells.map((cell, index) => index ? { ...cell, motions: {} } : cell) };
    expect(chartRows({ depth: 1, matrices: { PM: unknown }, typeId: 'PM', motionId: null, moduleId: null, selection }).series[0]?.points[0]?.[1]).toBeNull();
  });
  it('keeps equipment–Module rows for steps 2–3, then one equipment row for the chosen Module', () => {
    const args = { matrices: { PM: data }, typeId: 'PM', motionId: 'Pump', moduleId: 'PM2', selection };
    expect(chartRows({ ...args, depth: 2 }).series[0]?.points.map(([x]) => x)).toEqual(['MEM-PHOTO-0103 · PM1', 'MEM-PHOTO-0103 · PM2']);
    expect(chartRows({ ...args, depth: 3 }).series.map(series => series.id)).toEqual(['Pump']);
    expect(chartRows({ ...args, depth: 4 }).series[0]?.points).toEqual([['MEM-PHOTO-0103', 6]]);
  });
  it.each([1, 2, 3, 4] as const)('gates the step-%s add list with explicit reasons', step => {
    const items = panelCatalog({ step, typeId: step > 1 ? 'PM' : null, moduleId: step === 4 ? 'PM2' : null, trend: null });
    expect(items.map(item => item.id)).toEqual(['heatmap', 'trend', 'scatter', 'distribution', 'motionTable', 'moduleMotions', 'table', 'donut', 'pareto', 'equipmentDays', 'boundHistory']);
    for (const item of items) {
      const available = ['table', 'donut', 'pareto', 'equipmentDays', 'boundHistory'].includes(item.id) || (item.id === 'heatmap' && step > 1) || step === 4;
      expect(item.disabledReason === undefined).toBe(available);
      if (!available) expect(item.disabledReason?.ko).toBeTruthy();
    }
  });
  it('accepts only catalog Module/Motion trend pairs, without needing a Module drill', () => {
    expect(validTrend('PM2/Pump')).toBe(true);
    expect(validTrend('PM2/Place')).toBe(false);
    expect(validTrend('PM2/Pump/extra')).toBe(false);
    expect(validTrend('../Pump')).toBe(false);
    expect(HW_TIME_MODULE_TYPES).toHaveLength(3);
  });
});
