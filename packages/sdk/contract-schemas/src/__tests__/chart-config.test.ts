import { CHART_CONFIG_COLORS as SDK_COLORS, CHART_CONFIG_DECIMALS_MAX as SDK_DECIMALS, CHART_CONFIG_FIELD_MAX as SDK_FIELD, CHART_CONFIG_MEASURES_MAX as SDK_MEASURES, invalidChartConfig } from '@ap/contracts';
import { lineChartConfig, rejectedChartConfigCases } from '@ap/contracts/testing/saved-view-panels';
import { describe, expect, it } from 'vitest';
import { CHART_CONFIG_COLORS, CHART_CONFIG_DECIMALS_MAX, CHART_CONFIG_FIELD_MAX, CHART_CONFIG_MEASURES_MAX, chartConfigSchema } from '../saved-view-commands.ts';

const line = lineChartConfig;
const bar = { version: 1, kind: 'bar', x: { field: 'lot', type: 'category' }, measures: [{ field: 'count' }] };
const measures = (n: number) => Array.from({ length: n }, (_, i) => ({ field: `m${i}` }));

/** [label, config, combination message or null]. A null message on an invalid case means a shape rule (Zod words its own message). */
const cases: [string, unknown, boolean, string?][] = [
  ['line', line, true],
  ['bar with every option', { ...bar, split: { field: 'eqp' }, orientation: 'horizontal', stack: 'percent', valueFormat: { kind: 'percent', decimals: 1 } }, true],
  ['line with area, right axis and every colour', { ...line, areaFill: true, measures: CHART_CONFIG_COLORS.map((color, i) => ({ field: `m${i}`, color, axis: i ? 'right' : 'left' })) }, true],
  [`${CHART_CONFIG_MEASURES_MAX} measures`, { ...bar, measures: measures(CHART_CONFIG_MEASURES_MAX) }, true],
  ['decimals 0', { ...bar, valueFormat: { kind: 'number', decimals: 0 } }, true],
  ...rejectedChartConfigCases.map(({ label, panels }) => [label, panels.instances[0]!.source.config, false] as [string, unknown, boolean]),
  ['not an object', [line], false],
  ['version 2', { ...line, version: 2 }, false],
  ['pie kind', { ...line, kind: 'pie' }, false],
  ['blank x field', { ...line, x: { field: ' ', type: 'time' } }, false],
  ['too long field', { ...line, x: { field: 'f'.repeat(CHART_CONFIG_FIELD_MAX + 1), type: 'time' } }, false],
  ['no measures', { ...line, measures: [] }, false],
  ['too many measures', { ...line, measures: measures(CHART_CONFIG_MEASURES_MAX + 1) }, false],
  ['a fifth series token', { ...line, measures: [{ field: 'a', color: 'chart-series-5' }] }, false],
  ['a theme token that is not a series', { ...line, measures: [{ field: 'a', color: 'chart-blue' }] }, false],
  ['an rgb colour', { ...line, measures: [{ field: 'a', color: 'rgb(0,0,0)' }] }, false],
  ['a px size in the colour field', { ...line, measures: [{ field: 'a', color: '320px' }] }, false],
  ['a font name in the colour field', { ...line, measures: [{ field: 'a', color: 'Arial' }] }, false],
  ['a label on a measure', { ...line, measures: [{ field: 'a', label: '수율' }] }, false],
  ['decimals 7', { ...bar, valueFormat: { kind: 'number', decimals: CHART_CONFIG_DECIMALS_MAX + 1 } }, false],
  ['fractional decimals', { ...bar, valueFormat: { kind: 'number', decimals: 1.5 } }, false],
  ['a currency format', { ...bar, valueFormat: { kind: 'currency' } }, false],
  ['a string areaFill', { ...line, areaFill: 'yes' }, false],
  ['areaFill false on a bar', { ...bar, areaFill: false }, false, 'config.areaFill needs a line chart'],
  ['a long field with a horizontal line (shape first)', { ...line, x: { field: 'f'.repeat(CHART_CONFIG_FIELD_MAX + 1), type: 'category' }, orientation: 'horizontal' }, false],
  ['an explicit undefined option', { ...line, orientation: undefined }, false],
  ['an explicit undefined colour', { ...line, measures: [{ field: 'a', color: undefined }] }, false],
  ['a getter', Object.defineProperty({ ...line }, 'version', { get: () => 1, enumerable: true }), false],
  ['a hidden key', Object.defineProperty({ ...line }, 'rows', { value: [1], enumerable: false }), false],
  ['a symbol key', { ...line, [Symbol('rows')]: [1] }, false],
  ['a class instance', Object.assign(new (class Config {})(), line), false],
  ['an inherited x field', { ...line, x: Object.assign(Object.create({ field: 'time' }), { type: 'time' }) }, false],
  ['a named property on measures', { ...line, measures: Object.assign([{ field: 'a' }], { annotation: { rows: [1] } }) }, false],
  ['a measures array with its own prototype', { ...line, measures: Object.setPrototypeOf([{ field: 'a' }], { map: () => [] }) }, false],
  ['a sparse measures array', { ...line, measures: [{ field: 'a' }, , { field: 'b' }] }, false],
  ['a cyclic measures array', (() => { const measures: unknown[] = [{ field: 'a' }]; measures.push(measures); return { ...line, measures }; })(), false],
  ['repeated measure', { ...line, measures: [{ field: 'a' }, { field: 'a' }] }, false, 'config.measures fields must be distinct'],
  ['split with two measures', { ...bar, split: { field: 'eqp' }, measures: measures(2) }, false, 'config.split needs exactly one measure'],
  ['horizontal line', { ...line, x: { field: 'lot', type: 'category' }, orientation: 'horizontal' }, false, 'config.orientation horizontal needs a bar chart on a category axis'],
  ['horizontal time bar', { ...bar, x: { field: 'time', type: 'time' }, orientation: 'horizontal' }, false, 'config.orientation horizontal needs a bar chart on a category axis'],
  ['bar with area', { ...bar, areaFill: true }, false, 'config.areaFill needs a line chart'],
  ['stacked right axis', { ...bar, stack: 'stack', measures: [{ field: 'a', axis: 'right' }] }, false, 'config.measures axis right needs a vertical, unstacked chart'],
];

describe('ChartConfig v1: wire schema and @ap/contracts agree (#2745)', () => {
  it('pins the literal copies of the limits and colours', () => {
    expect([CHART_CONFIG_COLORS, CHART_CONFIG_MEASURES_MAX, CHART_CONFIG_FIELD_MAX, CHART_CONFIG_DECIMALS_MAX]).toEqual([SDK_COLORS, SDK_MEASURES, SDK_FIELD, SDK_DECIMALS]);
  });

  it.each(cases)('%s', (_label, config, valid, message) => {
    const parsed = chartConfigSchema.safeParse(config);
    expect(parsed.success).toBe(valid);
    expect(invalidChartConfig(config) === null).toBe(valid);
    if (!valid && !message) expect(parsed.error?.issues.some(issue => issue.code === 'custom' && issue.message !== 'must be plain JSON data')).toBe(false);
    if (message) {
      expect(invalidChartConfig(config)).toBe(message);
      expect(parsed.error?.issues.map(issue => `config.${issue.path.join('.')} ${issue.message}`)).toEqual([message]);
    }
  });

  it('names the stored path in SDK messages', () => {
    expect(invalidChartConfig({ ...line, points: [] }, 'panels.instances[0].source.config')).toBe('panels.instances[0].source.config.points is not a chart config key');
  });
});
