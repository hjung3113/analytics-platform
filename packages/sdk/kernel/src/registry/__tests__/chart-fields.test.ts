import { describe, expect, expectTypeOf, it } from 'vitest';
import { chartFieldMeta, chartPanelProblem, createChartPanel, menuPermission, nextChartPanelId, readChartPanel, readMenuViewPanels, type ChartPanelDraft, type ChartPermissionCheck, type MenuChartFields, type PanelInstance } from '@ap/contracts';
import * as contracts from '@ap/contracts';

const chartFieldsFixture: MenuChartFields = {
  time: { field: 'at', label: { ko: '시각', en: 'Time' } },
  breakdowns: [
    { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, dimension: 'equipmentId' },
    { id: 'module', label: { ko: '모듈', en: 'Module' }, dimension: 'moduleId' },
  ],
  measures: [
    { id: 'runTime', label: { ko: '가동 시간', en: 'Run time' }, unit: 'h', reaggregation: 'sum' },
    { id: 'cycle', label: { ko: '평균 사이클', en: 'Mean cycle' }, unit: 's', reaggregation: 'none', breakdowns: ['equipment'], metricVersion: 'v2' },
    { id: 'yield', label: { ko: '수율', en: 'Yield' }, unit: '%', reaggregation: 'ratioOfSums', permission: menuPermission('yield:view') },
  ],
};
const fields = chartFieldsFixture;
const all = () => true;
const made = (draft: ChartPanelDraft, id = 'chart-1'): PanelInstance => {
  const result = createChartPanel(fields, draft, id, all);
  if (result.status !== 'ok') throw new Error(result.problem.code);
  return result.instance;
};

describe('chart mapping slots (#2762)', () => {
  it.each([
    ['measure', { kind: 'breakdown', id: 'unknown' }, { ko: '지표 칸에는 지표만 놓을 수 있습니다', en: 'Only measures can go in the measure slot' }],
    ['breakdown', { kind: 'measure', id: 'unknown' }, { ko: '기준 칸에는 기준만 놓을 수 있습니다', en: 'Only breakdowns can go in the breakdown slot' }],
  ] as const)('checks the %s slot kind before chart validation', (slot, chip, reason) => {
    expect(contracts.mappingSlotProblem(fields, { kind: 'bar' }, slot, chip, all)).toEqual(reason);
  });

  it('uses the chart permission reason', () => {
    expect(contracts.mappingSlotProblem(fields, { kind: 'bar' }, 'measure', { kind: 'measure', id: 'yield' }, () => false)?.ko)
      .toBe('이 지표를 볼 권한이 없습니다');
  });

  it('uses the reason for a breakdown the measure does not offer', () => {
    expect(contracts.mappingSlotProblem(fields, { kind: 'bar', measure: 'cycle' }, 'breakdown', { kind: 'breakdown', id: 'module' }, all)?.ko)
      .toBe('이 지표는 이 기준으로 볼 수 없습니다');
  });

  it('uses the line chart time requirement even for one slot', () => {
    expect(contracts.mappingSlotProblem({ ...fields, time: undefined }, { kind: 'line' }, 'measure', { kind: 'measure', id: 'runTime' }, all)?.ko)
      .toBe('선 차트는 시간 축이 있는 메뉴에서만 만들 수 있습니다');
  });

  it.each([undefined, 'equipment'])('allows placing a measure with breakdown %s', breakdown => {
    expect(contracts.mappingSlotProblem(fields, { kind: 'bar', breakdown }, 'measure', { kind: 'measure', id: 'runTime' }, all))
      .toBeUndefined();
  });

  it.each([undefined, 'runTime'])('fills or replaces the measure %s while preserving the other settings', measure => {
    const draft = { kind: 'line', measure, breakdown: 'equipment', stack: 'stack' } as const;
    expect(contracts.assignMappingSlot(draft, 'measure', { kind: 'measure', id: 'cycle' }))
      .toEqual({ kind: 'line', measure: 'cycle', breakdown: 'equipment', stack: 'stack' });
    expect(draft.measure).toBe(measure);
  });

  it('keeps the draft intact when the chip belongs to the other slot', () => {
    const draft = { kind: 'bar', measure: 'cycle', breakdown: 'equipment' } as const;
    expect(contracts.assignMappingSlot(draft, 'measure', { kind: 'breakdown', id: 'module' })).toEqual(draft);
  });
});

