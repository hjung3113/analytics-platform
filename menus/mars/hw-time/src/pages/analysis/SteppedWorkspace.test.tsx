// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { answer, renderOverview, requests, settle } from './test-support';

const chart = (id = 'hw-current') => JSON.parse(screen.getByTestId(id).textContent!);
const config = () => JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!);
const tree = () => screen.getByRole('tree', { name: '계층' });
const node = (name: string) => within(tree()).getAllByText(name, { exact: true })[0]!;
const addButton = () => within(screen.getByTestId('workspace-actions')).getByRole('button', { name: /패널 추가/ });
async function add(title: string) {
  fireEvent.keyDown(addButton(), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: title }));
  await settle();
}
beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('HW Time approved stepped workspace', () => {
  it.each(['&drillModule=PM2', '&trend=PM2/Pump'])('adds and pins a distribution tab with target %s', async target => {
    await renderOverview(`&moduleType=PM&drillMotion=Pump${target}`, request => request.endpoint === 'hwTime.distribution'
      ? { ...answer(request), data: { bins: [{ start: 3, end: 4, count: 576 }], total: 576, equipment: 24, bounds: { lower: null, upper: null } } }
      : answer(request));
    expect(requests.some(request => request.endpoint === 'hwTime.distribution')).toBe(false);
    await add('분포 · 히스토그램');
    await screen.findByTestId('hw-overview-distribution');
    expect(chart('hw-overview-distribution')).toMatchObject({ kind: 'histogram', bins: [{ start: 3, end: 4, count: 576 }] });
    expect(config().ids).toContain('distribution');
    expect(config().placement.distribution).toBeUndefined();
    expect(config().pins.distribution).toBe(true);
    expect(requests.find(request => request.endpoint === 'hwTime.distribution')?.params).toEqual({ moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump' });
    fireEvent.click(screen.getByRole('button', { name: 'pin distribution' }));
    expect(config().pins.distribution).toBe(false);
  });
  it('disables the distribution add item without a run target', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump');
    fireEvent.keyDown(addButton(), { key: 'Enter' });
    expect((await screen.findByRole('menuitem', { name: /분포 · 히스토그램/ })).getAttribute('aria-disabled')).toBe('true');
    expect(requests.some(request => request.endpoint === 'hwTime.distribution')).toBe(false);
  });
  it('restores a pinned distribution and hides unchecked Motion without another request', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&pins=distribution', request => request.endpoint === 'hwTime.distribution'
      ? { ...answer(request), data: { bins: [{ start: 3, end: 4, count: 576 }], total: 576, equipment: 24, bounds: { lower: null, upper: null } } }
      : answer(request));
    const histogram = await screen.findByTestId('hw-overview-distribution');
    expect(config().pins.distribution).toBe(true);
    const count = requests.filter(request => request.endpoint === 'hwTime.distribution').length;
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' }));
    await settle();
    expect(histogram.closest('[hidden]')).toBeTruthy();
    expect(requests.filter(request => request.endpoint === 'hwTime.distribution')).toHaveLength(count);
  });
  it.each([
    ['', 1, ['tree', 'current'], true],
    ['&moduleType=TR', 2, ['tree', 'previous', 'current'], true],
    ['&moduleType=PM&drillMotion=Pump', 3, ['tree', 'previous', 'current'], false],
    ['&moduleType=PM&drillMotion=Pump&drillModule=PM2', 4, ['tree', 'previous', 'current', 'trend'], false],
  ] as const)('restores %s with only its defaults', async (search, step, ids, legend) => {
    await renderOverview(search);
    expect(config().ids).toEqual(ids); expect(config().persistKey).toBe(`hw-time-s${step}-v1`);
    expect(config().primary).toBe('current'); expect(chart().legend).toBe(legend);
    expect(addButton()).toBeTruthy();
    const current = within(screen.getByRole('region', { name: 'panel current' }));
    for (const name of ['정렬: 원래 순서', '최소·최대: 끔', '시작 맞춤: 끔']) expect(current.getByRole('button', { name })).toBeTruthy();
    expect(current.queryByRole('radio', { name: '설비 › Module' }) !== null).toBe(step === 2 || step === 3);
    expect(screen.queryByTestId('hw-time-filter-panel')).toBeNull();
    if (step === 4) {
      await screen.findByTestId('hw-overview-trend');
      expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
      expect(chart().series[0].points.map(([x]: [string]) => x)).toEqual(['EQ-001', 'EQ-002']);
      expect(config().placement.trend).toBe('below');
    }
  });
  it('drills tree names in one path write without changing checks, and Module checks agree under every Motion', async () => {
    await renderOverview();
    fireEvent.click(node('PM')); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Chuck');
    fireEvent.click(node('Pump')); await settle();
    fireEvent.click(node('PM2')); await settle();
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBe('PM2');
    expect(within(tree()).getByText('현재')).toBeTruthy();
    fireEvent.click(within(tree()).getByRole('button', { name: 'Chuck 펼치기' }));
    const checks = within(tree()).getAllByRole('checkbox', { name: 'PM2' });
    expect(checks).toHaveLength(2);
    fireEvent.click(checks[0]!); await settle();
    for (const check of within(tree()).getAllByRole('checkbox', { name: 'PM2' })) expect(check.getAttribute('aria-checked')).toBe('false');
    expect(new URLSearchParams(window.location.search).has('module')).toBe(false);
  });
  it('Motion branch checks use the existing repeated filter and leave the Module checks selected', async () => {
    await renderOverview('&moduleType=PM');
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).not.toContain('Pump');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    for (const name of ['PM1', 'PM2', 'PM3', 'PM4']) expect(within(tree()).getByRole('checkbox', { name }).getAttribute('aria-checked')).toBe('true');
    expect(new URLSearchParams(window.location.search).has('motion')).toBe(false);
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Pump');
  });
  it('with one checked Module, the Motion branch and its leaf change different filter keys', async () => {
    await renderOverview('&moduleType=PM&module=PM2');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('true');
    expect(chart().series.map((series: { id: string }) => series.id)).not.toContain('Pump');
    expect(chart().series[0].points.map(([x]: [string]) => x)).toEqual(['EQ-001 · PM2', 'EQ-002 · PM2']);
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'PM2' })); await settle();
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'Chuck' }).getAttribute('aria-checked')).toBe('true');
  });
  it('type checks aggregate only Motions, and toggling a type keeps its Module selections', async () => {
    await renderOverview('&moduleType=PM&module=PM2');
    const check = (name: string) => within(tree()).getByRole('checkbox', { name });
    expect(check('PM').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(check('Pump')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(check('PM')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(check('PM')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    expect(check('PM2').getAttribute('aria-checked')).toBe('true');
    expect(check('PM1').getAttribute('aria-checked')).toBe('false');
    expect(check('TR').getAttribute('aria-checked')).toBe('true');
  });
  it('show all restores both filter axes after every leaf is excluded', async () => {
    await renderOverview('&moduleType=PM&module=~none&motion=~none');
    fireEvent.click(screen.getByRole('button', { name: '모두 보이기' })); await settle();
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('true');
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Pump');
    expect(chart().series[0].points.map(([x]: [string]) => x)).toContain('EQ-001 · PM2');
  });
  it('writes toolbar options, preserves them across steps, and shares grammar with the previous chart', async () => {
    await renderOverview('&moduleType=PM&barsSort=total-desc&barsGroup=module&barsMinMax=1&align=1');
    expect(chart()).toMatchObject({ minMax: true, startAlign: true });
    expect(chart('hw-previous')).toMatchObject({ minMax: true, startAlign: true });
    expect(chart().rowGroups.header).toBe('Module');
    fireEvent.keyDown(screen.getByRole('button', { name: '정렬: 합 큰 순' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '합 작은 순' })); await settle();
    expect(screen.getByRole('button', { name: '정렬: 합 작은 순' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '설비 › Module' }));
    expect(chart().rowGroups.header).toBe('설비');
    fireEvent.click(screen.getByRole('button', { name: '최소·최대: 켬' }));
    expect(chart().minMax).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '시작 맞춤: 켬' }));
    expect(chart().startAlign).toBe(false);
    fireEvent.click(node('Pump')); await settle();
    expect(chart()).toMatchObject({ minMax: false, startAlign: false });
  });
  it.each(['barsSort=bad', 'barsGroup=bad', 'barsMinMax=0', 'align=true', 'pins=table&pins=bad', 'trend=PM1/Place', 'row=bad', 'drillModule=PM1', 'moduleType=PM&drillMotion=Pick'])('rejects %s and reads nothing before recovery', async query => {
    await renderOverview(`&${query}`, undefined, { waitForData: false });
    expect(screen.getByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy(); expect(requests).toHaveLength(0);
  });
  it('carries a pinned scatter into step 4 and fetches no unopened table or Motion table', async () => {
    // A picked point makes runs available without a Module drill.
    await renderOverview('&moduleType=PM&drillMotion=Pump&trend=PM2/Pump');
    await add('분포');
    expect(config().ids).toContain('scatter');
    fireEvent.click(node('PM2')); await settle();
    expect(config().ids).toContain('scatter'); expect(config().pins.scatter).toBe(true);
    expect(requests.some(request => ['hwTime.motionStats', 'hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint))).toBe(false);
  });
  it('drops an unpinned addition after changing steps', async () => {
    await renderOverview('&moduleType=PM');
    fireEvent.keyDown(addButton(), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /추가하면 고정/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: '원본 표' })); await settle();
    expect(config().ids).toContain('table');
    fireEvent.click(node('Pump')); await settle(); expect(config().ids).not.toContain('table');
  });
  it('adds Module-wide Motions from the cached matrix and reads the judgement table only when added', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2');
    const before = requests.length;
    await add('PM2 · Motion별');
    expect(chart('hw-module-motions').series.map((series: { id: string }) => series.id)).toContain('Chuck');
    expect(requests).toHaveLength(before);
    await add('HTM 판정 표');
    await screen.findByRole('table', { name: 'PM2 · Motion' });
    expect(requests.filter(request => request.endpoint === 'hwTime.motionStats')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Chuck 회차 보기' })); await settle();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('drillModule')).toBe('PM2'); expect(params.get('drillMotion')).toBe('Chuck');
    fireEvent.click(screen.getByRole('button', { name: 'pin moduleMotions' }));
    expect(config().pins.moduleMotions).toBe(false);
    expect(config().ids).toContain('moduleMotions');
  });
  it('double-click opens the selected point trend, single click only selects, and step 1 activation drills to the type', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'select hw-current EQ-001' }));
    expect(new URLSearchParams(window.location.search).get('row')).toBe('EQ-001');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current EQ-001' })); await settle();
    expect(new URLSearchParams(window.location.search).get('moduleType')).toBe('PM');
    expect(chart('hw-previous').activeCategory).toBe('EQ-001');
    fireEvent.click(screen.getByRole('button', { name: 'select hw-current EQ-001 · PM1' }));
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current EQ-001 · PM1' }));
    await screen.findByTestId('hw-overview-trend');
    expect(config().ids).toContain('trend'); expect(config().placement.trend).toBeUndefined();
    expect(chart().activation).toBe('dblclick');
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    expect(requests.find(request => request.endpoint === 'hwTime.runs')?.params).toMatchObject({ drillModule: 'PM1', drillMotion: 'Chuck' });
  });
  it.each(['double-click', 'point action'])('re-reveals the same target after returning to the main tab via %s', async activation => {
    await renderOverview('&moduleType=PM');
    const open = () => {
      if (activation === 'double-click') fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current EQ-001 · PM1' }));
      else fireEvent.click(screen.getByRole('button', { name: 'point action hw-current trend' }));
    };
    open();
    await screen.findByTestId('hw-overview-trend');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'trend' }).getAttribute('aria-selected')).toBe('true'));
    const first = config().revealRequest;
    const target = new URLSearchParams(window.history.state.apHidden.pairs).get('trend');
    fireEvent.click(screen.getByRole('tab', { name: 'current' }));
    expect(screen.getByRole('tab', { name: 'current' }).getAttribute('aria-selected')).toBe('true');
    open();
    await settle();
    expect(config().revealRequest.panelId).toBe('trend');
    expect(config().revealRequest.seq).toBeGreaterThan(first.seq);
    expect(screen.getByRole('tab', { name: 'trend' }).getAttribute('aria-selected')).toBe('true');
    expect(new URLSearchParams(window.history.state.apHidden.pairs).get('trend')).toBe(target);
  });
  it('offers the same drill and trend actions to keyboard point selection', async () => {
    await renderOverview('&moduleType=PM');
    expect(chart().actions).toEqual(['HTM 추세 열기', 'Chuck로 내려가기']);
    fireEvent.click(screen.getByRole('button', { name: 'point action hw-current drill' })); await settle();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBe('Chuck');
    expect(config().ids).not.toContain('trend');
    expect(chart('hw-previous').activeCategory).toBe('EQ-001 · PM1');
    await waitFor(() => expect(chart().legend).toBe(false));
  });
  it.each(['double-click', 'point action'])('step 4 %s opens the previous point trend while pinned scatter follows the drill', async activation => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&pins=scatter');
    await screen.findByTestId('hw-overview-trend');
    await screen.findByTestId('hw-overview-scatter');
    if (activation === 'double-click') fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-previous EQ-001 · PM1' }));
    else fireEvent.click(screen.getByRole('button', { name: 'point action hw-previous trend' }));
    await waitFor(() => expect(within(screen.getByTestId('hw-overview-trend')).getByRole('heading', { name: 'PM1 · Pump 일 평균' })).toBeTruthy());
    expect(new URLSearchParams(window.history.state.apHidden.pairs).get('trend')).toBe('PM1/Pump');
    expect(requests.filter(request => request.endpoint === 'hwTime.runs').map(request => request.params)).toEqual([
      expect.objectContaining({ drillModule: 'PM2', drillMotion: 'Pump' }),
      expect.objectContaining({ drillModule: 'PM1', drillMotion: 'Pump' }),
    ]);
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('heading', { name: 'PM2 · Pump 회차' })).toBeTruthy();
  });
});

 it('adds pinned panels as current-group tabs without changing step-4 row shares', async () => {
   await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=heatmap&pins=donut&pins=pareto');
   const preset = config().preset.layout;
   expect(preset.sizes).toEqual([60, 40]);
   expect(preset.children[1].panels).toEqual(['trend']);
   expect(preset.children[0].children[1].children[1].panels).toEqual(['current', 'heatmap', 'donut', 'pareto']);
   for (const id of ['heatmap', 'donut', 'pareto']) expect(config().placement[id]).toBeUndefined();
   const heatmap = chart('hw-overview-matrix');
   expect(heatmap.minRowHeight).toBe(24);
   expect(heatmap.statusDisplay).toBe('border');
 });
