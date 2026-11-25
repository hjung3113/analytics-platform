import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { chartFieldMeta, chartPanelProblem, createChartPanel, groupId, menuPermission, nextChartPanelId, readChartPanel, readMenuViewPanels, spaceId, type ChartConfig, type MenuChartFields, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef, type MenuEntry } from '../registry';

const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: groupId('metrics'), label: { ko: '지표', en: 'Metrics' }, icon: House, space: spaceId('mars') }];
const spaces: SpaceDef[] = [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'catalog' }];
const fields: MenuChartFields = {
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
const register = (chartFields: unknown) => createRegistry({
  spaces, groups, permissions: [menuPermission('metrics:view')],
  menus: [{
    id: 'catalog', group: groupId('metrics'), label: { ko: 'c', en: 'c' }, description: { ko: '', en: '' }, path: '/metrics', icon: House, primary: true,
    permission: menuPermission('metrics:view'), requiresScope: false, context: none, pageType: 'catalog',
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], chartFields,
  } as MenuEntry],
});

describe('chart fields (#2761)', () => {
  it('judges each choice with the reason the picker and the settings drawer show', () => {
    const problem = (draft: Parameters<typeof chartPanelProblem>[1], granted?: (p: string) => boolean) => chartPanelProblem(fields, draft, granted)?.code ?? null;
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'module' })).toBeNull();
    expect(problem({ kind: 'line', measure: 'runTime', breakdown: 'equipment', stack: 'stack' })).toBeNull();
    expect(problem({ kind: 'bar' })).toBe('incomplete');
    expect(problem({ kind: 'bar', measure: 'gone' })).toBe('unknown-measure');
    expect(problem({ kind: 'bar', measure: 'runTime', breakdown: 'gone' })).toBe('unknown-breakdown');
    expect(problem({ kind: 'bar', measure: 'cycle', breakdown: 'module' })).toBe('breakdown-not-offered');
    expect(problem({ kind: 'line', measure: 'cycle', breakdown: 'equipment', stack: 'stack' })).toBe('not-additive');
    expect(problem({ kind: 'bar', measure: 'yield', breakdown: 'module' }, () => false)).toBe('measure-denied');
    expect(problem({ kind: 'bar', measure: 'yield', breakdown: 'module' }, () => true)).toBeNull();
    // A measure chip is dimmed for the measure alone, never for a breakdown the user has not picked.
    expect(problem({ kind: 'bar', measure: 'cycle' })).toBe('incomplete');
    expect(chartPanelProblem({ ...fields, time: undefined }, { kind: 'line', measure: 'runTime', breakdown: 'module' })?.code).toBe('needs-time');
    expect(chartPanelProblem(fields, { kind: 'bar', measure: 'cycle', breakdown: 'module' })?.reason).toEqual({ ko: '이 지표는 이 기준으로 볼 수 없습니다', en: 'This measure cannot be broken down this way' });
  });

  it('makes a storable chart instance that reopens with the default title «지표 · 기준»', () => {
    const line = createChartPanel(fields, { kind: 'line', measure: 'runTime', breakdown: 'equipment' }, nextChartPanelId(['chart-1', 'chart-3']));
    expect(line).toEqual({ status: 'ok', instance: {
      id: 'chart-2', inputs: [], outputs: [],
      source: { kind: 'chart', config: { version: 1, kind: 'line', x: { field: 'at', type: 'time' }, measures: [{ field: 'runTime' }], split: { field: 'equipment' } } },
    } });
    const bar = createChartPanel(fields, { kind: 'bar', measure: 'cycle', breakdown: 'equipment' }, 'chart-1');
    if (bar.status !== 'ok' || line.status !== 'ok') throw new Error('expected ok');
    expect(bar.instance.outputs).toEqual([{ key: 'selection', dimension: 'equipmentId', shape: 'set' }]);
    expect(readMenuViewPanels({ version: 1, instances: [line.instance, bar.instance] }).status).toBe('ok');
    const reopened = readChartPanel(fields, bar.instance.source.kind === 'chart' ? bar.instance.source.config : (null as never));
    expect(reopened).toMatchObject({ status: 'ok', kind: 'bar', title: { ko: '평균 사이클 · 설비', en: 'Mean cycle · Equipment' } });
    expect(createChartPanel(fields, { kind: 'bar', measure: 'cycle', breakdown: 'module' }, 'chart-1')).toMatchObject({ status: 'problem', problem: { code: 'breakdown-not-offered' } });
  });

  it('reopens a chart whose measure, breakdown or time field the menu dropped as a problem for that panel only', () => {
    const config: ChartConfig = { version: 1, kind: 'line', x: { field: 'at', type: 'time' }, measures: [{ field: 'runTime' }], split: { field: 'equipment' } };
    expect(readChartPanel({ ...fields, measures: fields.measures.slice(1) }, config)).toMatchObject({ status: 'problem', problem: { code: 'unknown-measure' } });
    expect(readChartPanel({ ...fields, breakdowns: fields.breakdowns.slice(1) }, config)).toMatchObject({ status: 'problem', problem: { code: 'unknown-breakdown' } });
    expect(readChartPanel({ ...fields, time: { field: 'day', label: { ko: '일', en: 'Day' } } }, config)).toMatchObject({ status: 'problem', problem: { code: 'needs-time' } });
    expect(readChartPanel(undefined, config)).toMatchObject({ status: 'problem', problem: { code: 'unknown-measure' } });
    expect(readChartPanel(fields, { ...config, measures: [{ field: 'runTime' }, { field: 'yield' }], split: undefined } as ChartConfig)).toMatchObject({ status: 'problem' });
  });

  it('gives the drawing field meta in the chosen language', () => {
    expect(chartFieldMeta(fields, 'en')).toEqual({
      at: { label: 'Time' }, equipment: { label: 'Equipment' }, module: { label: 'Module' },
      runTime: { label: 'Run time', unit: 'h', reaggregation: 'sum' },
      cycle: { label: 'Mean cycle', unit: 's', reaggregation: 'none', metricVersion: 'v2' },
      yield: { label: 'Yield', unit: '%', reaggregation: 'ratioOfSums' },
    });
  });

  it('registers a valid declaration and leaves a menu without one as it is', () => {
    expect(() => register(fields)).not.toThrow();
    expect(() => register(undefined)).not.toThrow();
  });

  it.each([
    [{ ...fields, measures: [] }, /at least one measure/],
    [{ ...fields, breakdowns: [...fields.breakdowns, { id: 'runTime', label: { ko: 'x', en: 'x' }, dimension: 'x' }] }, /duplicate field "runTime"/],
    [{ ...fields, time: { field: 'equipment', label: { ko: 'x', en: 'x' } } }, /duplicate field "equipment"/],
    [{ ...fields, breakdowns: [{ id: 'a/b', label: { ko: 'x', en: 'x' }, dimension: 'x' }] }, /breakdown id/],
    [{ ...fields, breakdowns: [{ id: 'b', label: { ko: 'x', en: 'x' }, dimension: ' ' }] }, /dimension/],
    [{ ...fields, measures: [{ ...fields.measures[0], unit: '' }] }, /unit/],
    [{ ...fields, measures: [{ ...fields.measures[0], reaggregation: 'avg' }] }, /reaggregation/],
    [{ ...fields, measures: [{ ...fields.measures[0], label: { ko: '', en: 'x' } }] }, /label/],
    [{ ...fields, measures: [{ ...fields.measures[0], permission: 'yield' }] }, /permission/],
    [{ ...fields, measures: [{ ...fields.measures[0], breakdowns: ['line'] }] }, /unknown breakdown "line"/],
  ])('rejects a malformed declaration %#', (chartFields, message) => {
    expect(() => register(chartFields)).toThrow(message);
  });
});