describe('chart panels from declared measures and breakdowns (#2761)', () => {
  it('judges each choice with the reason the picker and the settings drawer show', () => {
    const problem = (draft: ChartPanelDraft, granted = all) => chartPanelProblem(fields, draft, granted)?.code ?? null;
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'module' })).toBeNull();
    expect(problem({ kind: 'line', measure: 'runTime', breakdown: 'equipment', stack: 'stack' })).toBeNull();
    expect(problem({ kind: 'bar' })).toBe('incomplete');
    expect(problem({ kind: 'bar', measure: 'gone' })).toBe('unknown-measure');
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'gone' })).toBe('unknown-breakdown');
    expect(problem({ kind: 'bar', measure: 'cycle', breakdown: 'module' })).toBe('breakdown-not-offered');
    expect(problem({ kind: 'line', measure: 'cycle', breakdown: 'equipment', stack: 'stack' })).toBe('not-additive');
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'module', stack: 'stack' })).toBe('stack-needs-series');
    expect(problem({ kind: 'bar', measure: 'yield', breakdown: 'module' }, () => false)).toBe('measure-denied');
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'module' }, () => false)).toBeNull();
    // A measure chip is judged alone: it never blames a breakdown the user has not picked.
    expect(problem({ kind: 'bar', measure: 'cycle' })).toBe('incomplete');
    expect(chartPanelProblem({ ...fields, time: undefined }, { kind: 'line', measure: 'runTime', breakdown: 'module' }, all)?.code).toBe('needs-time');
    expect(chartPanelProblem(fields, { kind: 'bar', measure: 'cycle', breakdown: 'module' }, all)?.reason).toEqual({ ko: '이 지표는 이 기준으로 볼 수 없습니다', en: 'This measure cannot be broken down this way' });
  });

  it('makes a storable chart instance that reopens with the default title «지표 · 기준»', () => {
    const line = made({ kind: 'line', measure: 'runTime', breakdown: 'equipment', stack: 'stack' }, nextChartPanelId(['chart-1', 'chart-3']));
    expect(line).toEqual({
      id: 'chart-2', inputs: [], outputs: [],
      source: { kind: 'chart', config: { version: 1, kind: 'line', x: { field: 'at', type: 'time' }, measures: [{ field: 'runTime' }], split: { field: 'equipment' }, stack: 'stack' } },
    });
    const bar = made({ kind: 'bar', measure: 'cycle', breakdown: 'equipment' });
    expect(bar.outputs).toEqual([{ key: 'selection', dimension: 'equipmentId', shape: 'set' }]);
    expect(readMenuViewPanels({ version: 1, instances: [line, bar] }).status).toBe('ok');
    expect(readChartPanel(fields, bar, all)).toMatchObject({ status: 'ok', kind: 'bar', title: { ko: '평균 사이클 · 설비', en: 'Mean cycle · Equipment' } });
    expect(readChartPanel(fields, line, all)).toMatchObject({ status: 'ok', kind: 'line', title: { en: 'Run time · Equipment' } });
    expect(createChartPanel(fields, { kind: 'bar', measure: 'cycle', breakdown: 'module' }, 'chart-1', all)).toMatchObject({ status: 'problem', problem: { code: 'breakdown-not-offered' } });
    for (const id of ['chart.1', ' ', 'c'.repeat(201), 'chart\u0000']) expect(() => createChartPanel(fields, { kind: 'bar', measure: 'runTime', breakdown: 'module' }, id, all)).toThrow(/createChartPanel/);
  });

  it('opens a saved chart only when it is exactly what the menu makes now; otherwise that panel gets the reason', () => {
    const line = made({ kind: 'line', measure: 'runTime', breakdown: 'equipment' });
    const bar = made({ kind: 'bar', measure: 'runTime', breakdown: 'equipment' });
    const config = (instance: PanelInstance) => (instance.source.kind === 'chart' ? instance.source.config : (null as never));
    const code = (instance: Pick<PanelInstance, 'source' | 'outputs'>, declared: MenuChartFields | undefined = fields, granted = all) => {
      const read = readChartPanel(declared, instance, granted);
      return read.status === 'ok' ? 'ok' : read.problem.code;
    };
    expect(code(line, { ...fields, measures: fields.measures.slice(1) })).toBe('unknown-measure');
    expect(code(line, { ...fields, breakdowns: fields.breakdowns.slice(1) })).toBe('unknown-breakdown');
    expect(readChartPanel(undefined, line, all)).toMatchObject({ status: 'problem', problem: { code: 'unknown-measure' } });
    expect(code(made({ kind: 'bar', measure: 'yield', breakdown: 'module' }), fields, () => false)).toBe('measure-denied');
    expect(code(line, { ...fields, time: { field: 'day', label: { ko: '일', en: 'Day' } } })).toBe('changed');
    expect(code(bar, { ...fields, breakdowns: [{ ...fields.breakdowns[0]!, dimension: 'assetId' }, fields.breakdowns[1]!] })).toBe('changed');
    const changed = [
      { ...bar, source: { kind: 'chart' as const, config: { ...config(bar), split: { field: 'module' } } } },
      { ...line, source: { kind: 'chart' as const, config: { ...config(line), x: { field: 'at', type: 'category' as const } } } },
      { ...line, source: { kind: 'chart' as const, config: { ...config(line), measures: [{ field: 'runTime', axis: 'right' as const }] } } },
      { ...line, source: { kind: 'chart' as const, config: { ...config(line), stack: 'percent' as const, valueFormat: { kind: 'percent' as const } } } },
      { ...bar, source: { kind: 'chart' as const, config: { ...config(bar), measures: [{ field: 'runTime' }, { field: 'cycle' }] } } },
      { ...bar, outputs: [] },
      { ...bar, source: { kind: 'declared' as const, panel: 'summary' } },
    ];
    for (const instance of changed) expect(code(instance)).toBe('changed');
    const withoutSplit = { ...config(line) };
    delete withoutSplit.split;
    expect(code({ ...line, source: { kind: 'chart', config: withoutSplit } })).toBe('changed');
    // Key order does not matter, at any depth.
    const reordered = JSON.parse('{"outputs":[{"shape":"set","dimension":"equipmentId","key":"selection"}],"source":{"config":{"measures":[{"field":"runTime"}],"x":{"type":"category","field":"equipment"},"kind":"bar","version":1},"kind":"chart"}}') as PanelInstance;
    expect(code(reordered)).toBe('ok');
  });

  it('requires the permission check and offers no percent stack, by type', () => {
    expectTypeOf<Parameters<typeof chartPanelProblem>>().toEqualTypeOf<[MenuChartFields, ChartPanelDraft, ChartPermissionCheck]>();
    expectTypeOf<Parameters<typeof createChartPanel>>().toEqualTypeOf<[MenuChartFields, ChartPanelDraft, string, ChartPermissionCheck]>();
    expectTypeOf<Parameters<typeof readChartPanel>>().toEqualTypeOf<[MenuChartFields | undefined, Pick<PanelInstance, 'source' | 'outputs'>, ChartPermissionCheck]>();
    expectTypeOf<ChartPanelDraft['stack']>().toEqualTypeOf<'none' | 'stack' | undefined>();
  });

  it('gives the drawing field meta in the chosen language', () => {
    expect(chartFieldMeta(fields, 'en')).toEqual({
      at: { label: 'Time' }, equipment: { label: 'Equipment' }, module: { label: 'Module' },
      runTime: { label: 'Run time', unit: 'h', reaggregation: 'sum' },
      cycle: { label: 'Mean cycle', unit: 's', reaggregation: 'none', metricVersion: 'v2' },
      yield: { label: 'Yield', unit: '%', reaggregation: 'ratioOfSums' },
    });
  });
});
