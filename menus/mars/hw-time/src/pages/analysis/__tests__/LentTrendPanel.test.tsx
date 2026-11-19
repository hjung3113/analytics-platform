// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRegistry, I18nProvider, LentPanel, PlatformProvider, useLentPanel, type LentPanelProps } from '@ap/kernel';
import { memoryStorage, registerLentPanel, settleQueries, testAdapter, testMenu } from '@ap/kernel/testing';
import { emptyGlobal, groupId, menuPermission, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HW_TIME_LENT_EQUIPMENT_LIMIT, type HwTimeRuns } from '../../../endpoints';
import { lentTrendPanel } from '../../../lent-panels';
import { registry, session, answer } from '../test-support';
import LentTrendPanel from '../LentTrendPanel';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  ['loading', '불러오는 중…'],
  ['error', '데이터를 불러오지 못했습니다'],
  ['empty', '조건에 맞는 결과가 없습니다'],
] as const)('shows %s without mounting a chart', async (outcome, label) => {
  const from = '2026-09-20T00:00:00';
  const to = '2026-09-22T00:00:00';
  const inputs: LentPanelProps['inputs'] = {
    context: { ...emptyGlobal, scopeId: 'MEM', from, to, selection: ['MEM-PHOTO-0103'] },
    page: { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' },
  };
  const menuQuery = async (request: MenuQuery): Promise<ApiResponse<unknown>> => {
    if (outcome === 'loading') return new Promise(() => {});
    return { ...answer(request), outcome, data: null };
  };
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=${from}&to=${to}`);
  const adapter = testAdapter({ session: () => session, menuQuery });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><LentTrendPanel inputs={inputs} /></PlatformProvider></I18nProvider>);
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.queryByTestId('hw-time-lent-trend')).toBeNull();
});

it('uses the bound props for the run query and plots both server HTM bounds without changing the page keys', async () => {
  const selection = ['scope-equipment'];
  const from = '2026-09-20T00:00:00';
  const to = '2026-09-22T00:00:00';
  const props: LentPanelProps = {
    inputs: { context: { ...emptyGlobal, scopeId: 'MEM', from, to, selection }, page: { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' } },
    actions: <button type="button">Close</button>,
  };
  const menuQuery = vi.fn(async (request: MenuQuery): Promise<ApiResponse<unknown>> => {
    const base = answer(request);
    const judgement = { value: 3, lower: 2, upper: 4, status: 'normal' as const };
    const daily = ['2026-09-20', '2026-09-21'].map(day => ({
      id: day, equipmentId: selection[0], at: `${day}T00:00:00`, moduleId: 'LK1', motion: 'Pump',
      seconds: 3, judgement, motions: { Pump: judgement }, module: judgement,
    }));
    const data: HwTimeRuns = { daily, points: [], bounds: [], total: 2, shown: 0 };
    return { ...base, data };
  });
  const adapter = testAdapter({ session: () => session, menuQuery });
  const url = `/mars/hw-time?v=1&scopeId=MEM&from=${from}&to=${to}&moduleType=PM&drillMotion=Vent&drillModule=PM4`;
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><LentTrendPanel {...props} /></PlatformProvider></I18nProvider>);

  const chart = await screen.findByTestId('hw-time-lent-trend');
  expect(chart.textContent).toContain('"kind":"line"');
  expect(chart.textContent).toContain('"id":"scope-equipment","name":"scope-equipment"');
  expect(chart.textContent).toContain('"bounds":[["09-20",{"lower":2,"upper":4}],["09-21",{"lower":2,"upper":4}]]');
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  expect(menuQuery).toHaveBeenCalledWith(expect.objectContaining({
    endpoint: 'hwTime.runs',
    params: { equipmentId: selection[0], moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' },
  }), expect.any(AbortSignal));
  expect(window.location.pathname + window.location.search).toBe(url);
});

it.each([
  ['no equipment', '', 'Pump', 'No equipment is selected for this panel.'],
  ['more equipment than fit in a comparison', Array.from({ length: HW_TIME_LENT_EQUIPMENT_LIMIT + 1 }, (_, index) => `&selectedEquipmentIds=MEM-PHOTO-${index}`).join(''), 'Pump', 'No equipment is selected for this panel.'],
  ['a Motion outside the Module type', '&selectedEquipmentIds=EQ01', 'Purge', 'Check the panel’s required input (Motion).'],
])('denies lending for %s before mounting or querying the source', async (_case, equipment, motion, reason) => {
  const source = 'hw-time/trend';
  const component = vi.fn((props: LentPanelProps) => <LentTrendPanel {...props} />);
  registerLentPanel(source, { ...lentTrendPanel, component });
  const receiver = testMenu({
    id: 'receiver', path: '/receiver', group: groupId('hwTime'), primary: false, requiresScope: true,
    lentPanels: [{
      source,
      context: {
        scopeId: { kind: 'context', key: 'scopeId' }, time: { kind: 'context', key: 'time' },
        roomNames: { kind: 'context', key: 'roomNames' }, condition: { kind: 'context', key: 'condition' }, prcGroup: { kind: 'context', key: 'prcGroup' },
        selection: { kind: 'context', key: 'selection' },
      },
      page: {
        moduleType: { kind: 'value', key: 'moduleType' }, drillModule: { kind: 'value', key: 'module' },
        drillMotion: { kind: 'value', key: 'motion' },
      },
    }],
  });
  const testRegistry = createRegistry({
    spaces: registry.spaces, groups: registry.groups, permissions: [menuPermission('analytics:view')], menus: [...registry.menus, receiver],
  });
  const menuQuery = vi.fn(async (request: MenuQuery) => answer(request));
  const adapter = testAdapter({ session: () => session, menuQuery });
  const values = { moduleType: 'LK', module: 'LK1', motion };
  function Receiver() {
    const verdict = useLentPanel(source, values);
    return <>
      <p>{verdict.allowed ? 'allowed' : verdict.reason.kind}</p>
      {!verdict.allowed && <p>{verdict.reason.text.en}</p>}
      <LentPanel source={source} values={values} />
    </>;
  }
  window.history.replaceState(null, '', '/mars/receiver?v=1&scopeId=MEM&from=2026-09-20T00:00:00&to=2026-09-22T00:00:00' + equipment);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={testRegistry}><Receiver /></PlatformProvider></I18nProvider>);
  await settleQueries();
  expect(screen.getByText('missing-input')).toBeTruthy();
  expect(screen.getByText(reason)).toBeTruthy();
  expect(component).not.toHaveBeenCalled();
  expect(menuQuery).not.toHaveBeenCalled();
});

it.each([
  { example: 'complete', returned: 2, conflictingBounds: false },
  { example: 'partial', returned: 1, conflictingBounds: false },
  { example: 'conflicting bounds', returned: 2, conflictingBounds: true },
])('queries both selected equipment and presents the $example result', async ({ returned, conflictingBounds }) => {
  const selection = ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'];
  const equipmentLabels = { 'MEM-PHOTO-0105': 'EQ02', 'MEM-PHOTO-0103': 'EQ01' };
  const from = '2026-09-20T00:00:00';
  const to = '2026-09-22T00:00:00';
  const props: LentPanelProps = {
    inputs: { context: { ...emptyGlobal, scopeId: 'MEM', from, to, selection }, page: { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' }, display: { equipmentLabels } },
  };
  const menuQuery = vi.fn(async (request: MenuQuery): Promise<ApiResponse<unknown>> => {
    const daily = selection.slice(0, returned).flatMap((equipmentId, index) => {
      const judgement = { value: 3, lower: 2, upper: conflictingBounds && index > 0 ? 5 : 4, status: 'normal' as const };
      return ['2026-09-20', '2026-09-21'].map(day => ({
        id: day + equipmentId, equipmentId, at: `${day}T00:00:00`, moduleId: 'LK1', motion: 'Pump',
        seconds: 3, judgement, motions: { Pump: judgement }, module: judgement,
      }));
    });
    return { ...answer(request), data: { daily, points: [], bounds: [], total: daily.length, shown: 0 } satisfies HwTimeRuns };
  });
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=${from}&to=${to}`);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, menuQuery })} registry={registry}><LentTrendPanel {...props} /></PlatformProvider></I18nProvider>);

  const chart = await screen.findByTestId('hw-time-lent-trend');
  for (const [id, label] of Object.entries(equipmentLabels)) {
    if (selection.slice(0, returned).includes(id)) expect(chart.textContent).toContain(`"id":"${id}","name":"${label}"`);
  }
  if (conflictingBounds) expect(chart.textContent).not.toContain('"bounds"');
  else expect(chart.textContent).toContain('"bounds":[["09-20",{"lower":2,"upper":4}],["09-21",{"lower":2,"upper":4}]]');
  if (returned < selection.length) {
    expect(chart.textContent).not.toContain(`"id":"${selection[1]}"`);
    expect(screen.getByText('비교 설비 2대 중 1대에 일 평균 데이터가 있습니다.')).toBeTruthy();
  }
  expect(menuQuery).toHaveBeenCalledWith(expect.objectContaining({
    endpoint: 'hwTime.runs', params: expect.objectContaining({ equipmentIds: selection }),
  }), expect.any(AbortSignal));
});
