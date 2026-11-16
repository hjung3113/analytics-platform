import { describe, expect, it } from 'vitest';
import type { HwTimeMatrix } from '../../endpoints';
import { validPanelDate, verdictCodec, dateCodec } from '../../endpoints';
import { heatmapValues, paretoItems, verdictCounts } from './newPanelData';

const matrix: HwTimeMatrix = {
  equipment: ['EQ-001'], modules: ['PM1'], motions: [{ id: 'Pump', color: 'chart-blue' }, { id: 'Vent', color: 'chart-teal' }],
  cells: [{ equipmentId: 'EQ-001', moduleId: 'PM1', module: { value: 9, lower: null, upper: null, status: 'over' }, motions: {
    Pump: { value: 6, lower: 1, upper: 5, status: 'over' }, Vent: { value: 3, lower: 1, upper: 5, status: 'normal' },
  } }], limits: { maxRows: 96 },
};
const checks = { modules: ['PM1'], motions: ['Pump', 'Vent'] };
describe('new HW Time panels', () => {
  it.each(['normal', 'over', 'under', 'unjudgeable'])('accepts verdict %s and rejects malformed values', value => {
    expect(verdictCodec.decode(value)).toBe(value);
    expect(verdictCodec.decode(`${value}!`)).toBeNull();
  });
  it('validates calendar days and the half-open applied wall-clock range', () => {
    expect(dateCodec.decode('2026-02-30')).toBeNull();
    expect(dateCodec.decode('2026-9-19')).toBeNull();
    expect(validPanelDate('2026-09-19', '2026-09-19T09:00:00', '2026-09-26T00:00:00')).toBe(true);
    expect(validPanelDate('2026-09-26', '2026-09-19T09:00:00', '2026-09-26T00:00:00')).toBe(false);
  });
  it('counts all selected matrix judgements including normal and unjudgeable', () => {
    expect(verdictCounts([matrix], () => checks)).toEqual({ normal: 1, over: 1, under: 0, unjudgeable: 0 });
  });
  it('orders Motion/Module exceedance counts descending; SDK Pareto owns the cumulative line', () => {
    expect(paretoItems([matrix], () => checks)).toEqual([{ id: 'PM1/Pump', label: 'PM1 · Pump', value: 1 }, { id: 'PM1/Vent', label: 'PM1 · Vent', value: 0 }]);
  });
  it.each([2, 3, 4] as const)('heatmap follows step %s without rejudging values', step => {
    const cells = heatmapValues(matrix, checks, step > 2 ? 'Pump' : null, null, 'ko');
    expect(cells[0]!.value).toBe(step === 2 ? 9 : 6);
    expect(cells[0]!.status?.tone).toBe('danger');
  });
  it('verdict emphasis leaves the heatmap values and population intact', () => {
    const all = heatmapValues(matrix, checks, 'Vent', null, 'ko');
    const selected = heatmapValues(matrix, checks, 'Vent', 'normal', 'ko');
    expect(selected.map(cell => cell.value)).toEqual(all.map(cell => cell.value));
    expect(selected[0]!.status?.label).toContain('정상');
  });
});
